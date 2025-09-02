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
      
      console.log(`Syncing ${pendingCount} pending changes...`)
      
      const queue = await getSyncQueue()
      let successCount = 0
      let errorCount = 0
      let errorDetails = []
      
      for (const item of queue) {
        try {
          console.log(`Processing sync item:`, item)
          const success = await this.processSyncItem(item)
          if (success) {
            await removeFromSyncQueue(item.id)
            successCount++
            console.log(`Successfully synced item:`, item.kind)
          } else {
            errorCount++
            errorDetails.push(`${item.kind}: Failed to process`)
            console.error(`Failed to sync item:`, item)
          }
        } catch (error) {
          console.error('Sync item error:', error, 'Item:', item)
          errorCount++
          errorDetails.push(`${item.kind}: ${error.message}`)
          
          // Increment retry count
          const retryCount = (item.retryCount || 0) + 1
          await updateSyncQueueItem(item.id, { retryCount })
          
          // If item has been retried too many times, remove it from queue
          if (retryCount >= 3) {
            console.warn(`Removing sync item after ${retryCount} failed attempts:`, item)
            await removeFromSyncQueue(item.id)
            toast.error(`Failed to sync ${item.kind} after ${retryCount} attempts. Check data manually.`)
          }
        }
      }
      
      if (successCount > 0) {
        toast.success(`✅ Synced ${successCount} changes successfully`)
      }
      
      if (errorCount > 0) {
        const errorMessage = `❌ Failed to sync ${errorCount} changes. Check console for details.`
        toast.error(errorMessage)
        console.error('Sync errors details:', errorDetails)
      }
      
    } catch (error) {
      console.error('Sync error:', error)
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
              console.error('Stock validation error during sync:', validationError)
              return false
            }
            if (!valid) {
              console.error('Stock validation failed during sync:', errors)
              return false
            }
            
            // Create invoice first
            const { data: invoice, error: invError } = await supabase
              .from('invoices')
              .insert({ customer_name: item.payload.customerName })
              .select('id')
              .single()
            
            if (invError) {
              console.error('Invoice creation error during sync:', invError)
              return false
            }
            
            // Create invoice items - ensure all required fields are present
            const itemsRows = item.payload.items.map(i => ({
              invoice_id: invoice.id,
              product_id: i.product_id,
              quantity: i.quantity
              // Note: price field removed as it doesn't exist in the database schema
            }))
            
            const { error: itemsError } = await supabase
              .from('invoice_items')
              .insert(itemsRows)
            
            if (itemsError) {
              console.error('Invoice items creation error during sync:', itemsError)
              return false
            }
            
            // Update stock tracking
            await updateStockForInvoice([], item.payload.items)
            
            console.log('Invoice sync completed successfully:', invoice.id)
            return true
          } catch (error) {
            console.error('Unexpected error during invoice sync:', error)
            return false
          }
        }

        case 'invoice:update': {
          try {
            console.log('Processing invoice:update sync item:', item.payload)
            let hasErrors = false
            let errorMessages = []
            
            if (item.payload.updates.customer_name !== undefined) {
              console.log('Syncing customer name update:', item.payload.updates.customer_name)
              const { error } = await supabase
                .from('invoices')
                .update({ customer_name: item.payload.updates.customer_name })
                .eq('id', item.payload.invoiceId)
              if (error) {
                console.error('Customer name update error during sync:', error)
                hasErrors = true
                errorMessages.push(`Customer name update failed: ${error.message}`)
              } else {
                console.log('Customer name updated successfully during sync')
              }
            }
            
            if (Array.isArray(item.payload.updates.items)) {
              console.log('Syncing invoice items update:', item.payload.updates.items)
              
              // Get current items to calculate stock changes
              const { data: currentItems, error: fetchError } = await supabase
                .from('invoice_items')
                .select('product_id, quantity')
                .eq('invoice_id', item.payload.invoiceId)
              
              if (fetchError) {
                console.error('Error fetching current items during sync:', fetchError)
                hasErrors = true
                errorMessages.push(`Failed to fetch current items: ${fetchError.message}`)
              } else {
                console.log('Current items fetched for sync:', currentItems)
              }
              
              // Validate new stock levels
              const { valid, errors, error: validationError } = await validateStockForInvoice(item.payload.updates.items)
              if (validationError) {
                console.error('Stock validation error during sync:', validationError)
                hasErrors = true
                errorMessages.push(`Stock validation error: ${validationError.message}`)
              } else if (!valid) {
                console.error('Stock validation failed during sync:', errors)
                hasErrors = true
                errorMessages.push(`Stock validation failed: ${errors.join('. ')}`)
              } else {
                console.log('Stock validation passed during sync')
                
                // Delete existing items
                console.log('Deleting existing items during sync...')
                const { error: delError } = await supabase
                  .from('invoice_items')
                  .delete()
                  .eq('invoice_id', item.payload.invoiceId)
                if (delError) {
                  console.error('Delete existing items error during sync:', delError)
                  hasErrors = true
                  errorMessages.push(`Failed to delete existing items: ${delError.message}`)
                } else {
                  console.log('Existing items deleted successfully during sync')
                  
                  // Insert new items - ensure all required fields are present
                  const rows = item.payload.updates.items.map(i => ({
                    invoice_id: item.payload.invoiceId,
                    product_id: i.product_id,
                    quantity: i.quantity
                    // Note: price field removed as it doesn't exist in the database schema
                  }))
                  
                  console.log('Inserting new items during sync:', rows)
                  const { error: insError } = await supabase
                    .from('invoice_items')
                    .insert(rows)
                  if (insError) {
                    console.error('Insert new items error during sync:', insError)
                    hasErrors = true
                    errorMessages.push(`Failed to insert new items: ${insError.message}`)
                  } else {
                    console.log('New items inserted successfully during sync')
                    
                    // Update stock tracking
                    console.log('Updating stock tracking during sync...')
                    try {
                      await updateStockForInvoice(currentItems || [], item.payload.updates.items)
                      console.log('Stock tracking updated successfully during sync')
                    } catch (stockError) {
                      console.error('Stock tracking update error during sync:', stockError)
                      // Don't fail the entire operation for stock tracking errors
                    }
                  }
                }
              }
            }
            
            if (hasErrors) {
              console.error('Invoice update sync completed with errors:', errorMessages)
              return false
            }
            
            console.log('Invoice update sync completed successfully:', item.payload.invoiceId)
            return true
          } catch (error) {
            console.error('Unexpected error during invoice update sync:', error)
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

        default:
          console.warn('Unknown sync item kind:', item.kind)
          return false
      }
    } catch (error) {
      console.error('Process sync item error:', error)
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
      console.log('Cleared failed sync items:', failedItems)
    } catch (error) {
      console.error('Error clearing failed sync items:', error)
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
      console.error('Error getting sync queue status:', error)
      return { total: 0, pending: 0, retrying: 0, failed: 0 }
    }
  }

  async debugSyncQueue() {
    try {
      const queue = await getSyncQueue()
      console.log('=== SYNC QUEUE DEBUG ===')
      console.log('Total items:', queue.length)
      
      if (queue.length === 0) {
        console.log('No items in sync queue')
        return
      }
      
      queue.forEach((item, index) => {
        console.log(`Item ${index + 1}:`, {
          id: item.id,
          kind: item.kind,
          payload: item.payload,
          retryCount: item.retryCount || 0,
          timestamp: new Date(item.timestamp).toLocaleString()
        })
        
        // Additional debugging for invoice operations
        if (item.kind === 'invoice:create' || item.kind === 'invoice:update') {
          console.log(`  - Items data:`, item.payload.items)
          console.log(`  - Items structure check:`, item.payload.items?.map(i => ({
            has_product_id: !!i.product_id,
            has_quantity: !!i.quantity,
            has_price: !!i.price,
            product_id: i.product_id,
            quantity: i.quantity
          })))
        }
      })
      
      return queue
    } catch (error) {
      console.error('Error debugging sync queue:', error)
      return []
    }
  }

  async retrySpecificItem(itemId) {
    try {
      const queue = await getSyncQueue()
      const item = queue.find(q => q.id === itemId)
      
      if (!item) {
        console.error('Item not found in sync queue:', itemId)
        return false
      }
      
      console.log('Retrying specific item:', item)
      
      // Reset retry count
      await updateSyncQueueItem(itemId, { retryCount: 0 })
      
      // Try to process the item
      const success = await this.processSyncItem(item)
      
      if (success) {
        await removeFromSyncQueue(itemId)
        console.log('Item retry successful:', itemId)
        return true
      } else {
        console.log('Item retry failed:', itemId)
        return false
      }
    } catch (error) {
      console.error('Error retrying specific item:', error)
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


