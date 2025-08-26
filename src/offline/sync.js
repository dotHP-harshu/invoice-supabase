import { enqueueSync, readQueue, removeFromQueue } from './idb.js'
import { supabase } from '../services/supabaseClient.js'

export async function queueOperation(kind, payload) {
  await enqueueSync({ kind, payload })
}

export async function processQueue() {
  if (!navigator.onLine) return
  const queue = await readQueue()
  for (const q of queue) {
    try {
      // Minimal set for demo: products create/update/delete and invoice create/delete
      switch (q.kind) {
        case 'product:create': {
          const { error } = await supabase.from('products').insert(q.payload)
          if (error) throw error
          break
        }
        case 'product:update': {
          const { id, updates } = q.payload
          const { error } = await supabase.from('products').update(updates).eq('id', id)
          if (error) throw error
          break
        }
        case 'product:delete': {
          const { id } = q.payload
          const { error } = await supabase.from('products').delete().eq('id', id)
          if (error) throw error
          break
        }
        case 'invoice:create': {
          const { customerName, items } = q.payload
          // Reuse server logic when online
          const { data: inv, error: invErr } = await supabase.from('invoices').insert({ customer_name: customerName }).select('id').single()
          if (invErr) throw invErr
          const invoiceId = inv.id
          const rows = items.map(i => ({ invoice_id: invoiceId, product_id: i.product_id, quantity: i.quantity }))
          const { error: itemsErr } = await supabase.from('invoice_items').insert(rows)
          if (itemsErr) throw itemsErr
          for (const it of items) {
            const { error: upErr } = await supabase.rpc('decrement_stock', { p_product_id: it.product_id, p_qty: it.quantity })
            if (upErr) throw upErr
          }
          break
        }
        case 'invoice:delete': {
          const { invoiceId } = q.payload
          const { data: items, error: itemsErr } = await supabase.from('invoice_items').select('product_id, quantity').eq('invoice_id', invoiceId)
          if (itemsErr) throw itemsErr
          for (const it of items) {
            const { error: upErr } = await supabase.rpc('increment_stock', { p_product_id: it.product_id, p_qty: it.quantity })
            if (upErr) throw upErr
          }
          const { error: delItemsErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
          if (delItemsErr) throw delItemsErr
          const { error: delInvErr } = await supabase.from('invoices').delete().eq('id', invoiceId)
          if (delInvErr) throw delInvErr
          break
        }
        case 'invoice:update': {
          const { invoiceId, updates } = q.payload
          if (updates.customer_name !== undefined) {
            const { error } = await supabase.from('invoices').update({ customer_name: updates.customer_name }).eq('id', invoiceId)
            if (error) throw error
          }
          if (Array.isArray(updates.items)) {
            const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
            if (delErr) throw delErr
            const rows = updates.items.map(i => ({ 
              invoice_id: invoiceId, 
              product_id: i.product_id, 
              quantity: i.quantity,
              price: i.price // Include price in the sync
            }))
            const { error: insErr } = await supabase.from('invoice_items').insert(rows)
            if (insErr) throw insErr
          }
          break
        }
        default:
          break
      }
      await removeFromQueue(q.id)
    } catch (_) {
      // Keep in queue; stop processing to avoid hammering
      break
    }
  }
}

export function startSyncLoop() {
  const run = () => processQueue().catch(() => {})
  window.addEventListener('online', run)
  setInterval(run, 10000)
  run()
}


