import { supabase } from './supabaseClient.js'
import { syncDownInvoices } from '../offline/cache.js'
import { enqueueSync } from '../offline/idb.js'
import { jsPDF } from 'jspdf'
import Papa from 'papaparse'

export async function listInvoices() {
  if (!navigator.onLine) {
    const { data } = await syncDownInvoices()
    return { data, error: null }
  }
  const { data, error } = await syncDownInvoices()
  return { data, error }
}

export async function getInvoiceWithItems(invoiceId) {
  // Fetch invoice
  const { data: invoice, error: invErr } = await supabase.from('invoices').select('*').eq('id', invoiceId).single()
  if (invErr) return { error: invErr }
  // Fetch items joined with product info
  const { data: items, error: itemsErr } = await supabase
    .from('invoice_items')
    .select('id, quantity, products(name, price)')
    .eq('invoice_id', invoiceId)
  if (itemsErr) return { error: itemsErr }
  const normalized = items.map((it) => ({
    id: it.id,
    quantity: it.quantity,
    product_name: it.products.name,
    price: it.products.price,
  }))
  return { data: { ...invoice, items: normalized } }
}

export async function createInvoice(customerName, items) {
  // Using Postgres RPC for atomicity would be ideal; for simplicity, do client-side transaction-ish flow
  if (!navigator.onLine) {
    await enqueueSync({ kind: 'invoice:create', payload: { customerName, items } })
    return { data: { queued: true } }
  }
  // 1. Validate stock
  const productIds = items.map(i => i.product_id)
  const { data: products, error: prodErr } = await supabase.from('products').select('id, stock').in('id', productIds)
  if (prodErr) return { error: prodErr }
  const idToStock = new Map(products.map(p => [p.id, p.stock]))
  for (const it of items) {
    if ((idToStock.get(it.product_id) ?? 0) < it.quantity) {
      return { error: { message: 'Insufficient stock' } }
    }
  }
  // 2. Insert invoice
  const { data: inv, error: invErr } = await supabase.from('invoices').insert({ customer_name: customerName }).select('id').single()
  if (invErr) return { error: invErr }
  const invoiceId = inv.id
  // 3. Insert items
  const itemsRows = items.map(i => ({ invoice_id: invoiceId, product_id: i.product_id, quantity: i.quantity }))
  const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsRows)
  if (itemsErr) return { error: itemsErr }
  // 4. Decrement stock
  for (const it of items) {
    const { error: upErr } = await supabase.rpc('decrement_stock', { p_product_id: it.product_id, p_qty: it.quantity })
    if (upErr) return { error: upErr }
  }
  return { data: { id: invoiceId } }
}

export async function updateInvoice(invoiceId, updates) {
  // updates: { customer_name?, items?: [{ id?, product_id, quantity, price }] }
  if (!navigator.onLine) {
    await enqueueSync({ kind: 'invoice:update', payload: { invoiceId, updates } })
    return { data: true }
  }

  if (updates.customer_name !== undefined) {
    const { error } = await supabase.from('invoices').update({ customer_name: updates.customer_name }).eq('id', invoiceId)
    if (error) return { error }
  }
  if (Array.isArray(updates.items)) {
    // naive approach: delete existing items and reinsert; in real use, diff them
    const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
    if (delErr) return { error: delErr }
    const rows = updates.items.map(i => ({ 
      invoice_id: invoiceId, 
      product_id: i.product_id, 
      quantity: i.quantity,
      price: i.price // Include price in the update
    }))
    const { error: insErr } = await supabase.from('invoice_items').insert(rows)
    if (insErr) return { error: insErr }
  }
  return { data: true }
}

export async function deleteInvoice(invoiceId) {
  if (!navigator.onLine) {
    await enqueueSync({ kind: 'invoice:delete', payload: { invoiceId } })
    return { data: true }
  }
  // 1. Fetch items
  const { data: items, error: itemsErr } = await supabase.from('invoice_items').select('product_id, quantity').eq('invoice_id', invoiceId)
  if (itemsErr) return { error: itemsErr }
  // 2. Restore stock
  for (const it of items) {
    const { error: upErr } = await supabase.rpc('increment_stock', { p_product_id: it.product_id, p_qty: it.quantity })
    if (upErr) return { error: upErr }
  }
  // 3. Delete rows
  const { error: delItemsErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
  if (delItemsErr) return { error: delItemsErr }
  const { error: delInvErr } = await supabase.from('invoices').delete().eq('id', invoiceId)
  if (delInvErr) return { error: delInvErr }
  return { data: true }
}

export function subscribeInvoices(onChange) {
  const channel = supabase
    .channel('invoices-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_items' }, onChange)
    .subscribe()
  return channel
}

export function exportInvoiceToCSV(invoice) {
  const rows = invoice.items.map(it => ({
    product: it.product_name,
    price: Number(it.price),
    quantity: it.quantity,
    subtotal: Number(it.price) * it.quantity,
  }))
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `invoice_${invoice.id}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function exportInvoiceToPDF(invoice) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageMargin = 40
  const contentWidth = 595.28 - pageMargin * 2
  const lineHeight = 18

  doc.setFillColor(248, 250, 252)
  doc.rect(pageMargin, pageMargin, contentWidth, 70, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(`Invoice #${invoice.id}`, pageMargin + 12, pageMargin + 26)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.text(`Customer: ${invoice.customer_name}`, pageMargin + 12, pageMargin + 46)
  doc.text(`Date: ${new Date(invoice.created_at).toLocaleString()}`, pageMargin + 12, pageMargin + 64)

  let y = pageMargin + 110
  // Table header
  doc.setFillColor(243, 244, 246)
  doc.rect(pageMargin, y - 16, contentWidth, 24, 'F')
  doc.setFont('helvetica', 'bold')
  doc.text('Product', pageMargin + 8, y)
  doc.text('Price', pageMargin + 300, y)
  doc.text('Qty', pageMargin + 380, y)
  doc.text('Subtotal', pageMargin + 440, y)

  doc.setFont('helvetica', 'normal')
  let total = 0
  y += 12
  invoice.items.forEach(it => {
    const price = Number(it.price)
    const subtotal = price * it.quantity
    total += subtotal
    doc.text(String(it.product_name), pageMargin + 8, y)
    doc.text(price.toFixed(2), pageMargin + 300, y, { align: 'right' })
    doc.text(String(it.quantity), pageMargin + 400, y, { align: 'right' })
    doc.text(subtotal.toFixed(2), pageMargin + 500, y, { align: 'right' })
    y += lineHeight
  })

  // Total row
  doc.setFont('helvetica', 'bold')
  doc.text('Total:', pageMargin + 400, y)
  doc.text(total.toFixed(2), pageMargin + 500, y, { align: 'right' })

  // Footer link (interactive PDF element)
  const linkY = y + 24
  doc.setTextColor(37, 99, 235)
  doc.textWithLink('View online', pageMargin + 8, linkY, { url: `https://app.example.com/invoices/${invoice.id}` })
  doc.setTextColor(0, 0, 0)

  doc.save(`invoice_${invoice.id}.pdf`)
}

export function exportInvoiceToInteractivePDF(invoice) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  const w = 595.28

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(`Invoice #${invoice.id}`, margin, margin)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text('Customer:', margin, margin + 30)
  doc.text('Date:', margin, margin + 60)

  // Add interactive text fields
  doc.addField('customer_name', 'text', { x: margin + 80, y: margin + 22, w: 240, h: 18, value: String(invoice.customer_name) })
  doc.addField('invoice_date', 'text', { x: margin + 80, y: margin + 52, w: 240, h: 18, value: new Date(invoice.created_at).toLocaleString() })

  // Add link to app
  doc.setTextColor(37, 99, 235)
  doc.textWithLink('Open in app', w - margin - 110, margin, { url: `https://app.example.com/invoices/${invoice.id}` })
  doc.setTextColor(0, 0, 0)

  // Items table headers
  let y = margin + 100
  doc.setFont('helvetica', 'bold')
  doc.text('Product', margin, y)
  doc.text('Price', margin + 280, y)
  doc.text('Qty', margin + 360, y)
  doc.text('Subtotal', margin + 440, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  let total = 0
  invoice.items.forEach((it, idx) => {
    const price = Number(it.price)
    const subtotal = price * it.quantity
    total += subtotal
    doc.text(String(it.product_name), margin, y)
    doc.text(price.toFixed(2), margin + 280, y)
    // Add interactive quantity field
    doc.addField(`qty_${idx}`, 'text', { x: margin + 350, y: y - 10, w: 40, h: 16, value: String(it.quantity) })
    doc.text(subtotal.toFixed(2), margin + 440, y)
    y += 22
  })

  doc.setFont('helvetica', 'bold')
  doc.text('Total:', margin + 360, y)
  doc.text(total.toFixed(2), margin + 440, y)

  doc.save(`invoice_${invoice.id}_interactive.pdf`)
}


