import { supabase } from '../services/supabaseClient.js'
import { 
  getSyncQueue, 
  removeFromSyncQueue, 
  updateSyncQueueItem,
  getPendingSyncCount 
} from './idb.js'
import { toast } from 'react-toastify'
import { validateStockForInvoice, updateStockForInvoice, restoreStockForDeletedInvoice } from '../services/stockService.js'

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine
    this.syncInProgress = false
    this.syncInterval = null
    this.setupEventListeners()
  }

  setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true
      this.onlineStatusChanged(true)
    })

    window.addEventListener('offline', () => {
      this.isOnline = false
      this.onlineStatusChanged(false)
    })
  }

  onlineStatusChanged(isOnline) {
    if (isOnline) {
      // Start sync when coming back online
      this.startAutoSync()
      toast.success('🟢 Back online! Syncing data...')
    } else {
      // Stop sync when going offline
      this.stopAutoSync()
      toast.warning('🔴 You are offline. Changes will be saved locally.')
    }
    
    // Dispatch custom event for UI updates
    window.dispatchEvent(new CustomEvent('connectionStatusChanged', { 
      detail: { isOnline } 
    }))
  }

  async startAutoSync() {
    if (this.syncInterval) return
    
    this.syncInterval = setInterval(async () => {
      if (this.isOnline && !this.syncInProgress) {
        await this.syncPendingChanges()
      }
    }, 10000) // Sync every 10 seconds when online
    
    // Initial sync
    await this.syncPendingChanges()
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }

  async syncPendingChanges() {
    if (this.syncInProgress || !this.isOnline) return
    
    try {
      this.syncInProgress = true
      const pendingCount = await getPendingSyncCount()
      
      if (pendingCount === 0) return
      
      
      
      const queue = await getSyncQueue()
      let successCount = 0
      let errorCount = 0
      let errorDetails = []
      
      for (const item of queue) {
        try {
          
          const success = await this.processSyncItem(item)
          if (success) {
            await removeFromSyncQueue(item.id)
            successCount++
            
          } else {
            errorCount++
            errorDetails.push(`${item.kind}: Failed to process`)
            
          }
        } catch (error) {
          
          errorCount++
          errorDetails.push(`${item.kind}: ${error.message}`)
          
          // Increment retry count
          const retryCount = (item.retryCount || 0) + 1
          await updateSyncQueueItem(item.id, { retryCount })
          
          // If item has been retried too many times, remove it from queue
          if (retryCount >= 3) {
            
            await removeFromSyncQueue(item.id)
            toast.error(`Failed to sync ${item.kind} after ${retryCount} attempts. Check data manually.`)
          }
        }
      }
      
      if (successCount > 0) {
        toast.success(`✅ Synced ${successCount} changes successfully`)
      }
      
      if (errorCount > 0) {
        const errorMessage = `❌ Failed to sync ${errorCount} changes. See errors.`
        toast.error(errorMessage)
      }
      
    } catch (error) {
      
      toast.error(`Sync failed: ${error.message}`)
    } finally {
      this.syncInProgress = false
    }
  }

  async processSyncItem(item) {
    try {
      switch (item.kind) {
        case 'product:create': {
          const { error: createError } = await supabase
            .from('products')
            .insert(item.payload)
          return !createError
        }

        case 'product:update': {
          const { error: updateError } = await supabase
            .from('products')
            .update(item.payload.updates)
            .eq('id', item.payload.id)
          return !updateError
        }

        case 'product:delete': {
          const { error: deleteError } = await supabase
            .from('products')
            .delete()
            .eq('id', item.payload.id)
          return !deleteError
        }

        case 'invoice:create': {
          try {
            // Validate stock before creating invoice
            const { valid, errors, error: validationError } = await validateStockForInvoice(item.payload.items)
            if (validationError) {
              
              return false
            }
            if (!valid) {
              
              return false
            }
            
            // Create invoice first
            const { data: invoice, error: invError } = await supabase
              .from('invoices')
              .insert({ customer_name: item.payload.customerName })
              .select('id')
              .single()
            
            if (invError) {
              
              return false
            }
            
            // Create invoice items - ensure all required fields are present
            const itemsRows = item.payload.items.map(i => ({
              invoice_id: invoice.id,
              product_id: i.product_id,
              quantity: i.quantity,
              custom_price: i.custom_price ?? null
            }))
            
            const { error: itemsError } = await supabase
              .from('invoice_items')
              .insert(itemsRows)
            
            if (itemsError) {
              
              return false
            }
            
            // Update stock tracking
            await updateStockForInvoice([], item.payload.items)
            
            
            return true
          } catch (error) {
            
            return false
          }
        }

        case 'invoice:update': {
          try {
            
            let hasErrors = false
            let errorMessages = []
            
            if (item.payload.updates.customer_name !== undefined) {
              
              const { error } = await supabase
                .from('invoices')
                .update({ customer_name: item.payload.updates.customer_name })
                .eq('id', item.payload.invoiceId)
              if (error) {
                
                hasErrors = true
                errorMessages.push(`Customer name update failed: ${error.message}`)
              } else {
                
              }
            }
            
            if (Array.isArray(item.payload.updates.items)) {
              
              
              // Get current items to calculate stock changes
              const { data: currentItems, error: fetchError } = await supabase
                .from('invoice_items')
                .select('product_id, quantity')
                .eq('invoice_id', item.payload.invoiceId)
              
              if (fetchError) {
                
                hasErrors = true
                errorMessages.push(`Failed to fetch current items: ${fetchError.message}`)
              } else {
                
              }
              
              // Validate new stock levels
              const { valid, errors, error: validationError } = await validateStockForInvoice(item.payload.updates.items)
              if (validationError) {
                
                hasErrors = true
                errorMessages.push(`Stock validation error: ${validationError.message}`)
              } else if (!valid) {
                
                hasErrors = true
                errorMessages.push(`Stock validation failed: ${errors.join('. ')}`)
              } else {
                
                
                // Delete existing items
                
                const { error: delError } = await supabase
                  .from('invoice_items')
                  .delete()
                  .eq('invoice_id', item.payload.invoiceId)
                if (delError) {
                  
                  hasErrors = true
                  errorMessages.push(`Failed to delete existing items: ${delError.message}`)
                } else {
                  
                  
                  // Insert new items - ensure all required fields are present
                  const rows = item.payload.updates.items.map(i => ({
                    invoice_id: item.payload.invoiceId,
                    product_id: i.product_id,
                    quantity: i.quantity,
                    custom_price: i.custom_price ?? null
                  }))
                  
                  
                  const { error: insError } = await supabase
                    .from('invoice_items')
                    .insert(rows)
                  if (insError) {
                    
                    hasErrors = true
                    errorMessages.push(`Failed to insert new items: ${insError.message}`)
                  } else {
                    
                    
                    // Update stock tracking
                    
                    try {
                      await updateStockForInvoice(currentItems || [], item.payload.updates.items)
                      
                    } catch (stockError) {
                      
                      // Don't fail the entire operation for stock tracking errors
                    }
                  }
                }
              }
            }
            
            if (hasErrors) {
              
              return false
            }
            
            
            // After successful sync, refresh local cache for invoices and invoice_items
            try {
              const { data: invoicesData } = await supabase
                .from('invoices')
                .select('*')
                .order('id', { ascending: false })
              if (invoicesData) {
                // Lazy import to avoid circular deps
                const cache = await import('./cache.js')
                await cache.clearStore('invoices')
                await cache.putAll('invoices', invoicesData)
              }
              const { data: itemsData } = await supabase
                .from('invoice_items')
                .select('*')
              if (itemsData) {
                const cache = await import('./cache.js')
                await cache.clearStore('invoice_items')
                await cache.putAll('invoice_items', itemsData)
              }
            } catch (refreshError) {
              console.warn('Cache refresh after invoice:update sync failed:', refreshError)
            }
            return true
          } catch (error) {
            
            return false
          }
        }

        case 'invoice:delete': {
          // Get items before deletion to restore stock
          const { data: itemsToDelete } = await supabase
            .from('invoice_items')
            .select('product_id, quantity')
            .eq('invoice_id', item.payload.invoiceId)
          
          // Delete items first
          const { error: delItemsError } = await supabase
            .from('invoice_items')
            .delete()
            .eq('invoice_id', item.payload.invoiceId)
          if (delItemsError) return false
          
          // Delete invoice
          const { error: delInvError } = await supabase
            .from('invoices')
            .delete()
            .eq('id', item.payload.invoiceId)
          if (delInvError) return false
          
          // Restore stock (stock is automatically restored when items are deleted)
          if (itemsToDelete && itemsToDelete.length > 0) {
            await restoreStockForDeletedInvoice(itemsToDelete)
          }
          
          return true
        }

        case 'invoice_item:update_price': {
          try {
            const { error } = await supabase
              .from('invoice_items')
              .update({ custom_price: item.payload.customPrice })
              .eq('id', item.payload.itemId)
              .eq('invoice_id', item.payload.invoiceId)
            return !error
          } catch (error) {
            return false
          }
        }

        default:
          
          return false
      }
    } catch (error) {
      
      return false
    }
  }

  async manualSync() {
    if (!this.isOnline) {
      toast.error('Cannot sync while offline')
      return
    }
    
    toast.info('🔄 Manual sync started...')
    await this.syncPendingChanges()
  }


  async clearFailedSyncItems() {
    try {
      const queue = await getSyncQueue()
      const failedItems = queue.filter(item => (item.retryCount || 0) >= 3)
      
      if (failedItems.length === 0) {
        toast.info('No failed sync items to clear')
        return
      }
      
      for (const item of failedItems) {
        await removeFromSyncQueue(item.id)
      }
      
      toast.success(`Cleared ${failedItems.length} failed sync items`)
      
    } catch (error) {
      
      toast.error('Failed to clear failed sync items')
    }
  }

  async getSyncQueueStatus() {
    try {
      const queue = await getSyncQueue()
      const status = {
        total: queue.length,
        pending: queue.filter(item => (item.retryCount || 0) === 0).length,
        retrying: queue.filter(item => (item.retryCount || 0) > 0 && (item.retryCount || 0) < 3).length,
        failed: queue.filter(item => (item.retryCount || 0) >= 3).length
      }
      return status
    } catch (error) {
      
      return { total: 0, pending: 0, retrying: 0, failed: 0 }
    }
  }

  async debugSyncQueue() {
    try {
      const queue = await getSyncQueue()
      
      
      if (queue.length === 0) {
        
        return
      }
      
      queue.forEach(() => {})
      
      return queue
    } catch (error) {
      
      return []
    }
  }

  async retrySpecificItem(itemId) {
    try {
      const queue = await getSyncQueue()
      const item = queue.find(q => q.id === itemId)
      
      if (!item) {
        
        return false
      }
      
      
      
      // Reset retry count
      await updateSyncQueueItem(itemId, { retryCount: 0 })
      
      // Try to process the item
      const success = await this.processSyncItem(item)
      
      if (success) {
        await removeFromSyncQueue(itemId)
        
        return true
      } else {
        
        return false
      }
    } catch (error) {
      
      return false
    }
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
      pendingCount: 0 // Will be updated by getPendingSyncCount
    }
  }

  async getPendingCount() {
    return await getPendingSyncCount()
  }
}

// Export singleton instance
export const syncManager = new SyncManager()

// Export functions for easy use
export const startAutoSync = () => syncManager.startAutoSync()
export const stopAutoSync = () => syncManager.stopAutoSync()
export const manualSync = () => syncManager.manualSync()
export const getSyncStatus = () => syncManager.getStatus()
export const clearFailedSyncItems = () => syncManager.clearFailedSyncItems()
export const getSyncQueueStatus = () => syncManager.getSyncQueueStatus()
export const debugSyncQueue = () => syncManager.debugSyncQueue()
export const retrySpecificItem = (itemId) => syncManager.retrySpecificItem(itemId)


