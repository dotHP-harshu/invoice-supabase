import { openDB } from 'idb'

const DB_NAME = 'invoice-manager-db'
const DB_VERSION = 1

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    // Products store
    if (!db.objectStoreNames.contains('products')) {
      const productStore = db.createObjectStore('products', { keyPath: 'id' })
      productStore.createIndex('name', 'name')
    }
    
    // Invoices store
    if (!db.objectStoreNames.contains('invoices')) {
      const invoiceStore = db.createObjectStore('invoices', { keyPath: 'id' })
      invoiceStore.createIndex('customer_name', 'customer_name')
      invoiceStore.createIndex('created_at', 'created_at')
    }
    
    // Invoice items store
    if (!db.objectStoreNames.contains('invoice_items')) {
      const itemStore = db.createObjectStore('invoice_items', { keyPath: 'id' })
      itemStore.createIndex('invoice_id', 'invoice_id')
      itemStore.createIndex('product_id', 'product_id')
    }
    
    // Sync queue store
    if (!db.objectStoreNames.contains('sync_queue')) {
      const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true })
      syncStore.createIndex('kind', 'kind')
      syncStore.createIndex('timestamp', 'timestamp')
    }
  }
})

export async function getAll(storeName) {
  const db = await dbPromise
  return db.getAll(storeName)
}

export async function get(storeName, key) {
  const db = await dbPromise
  return db.get(storeName, key)
}

export async function put(storeName, value) {
  const db = await dbPromise
  return db.put(storeName, value)
}

export async function putAll(storeName, values) {
  const db = await dbPromise
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  
  for (const value of values) {
    await store.put(value)
  }
  
  return tx.done
}

export async function add(storeName, value) {
  const db = await dbPromise
  return db.add(storeName, value)
}

export async function deleteItem(storeName, key) {
  const db = await dbPromise
  return db.delete(storeName, key)
}

export async function clearStore(storeName) {
  const db = await dbPromise
  return db.clear(storeName)
}

export async function enqueueSync(syncItem) {
  const db = await dbPromise
  const syncData = {
    ...syncItem,
    timestamp: Date.now(),
    retryCount: 0
  }
  return db.add('sync_queue', syncData)
}

export async function getSyncQueue() {
  const db = await dbPromise
  return db.getAll('sync_queue')
}

export async function removeFromSyncQueue(id) {
  const db = await dbPromise
  return db.delete('sync_queue', id)
}

export async function updateSyncQueueItem(id, updates) {
  const db = await dbPromise
  const item = await db.get('sync_queue', id)
  if (item) {
    const updatedItem = { ...item, ...updates }
    return db.put('sync_queue', updatedItem)
  }
}

export async function getPendingSyncCount() {
  const db = await dbPromise
  return db.count('sync_queue')
}


