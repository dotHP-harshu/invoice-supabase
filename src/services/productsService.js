import { supabase } from './supabaseClient.js'
import { 
  syncDownProducts, 
  addProductToCache, 
  updateProductInCache, 
  deleteProductFromCache 
} from '../offline/cache.js'
import { enqueueSync } from '../offline/idb.js'
import { calculateAllRemainingStock } from './stockService.js'

export async function listProducts() {
  // Always try to get from cache first for fast loading
  const { data: cachedData } = await syncDownProducts()
  
  if (!navigator.onLine) {
    // Offline: return products with remaining equal to stock
    const offline = (cachedData ?? []).map(p => ({ ...p, remaining: Number(p.stock) }))
    return { data: offline, error: null }
  }
  
  // When online, fetch fresh data and update cache
  try {
    const { data, error } = await supabase.from('products').select('*').order('id')
    if (!error && data) {
      // Update cache with fresh data
      await syncDownProducts()
      
      // Calculate remaining stock using the stock service
      const { data: withRemaining, error: stockError } = await calculateAllRemainingStock()
      
      if (stockError) {
        // Fallback: return products with remaining = stock
        const fallback = data.map(p => ({ ...p, remaining: Number(p.stock) }))
        return { data: fallback, error: null }
      }
      
      return { data: withRemaining, error: null }
    }
    return { data: cachedData, error }
  } catch {
    return { data: cachedData, error: null }
  }
}

export async function createProduct(product) {
  if (!navigator.onLine) {
    // Add to local cache immediately
    const tempId = Date.now() // Temporary ID for offline
    const offlineProduct = { ...product, id: tempId, _offline: true }
    await addProductToCache(offlineProduct)
    
    // Queue for sync when online
    await enqueueSync({ kind: 'product:create', payload: product })
    return { data: offlineProduct, error: null }
  }
  
  try {
    const { data, error } = await supabase.from('products').insert(product).select('*').single()
    if (!error) {
      // Update local cache
      await addProductToCache(data)
    }
    return { data, error }
  } catch {
    return { error: { message: 'Failed to create product' } }
  }
}

export async function updateProduct(id, updates) {
  if (!navigator.onLine) {
    // Update local cache immediately
    await updateProductInCache(id, updates)
    
    // Queue for sync when online
    await enqueueSync({ kind: 'product:update', payload: { id, updates } })
    return { error: null }
  }
  
  try {
    const { error } = await supabase.from('products').update(updates).eq('id', id)
    if (!error) {
      // Update local cache
      await updateProductInCache(id, updates)
    }
    return { error }
  } catch {
    return { error: { message: 'Failed to update product' } }
  }
}

export async function deleteProduct(id) {
  if (!navigator.onLine) {
    // Remove from local cache immediately
    await deleteProductFromCache(id)
    
    // Queue for sync when online
    await enqueueSync({ kind: 'product:delete', payload: { id } })
    return { error: null }
  }
  
  try {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (!error) {
      // Remove from local cache
      await deleteProductFromCache(id)
    }
    return { error }
  } catch {
    return { error: { message: 'Failed to delete product' } }
  }
}

export function subscribeProducts(onChange) {
  const channel = supabase
    .channel('products-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onChange)
    .subscribe()
  return channel
}


