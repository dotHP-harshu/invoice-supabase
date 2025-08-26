import { openDB } from 'idb'

const DB_NAME = 'invoice-manager'
const DB_VERSION = 1

export async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('invoices')) {
        db.createObjectStore('invoices', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('invoice_items')) {
        db.createObjectStore('invoice_items', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true })
      }
    },
  })
}

export async function putAll(storeName, items) {
  const db = await getDb()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  for (const item of items) await store.put(item)
  await tx.done
}

export async function getAll(storeName) {
  const db = await getDb()
  return db.getAll(storeName)
}

export async function clearStore(storeName) {
  const db = await getDb()
  const tx = db.transaction(storeName, 'readwrite')
  await tx.store.clear()
  await tx.done
}

export async function enqueueSync(operation) {
  const db = await getDb()
  await db.add('syncQueue', { ts: Date.now(), ...operation })
}

export async function readQueue() {
  const db = await getDb()
  return db.getAll('syncQueue')
}

export async function removeFromQueue(id) {
  const db = await getDb()
  await db.delete('syncQueue', id)
}


