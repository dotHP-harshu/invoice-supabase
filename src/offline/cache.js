import { getAll, putAll, clearStore } from './idb.js'
import { supabase } from '../services/supabaseClient.js'

export async function syncDownProducts() {
  const { data, error } = await supabase.from('products').select('*').order('id')
  if (!error && data) {
    await clearStore('products')
    await putAll('products', data)
  }
  return { data: (data ?? await getAll('products')), error }
}

export async function syncDownInvoices() {
  const { data, error } = await supabase.from('invoices').select('*').order('id', { ascending: false })
  if (!error && data) {
    await clearStore('invoices')
    await putAll('invoices', data)
  }
  return { data: (data ?? await getAll('invoices')), error }
}


