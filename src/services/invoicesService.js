import { supabase } from './supabaseClient.js'
import { 
  syncDownInvoices, 
  syncDownInvoiceItems, 
  syncDownProducts,
  addInvoiceToCache, 
  addInvoiceItemToCache, 
  updateInvoiceInCache, 
  deleteInvoiceFromCache, 
  deleteInvoiceItemsFromCache 
} from '../offline/cache.js'
import { enqueueSync } from '../offline/idb.js'
import { jsPDF } from 'jspdf'
import { validateStockForInvoice, updateStockForInvoice, restoreStockForDeletedInvoice } from './stockService.js'
import Papa from 'papaparse'

export async function listInvoices() {
  // Always try to get from cache first for fast loading
  const { data: cachedData } = await syncDownInvoices()
  
  if (!navigator.onLine) {
    return { data: cachedData, error: null }
  }
  
  // When online, fetch fresh data and update cache
  try {
    const { data, error } = await supabase.from('invoices').select('*').order('id', { ascending: false })
    if (!error && data) {
      // Update cache with fresh data
      await syncDownInvoices()
      return { data, error: null }
    }
    return { data: cachedData, error }
  } catch {
    return { data: cachedData, error: null }
  }
}

export async function getInvoiceWithItems(invoiceId) {
  try {
    // Try to get from cache first
    const { data: cachedInvoices } = await syncDownInvoices()
    const { data: cachedItems } = await syncDownInvoiceItems()
    
    const cachedInvoice = cachedInvoices?.find(inv => inv.id === invoiceId)
    const cachedInvoiceItems = cachedItems?.filter(item => item.invoice_id === invoiceId)
    
    if (!navigator.onLine || !cachedInvoice) {
      // Use cached data or return error
      if (cachedInvoice && cachedInvoiceItems) {
        // For offline data, we need to get product info from cache
        const { data: cachedProducts } = await syncDownProducts()
        const normalized = cachedInvoiceItems.map((it) => {
          const product = cachedProducts?.find(p => p.id === it.product_id)
          return {
            id: it.id,
            product_id: it.product_id,
            quantity: it.quantity,
            product_name: product?.name || 'Unknown Product',
            price: product?.price || 0,
          }
        })
        return { data: { ...cachedInvoice, items: normalized } }
      }
      return { error: { message: 'Invoice not found' } }
    }
    
    // When online, fetch from server
    const { data: invoice, error: invErr } = await supabase.from('invoices').select('*').eq('id', invoiceId).single()
    if (invErr) return { error: invErr }
    
    const { data: items, error: itemsErr } = await supabase
      .from('invoice_items')
      .select('id, product_id, quantity, products(name, price)')
      .eq('invoice_id', invoiceId)
    if (itemsErr) return { error: itemsErr }
    
    const normalized = items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      quantity: it.quantity,
      product_name: it.products.name,
      price: it.products.price,
    }))
    
    return { data: { ...invoice, items: normalized } }
  } catch {
    return { error: { message: 'Failed to fetch invoice' } }
  }
}

export async function createInvoice(customerName, items) {
  console.log('createInvoice called with:', { customerName, items })
  console.log('Navigator online status:', navigator.onLine)
  console.log('Supabase client:', supabase)
  
  if (!navigator.onLine) {
    console.log('Offline mode - creating in cache')
    // Create in local cache immediately
    const tempId = Date.now()
    const offlineInvoice = { 
      id: tempId, 
      customer_name: customerName, 
      created_at: new Date().toISOString(),
      _offline: true 
    }
    
    await addInvoiceToCache(offlineInvoice)
    
    // Add items to cache with all necessary fields for sync
    for (const item of items) {
      const offlineItem = {
        id: Date.now() + Math.random(),
        invoice_id: tempId,
        product_id: item.product_id,
        quantity: item.quantity,
        _offline: true
        // Note: price field removed as it doesn't exist in the database schema
      }
      await addInvoiceItemToCache(offlineItem)
    }
    
    // Queue for sync when online - include all necessary data
    const syncPayload = {
      customerName,
      items: items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity
        // Note: price field removed as it doesn't exist in the database schema
      }))
    }
    
    await enqueueSync({ kind: 'invoice:create', payload: syncPayload })
    console.log('Offline invoice queued for sync:', syncPayload)
    return { data: { id: tempId } }
  }
  
  try {
    console.log('Starting invoice creation process...')
    
    // 1. Validate stock before creating invoice (now returns warnings instead of errors)
    console.log('Validating stock for items:', items)
    console.log('Items data structure:', JSON.stringify(items, null, 2))
    
    const { valid, errors, warnings, error: validationError } = await validateStockForInvoice(items)
    if (validationError) {
      console.error('Stock validation error:', validationError)
      return { error: validationError }
    }
    if (!valid) {
      console.error('Stock validation failed:', errors)
      return { error: { message: errors.join('. ') } }
    }
    console.log('Stock validation passed, warnings:', warnings)
    
    // 2. Insert invoice
    console.log('Inserting invoice for customer:', customerName)
    let inv, invoiceId
    try {
      const { data: invoiceData, error: invErr } = await supabase.from('invoices').insert({ customer_name: customerName }).select('id').single()
      if (invErr) {
        console.error('Invoice insertion error:', invErr)
        return { error: invErr }
      }
      inv = invoiceData
      invoiceId = inv.id
      console.log('Invoice created successfully:', inv)
    } catch (dbError) {
      console.error('Database error during invoice insertion:', dbError)
      return { error: { message: `Database error: ${dbError.message || dbError}` } }
    }
    
    // 3. Insert items
    console.log('Inserting invoice items:', items)
    let itemsRows
    try {
      itemsRows = items.map(i => ({ invoice_id: invoiceId, product_id: i.product_id, quantity: i.quantity }))
      console.log('Items rows to insert:', itemsRows)
      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsRows)
      if (itemsErr) {
        console.error('Items insertion error:', itemsErr)
        return { error: itemsErr }
      }
      console.log('Invoice items inserted successfully')
    } catch (dbError) {
      console.error('Database error during items insertion:', dbError)
      return { error: { message: `Database error during items insertion: ${dbError.message || dbError}` } }
    }
    
    // 4. Update stock tracking
    console.log('Updating stock tracking...')
    await updateStockForInvoice([], items)
    
    // 5. Update local cache
    console.log('Updating local cache...')
    try {
      await addInvoiceToCache({ ...inv, customer_name: customerName })
      for (const itemRow of itemsRows) {
        await addInvoiceItemToCache(itemRow)
      }
      console.log('Local cache updated successfully')
    } catch (cacheError) {
      console.warn('Cache update failed, but invoice was created successfully:', cacheError)
      // Don't fail the entire operation if cache fails
      // The invoice is already created in the database
    }
    
    // Return warnings if any (for user notification)
    console.log('Invoice creation completed successfully')
    return { data: { id: invoiceId }, warnings }
  } catch (error) {
    console.error('Error creating invoice:', error)
    return { error: { message: `Failed to create invoice: ${error.message || error}` } }
  }
}

export async function updateInvoice(invoiceId, updates) {
  if (!navigator.onLine) {
    // Update local cache immediately
    await updateInvoiceInCache(invoiceId, updates)
    
    // Queue for sync when online
    await enqueueSync({ kind: 'invoice:update', payload: { invoiceId, updates } })
    return { data: true }
  }
  
  try {
    if (updates.customer_name !== undefined) {
      const { error } = await supabase.from('invoices').update({ customer_name: updates.customer_name }).eq('id', invoiceId)
      if (error) return { error }
      await updateInvoiceInCache(invoiceId, { customer_name: updates.customer_name })
    }
    
    if (Array.isArray(updates.items)) {
      // Get current items to calculate stock changes
      const { data: currentItems } = await supabase
        .from('invoice_items')
        .select('product_id, quantity')
        .eq('invoice_id', invoiceId)
      
      // Validate new stock levels (now returns warnings)
      const { valid, errors, warnings, error: validationError } = await validateStockForInvoice(updates.items)
      if (validationError) return { error: validationError }
      if (!valid) {
        return { error: { message: errors.join('. ') } }
      }
      
      // Delete existing items
      const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
      if (delErr) return { error: delErr }
      
      // Insert new items
      const rows = updates.items.map(i => ({ 
        invoice_id: invoiceId, 
        product_id: i.product_id, 
        quantity: i.quantity
      }))
      
      const { error: insErr } = await supabase.from('invoice_items').insert(rows)
      if (insErr) return { error: insErr }
      
      // Update stock tracking
      await updateStockForInvoice(currentItems || [], updates.items)
      
      // Update local cache
      await deleteInvoiceItemsFromCache(invoiceId)
      for (const row of rows) {
        await addInvoiceItemToCache(row)
      }
    }
    
    return { data: true }
  } catch (error) {
    console.error('Error updating invoice:', error)
    return { error: { message: `Failed to update invoice: ${error.message || error}` } }
  }
}

export async function deleteInvoice(invoiceId) {
  if (!navigator.onLine) {
    // Remove from local cache immediately
    await deleteInvoiceFromCache(invoiceId)
    await deleteInvoiceItemsFromCache(invoiceId)
    
    // Queue for sync when online
    await enqueueSync({ kind: 'invoice:delete', payload: { invoiceId } })
    return { data: true }
  }
  
  try {
    // 1. Get items before deletion to restore stock
    const { data: itemsToDelete } = await supabase
      .from('invoice_items')
      .select('product_id, quantity')
      .eq('invoice_id', invoiceId)
    
    // 2. Delete invoice items
    const { error: delItemsErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
    if (delItemsErr) return { error: delItemsErr }
    
    // 3. Delete invoice
    const { error: delInvErr } = await supabase.from('invoices').delete().eq('id', invoiceId)
    if (delInvErr) return { error: delInvErr }
    
    // 4. Restore stock (stock is automatically restored when items are deleted)
    if (itemsToDelete && itemsToDelete.length > 0) {
      await restoreStockForDeletedInvoice(itemsToDelete)
    }
    
    // 5. Remove from local cache
    await deleteInvoiceFromCache(invoiceId)
    await deleteInvoiceItemsFromCache(invoiceId)
    
    return { data: true }
  } catch {
    return { error: { message: 'Failed to delete invoice' } }
  }
}

export function subscribeInvoices(onChange) {
  const channel = supabase
    .channel('invoices-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_items' }, onChange)
    .subscribe()
  return channel
}

export function exportInvoiceToPDF(invoice) {
  // Create PDF with Hindi font support and enhanced styling
  const doc = new jsPDF({ 
    unit: 'pt', 
    format: 'a4',
    putOnlyUsedFonts: true
  })
  
  // Add Hindi font support with fallback
  try {
    doc.addFont('https://fonts.gstatic.com/s/notosansdevanagari/v18/ieVc2YdFI3GCY6SyQy1KfStzYKZgzN1z0w.woff2', 'NotoSansDevanagari', 'normal')
  } catch (error) {
    console.warn('Hindi font could not be loaded, using default font:', error)
    // Continue without Hindi font - will use default font
  }
  
  const pageMargin = 40
  const contentWidth = 595.28 - pageMargin * 2
  
  // Header with gradient-like effect
  doc.setFillColor(59, 130, 246) // Blue header
  doc.rect(pageMargin, pageMargin, contentWidth, 80, 'F')
  
  // Header text
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text(`Invoice #${invoice.id}`, pageMargin + 20, pageMargin + 35)
  
  doc.setFontSize(14)
  doc.text(`Customer: ${invoice.customer_name}`, pageMargin + 20, pageMargin + 55)
  doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString('hi-IN')}`, pageMargin + 20, pageMargin + 75)
  
  // Reset text color
  doc.setTextColor(0, 0, 0)
  
  let y = pageMargin + 120
  
  // Table header with styling
  doc.setFillColor(243, 244, 246)
  doc.rect(pageMargin, y - 20, contentWidth, 30, 'F')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(55, 65, 81)
  doc.text('Product', pageMargin + 15, y)
  doc.text('Price', pageMargin + 320, y)
  doc.text('Qty', pageMargin + 420, y)
  doc.text('Subtotal', pageMargin + 480, y)
  
  // Table content
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  
  let total = 0
  y += 20
  
  invoice.items.forEach((it, index) => {
    const price = Number(it.price)
    const subtotal = price * it.quantity
    total += subtotal
    
    // Alternate row colors
    if (index % 2 === 0) {
      doc.setFillColor(249, 250, 251)
      doc.rect(pageMargin, y - 15, contentWidth, 25, 'F')
    }
    
    // Product name with Hindi support
    try {
      doc.setFont('NotoSansDevanagari', 'normal')
    } catch {
      doc.setFont('helvetica', 'normal')
    }
    doc.text(String(it.product_name), pageMargin + 15, y)
    doc.setFont('helvetica', 'normal')
    
    // Price and quantity
    doc.text(`₹${price.toFixed(2)}`, pageMargin + 320, y)
    doc.text(String(it.quantity), pageMargin + 420, y)
    doc.text(`₹${subtotal.toFixed(2)}`, pageMargin + 480, y)
    
    y += 25
  })
  
  // Total row with accent color
  doc.setFillColor(59, 130, 246)
  doc.rect(pageMargin, y - 15, contentWidth, 30, 'F')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('Total:', pageMargin + 400, y)
  doc.text(`₹${total.toFixed(2)}`, pageMargin + 480, y)
  
  // Footer with company info
  y += 50
  doc.setTextColor(107, 114, 128)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Thank you for your business!', pageMargin + 15, y)
  
  // Save with Hindi-friendly filename
  const filename = `invoice_${invoice.id}_${invoice.customer_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
  doc.save(filename)
}


