import { supabase } from './supabaseClient.js'
import { syncDownProducts } from '../offline/cache.js'
import { enqueueSync } from '../offline/idb.js'

export async function listProducts() {
  if (!navigator.onLine) {
    const { data } = await syncDownProducts()
    return { data, error: null }
  }
  const { data, error } = await syncDownProducts()
  return { data, error }
}

export async function createProduct(product) {
  if (!navigator.onLine) {
    await enqueueSync({ kind: 'product:create', payload: product })
    return { error: null }
  }
  const { error } = await supabase.from('products').insert(product)
  return { error }
}

export async function updateProduct(id, updates) {
  if (!navigator.onLine) {
    await enqueueSync({ kind: 'product:update', payload: { id, updates } })
    return { error: null }
  }
  const { error } = await supabase.from('products').update(updates).eq('id', id)
  return { error }
}

export async function deleteProduct(id) {
  if (!navigator.onLine) {
    await enqueueSync({ kind: 'product:delete', payload: { id } })
    return { error: null }
  }
  const { error } = await supabase.from('products').delete().eq('id', id)
  return { error }
}

export function subscribeProducts(onChange) {
  const channel = supabase
    .channel('products-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onChange)
    .subscribe()
  return channel
}


