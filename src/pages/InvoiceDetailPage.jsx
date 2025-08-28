import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { getInvoiceWithItems, exportInvoiceToPDF, updateInvoice } from '../services/invoicesService.js'
import { useI18n } from '../hooks/useI18n.js'

export default function InvoiceDetailPage() {
  const { t } = useI18n()
  const { id } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ customer_name: '', items: [] })
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  
  const load = useCallback(async () => {
    const { data, error } = await getInvoiceWithItems(Number(id))
    if (error) return toast.error(error.message)
    setInvoice(data)
    setForm({ customer_name: data.customer_name, items: data.items.map(it => ({ id: it.id, product_id: it.product_id, quantity: it.quantity, product_name: it.product_name, price: it.price })) })
  }, [id])
  
  useEffect(() => {
    load()
    // Listen for PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallPrompt(true)
    })
    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      setShowInstallPrompt(false)
      setDeferredPrompt(null)
    })
  }, [id, load])

  async function installPWA() {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShowInstallPrompt(false)
        setDeferredPrompt(null)
      }
    }
  }

  if (!invoice) return <div>Loading...</div>

  const total = (editing ? form.items : invoice.items).reduce((sum, it) => sum + Number(it.price) * it.quantity, 0)

  return (
    <div className="stack">
      <div className="cluster wrap between">
        <h2 className="font-semibold" style={{ fontSize: '1.25rem', letterSpacing: '-0.01em' }}>{t('invoice_number', invoice.id)}</h2>
        <div className="actions">
          {showInstallPrompt && (
            <button className="button button--primary" onClick={installPWA} style={{ marginRight: '0.5rem' }}>
              📱 Install App
            </button>
          )}
          <button className="button button--primary" onClick={() => exportInvoiceToPDF(invoice)}>
            📄 Export PDF
          </button>
        </div>
      </div>
      <div className="card card--pad">
        <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '1rem' }}>
          <div>
            <div className="muted">{t('customer')}</div>
            {editing ? (
              <input className="input" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
            ) : (
              <div className="font-semibold">{invoice.customer_name}</div>
            )}
          </div>
          <div>
            <div className="muted">{t('date')}</div>
            <div className="font-semibold">{new Date(invoice.created_at).toLocaleString()}</div>
          </div>
        </div>
        <div className="card" style={{ marginTop: '1rem', overflow: 'hidden' }}>
          <table className="table">
            <thead className="thead">
              <tr>
                <th className="th">{t('name')}</th>
                <th className="th">{t('price')}</th>
                <th className="th">{t('qty')}</th>
                <th className="th">{t('subtotal')}</th>
              </tr>
            </thead>
            <tbody>
              {(editing ? form.items : invoice.items).map((item, idx) => (
                <tr key={item.id ?? idx} className="tr">
                  <td className="td">{item.product_name}</td>
                  <td className="td">
                    {editing ? (
                      <input 
                        className="input" 
                        style={{ maxWidth: '6rem' }} 
                        value={String(item.price)} 
                        onChange={e => {
                          const v = e.target.value
                          const items = [...form.items]
                          items[idx] = { ...items[idx], price: Number(v) }
                          setForm({ ...form, items })
                        }} 
                      />
                    ) : (
                      `₹${Number(item.price).toFixed(2)}`
                    )}
                  </td>
                  <td className="td">
                    {editing ? (
                      <input className="input" style={{ maxWidth: '5rem' }} value={String(item.quantity)} onChange={e => {
                        const v = e.target.value
                        const items = [...form.items]
                        items[idx] = { ...items[idx], quantity: Number(v) }
                        setForm({ ...form, items })
                      }} />
                    ) : (
                      item.quantity
                    )}
                  </td>
                  <td className="td">₹{(Number(item.price) * item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-right font-semibold" style={{ marginTop: '0.75rem' }}>{t('total')}: ₹{total.toFixed(2)}</div>
        <div className="actions" style={{ marginTop: '0.75rem' }}>
          {editing ? (
            <>
              <button className="button button--primary" onClick={async () => {
                const payload = { customer_name: form.customer_name, items: form.items.map(it => ({ product_id: it.product_id, quantity: it.quantity, price: it.price })) }
                const { error } = await updateInvoice(Number(id), payload)
                if (error) return toast.error(error.message)
                toast.success(t('invoice_updated'))
                setEditing(false)
                load()
              }}>{t('save')}</button>
              <button className="button" onClick={() => { setEditing(false); load() }}>{t('cancel')}</button>
            </>
          ) : (
            <button className="button" onClick={() => setEditing(true)}>{t('edit')}</button>
          )}
        </div>
      </div>
    </div>
  )
}


