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
      
      for (const item of queue) {
        try {
          const success = await this.processSyncItem(item)
          if (success) {
            await removeFromSyncQueue(item.id)
            successCount++
          } else {
            errorCount++
          }
        } catch (error) {
          console.error('Sync item error:', error)
          errorCount++
          
          // Increment retry count
          await updateSyncQueueItem(item.id, { 
            retryCount: (item.retryCount || 0) + 1 
          })
        }
      }
      
      if (successCount > 0) {
        toast.success(`✅ Synced ${successCount} changes successfully`)
      }
      
      if (errorCount > 0) {
        toast.error(`❌ Failed to sync ${errorCount} changes`)
      }
      
    } catch (error) {
      console.error('Sync error:', error)
      toast.error('Sync failed. Please try again.')
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
          // Validate stock before creating invoice
          const { valid, errors, error: validationError } = await validateStockForInvoice(item.payload.items)
          if (validationError) return false
          if (!valid) {
            console.error('Stock validation failed:', errors)
            return false
          }
          
          // Create invoice first
          const { data: invoice, error: invError } = await supabase
            .from('invoices')
            .insert({ customer_name: item.payload.customerName })
            .select('id')
            .single()
          
          if (invError) return false
          
          // Create invoice items
          const itemsRows = item.payload.items.map(i => ({
            invoice_id: invoice.id,
            product_id: i.product_id,
            quantity: i.quantity
          }))
          
          const { error: itemsError } = await supabase
            .from('invoice_items')
            .insert(itemsRows)
          
          if (itemsError) return false
          
          // Update stock tracking
          await updateStockForInvoice([], item.payload.items)
          
          return true
        }

        case 'invoice:update': {
          if (item.payload.updates.customer_name !== undefined) {
            const { error } = await supabase
              .from('invoices')
              .update({ customer_name: item.payload.updates.customer_name })
              .eq('id', item.payload.invoiceId)
            if (error) return false
          }
          
          if (Array.isArray(item.payload.updates.items)) {
            // Get current items to calculate stock changes
            const { data: currentItems } = await supabase
              .from('invoice_items')
              .select('product_id, quantity')
              .eq('invoice_id', item.payload.invoiceId)
            
            // Validate new stock levels
            const { valid, errors, error: validationError } = await validateStockForInvoice(item.payload.updates.items)
            if (validationError) return false
            if (!valid) {
              console.error('Stock validation failed:', errors)
              return false
            }
            
            // Delete existing items
            const { error: delError } = await supabase
              .from('invoice_items')
              .delete()
              .eq('invoice_id', item.payload.invoiceId)
            if (delError) return false
            
            // Insert new items
            const rows = item.payload.updates.items.map(i => ({
              invoice_id: item.payload.invoiceId,
              product_id: i.product_id,
              quantity: i.quantity,
              price: i.price
            }))
            
            const { error: insError } = await supabase
              .from('invoice_items')
              .insert(rows)
            if (insError) return false
            
            // Update stock tracking
            await updateStockForInvoice(currentItems || [], item.payload.updates.items)
          }
          
          return true
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


