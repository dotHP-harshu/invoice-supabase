import { supabase } from './supabaseClient.js'

/**
 * Calculate remaining stock for a product
 * @param {number} productId - The product ID
 * @returns {Promise<{remaining: number, error: any}>}
 */
export async function calculateRemainingStock(productId) {
  try {
    // Get current stock
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single()
    
    if (productError) return { remaining: 0, error: productError }
    
    // Get total quantity used in invoices
    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .select('quantity')
      .eq('product_id', productId)
    
    if (itemsError) return { remaining: product.stock, error: null }
    
    const totalUsed = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const remaining = Number(product.stock) - totalUsed
    
    // Allow negative stock - don't use Math.max(0, remaining)
    return { remaining, error: null }
  } catch (error) {
    return { remaining: 0, error }
  }
}

/**
 * Calculate remaining stock for all products
 * @returns {Promise<{data: Array, error: any}>}
 */
export async function calculateAllRemainingStock() {
  try {
    // Get all products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
    
    if (productsError) return { data: [], error: productsError }
    
    // Get all invoice items
    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .select('product_id, quantity')
    
    if (itemsError) {
      // Fallback: return products with remaining = stock
      const fallback = products.map(p => ({ ...p, remaining: Number(p.stock) }))
      return { data: fallback, error: null }
    }
    
    // Calculate used quantities per product
    const usedByProduct = new Map()
    for (const item of items) {
      const pid = item.product_id
      const used = usedByProduct.get(pid) || 0
      usedByProduct.set(pid, used + Number(item.quantity || 0))
    }
    
    // Calculate remaining stock for each product (allow negative)
    const withRemaining = products.map(p => {
      const stock = Number(p.stock || 0)
      const used = usedByProduct.get(p.id) || 0
      const remaining = stock - used // Remove Math.max to allow negative stock
      return { ...p, remaining }
    })
    
    return { data: withRemaining, error: null }
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Validate if there's enough stock for an invoice (now allows negative stock)
 * @param {Array} items - Array of {product_id, quantity}
 * @returns {Promise<{valid: boolean, errors: Array, warnings: Array, error: any}>}
 */
export async function validateStockForInvoice(items) {
  try {
    const errors = []
    const warnings = []
    
    for (const item of items) {
      const { remaining, error } = await calculateRemainingStock(item.product_id)
      
      if (error) {
        errors.push(`Error checking stock for product ${item.product_id}: ${error.message}`)
        continue
      }
      
      // Get product name for better messages
      const { data: product } = await supabase
        .from('products')
        .select('name')
        .eq('id', item.product_id)
        .single()
      
      const productName = product?.name || `Product ${item.product_id}`
      
      if (remaining < item.quantity) {
        // Instead of error, now it's a warning about negative stock
        const willBeNegative = remaining - item.quantity
        warnings.push(`Insufficient stock for ${productName}. Current remaining: ${remaining}, Requested: ${item.quantity}. Stock will be: ${willBeNegative}`)
      }
    }
    
    // Always valid now since we allow negative stock
    return { valid: true, errors, warnings, error: null }
  } catch (error) {
    return { valid: false, errors: [], warnings: [], error }
  }
}

/**
 * Update stock when invoice is created/updated
 * @param {Array} oldItems - Previous items (for updates)
 * @param {Array} newItems - New items
 * @returns {Promise<{success: boolean, error: any}>}
 */
export async function updateStockForInvoice(oldItems = [], newItems = []) {
  try {
    // Create maps for easy comparison
    const oldItemsMap = new Map(oldItems.map(item => [item.product_id, Number(item.quantity)]))
    const newItemsMap = new Map(newItems.map(item => [item.product_id, Number(item.quantity)]))
    
    // Get all affected product IDs
    const allProductIds = new Set([...oldItemsMap.keys(), ...newItemsMap.keys()])
    
    for (const productId of allProductIds) {
      const oldQty = oldItemsMap.get(productId) || 0
      const newQty = newItemsMap.get(productId) || 0
      const difference = newQty - oldQty
      
      if (difference !== 0) {
        // Update the product's stock (this is just for tracking, actual stock remains the same)
        // The remaining stock is calculated dynamically from invoice_items
      }
    }
    
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}

/**
 * Restore stock when invoice is deleted
 * @param {Array} items - Items from deleted invoice
 * @returns {Promise<{success: boolean, error: any}>}
 */
export async function restoreStockForDeletedInvoice(items) {
  try {
    // When an invoice is deleted, the stock is automatically restored
    // because the remaining stock is calculated from invoice_items
    // So we just need to log the restoration
    for (const item of items) {
      console.log(`Stock restored for product ${item.product_id}: ${item.quantity}`)
    }
    
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}
