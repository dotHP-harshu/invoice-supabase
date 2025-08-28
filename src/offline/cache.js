import { getAll, putAll, clearStore, put, add, deleteItem } from './idb.js'
import { supabase } from '../services/supabaseClient.js'

export async function syncDownProducts() {
  try {
    const { data, error } = await supabase.from('products').select('*').order('id')
    if (!error && data) {
      await clearStore('products')
      await putAll('products', data)
      return { data, error: null }
    }
    // If there's an error or no data, try to get from cache
    const cachedData = await getAll('products')
    return { data: cachedData, error: error || null }
  } catch {
    // If Supabase call fails (e.g., offline), return cached data
    const cachedData = await getAll('products')
    return { data: cachedData, error: null }
  }
}

export async function syncDownInvoices() {
  try {
    const { data, error } = await supabase.from('invoices').select('*').order('id', { ascending: false })
    if (!error && data) {
      await clearStore('invoices')
      await putAll('invoices', data)
      return { data, error: null }
    }
    // If there's an error or no data, try to get from cache
    const cachedData = await getAll('invoices')
    return { data: cachedData, error: error || null }
  } catch {
    // If Supabase call fails (e.g., offline), return cached data
    const cachedData = await getAll('invoices')
    return { data: cachedData, error: null }
  }
}

export async function syncDownInvoiceItems() {
  try {
    const { data, error } = await supabase.from('invoice_items').select('*')
    if (!error && data) {
      await clearStore('invoice_items')
      await putAll('invoice_items', data)
      return { data, error: null }
    }
    const cachedData = await getAll('invoice_items')
    return { data: cachedData, error: error || null }
  } catch {
    const cachedData = await getAll('invoice_items')
    return { data: cachedData, error: null }
  }
}

// Local cache operations for offline use
export async function addProductToCache(product) {
  try {
    // Ensure the product has an id field for IndexedDB keyPath
    if (!product.id) {
      product.id = Date.now() + Math.random()
    }
    return await put('products', product)
  } catch (error) {
    console.error('Error adding product to cache:', error, product)
    throw error
  }
}

export async function updateProductInCache(id, updates) {
  const existing = await getAll('products')
  const product = existing.find(p => p.id === id)
  if (product) {
    const updated = { ...product, ...updates }
    return await put('products', updated)
  }
}

export async function deleteProductFromCache(id) {
  return await deleteItem('products', id)
}

export async function addInvoiceToCache(invoice) {
  try {
    // Ensure the invoice has an id field for IndexedDB keyPath
    if (!invoice.id) {
      invoice.id = Date.now() + Math.random()
    }
    return await put('invoices', invoice)
  } catch (error) {
    console.error('Error adding invoice to cache:', error, invoice)
    throw error
  }
}

export async function addInvoiceItemToCache(item) {
  try {
    // Ensure the item has an id field for IndexedDB keyPath
    if (!item.id) {
      item.id = Date.now() + Math.random()
    }
    return await add('invoice_items', item)
  } catch (error) {
    console.error('Error adding invoice item to cache:', error, item)
    // Fallback: try to use put instead of add
    try {
      return await put('invoice_items', item)
    } catch (putError) {
      console.error('Error with put fallback:', putError)
      throw putError
    }
  }
}

export async function updateInvoiceInCache(id, updates) {
  const existing = await getAll('invoices')
  const invoice = existing.find(inv => inv.id === id)
  if (invoice) {
    const updated = { ...invoice, ...updates }
    return await put('invoices', updated)
  }
}

export async function deleteInvoiceFromCache(id) {
  return await deleteItem('invoices', id)
}

export async function deleteInvoiceItemsFromCache(invoiceId) {
  const items = await getAll('invoice_items')
  const itemsToDelete = items.filter(item => item.invoice_id === invoiceId)
  
  for (const item of itemsToDelete) {
    await deleteItem('invoice_items', item.id)
  }
}


