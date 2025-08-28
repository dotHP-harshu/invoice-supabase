import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { listInvoices, deleteInvoice, subscribeInvoices } from '../services/invoicesService.js'
import { useI18n } from '../hooks/useI18n.js'

export default function InvoicesPage() {
  const { t } = useI18n()
  const [invoices, setInvoices] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    load()
    const sub = subscribeInvoices(() => load())
    return () => sub.unsubscribe()
  }, [])

  async function load() {
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await listInvoices()
      if (error) {
        setError(error.message)
        toast.error(error.message)
        return
      }
      setInvoices(data || [])
    } catch (err) {
      const errorMsg = err.message || 'Failed to load invoices'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return invoices
    return invoices.filter(inv => 
      inv.customer_name?.toLowerCase().includes(s) || 
      String(inv.id).includes(s)
    )
  }, [q, invoices])

  async function onDelete(id) {
    if (!confirm(t('confirm_delete_invoice'))) return
    try {
      const { error } = await deleteInvoice(id)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success(t('invoice_deleted'))
      // Reload to refresh the list
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to delete invoice')
    }
  }

  if (loading) {
    return (
      <div className="stack">
        <div className="card card--pad">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            Loading invoices...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stack">
        <div className="card card--pad">
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--danger)' }}>
            <div>Error: {error}</div>
            <button className="button button--primary" onClick={load} style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="cluster wrap between">
        <input 
          className="input" 
          style={{ maxWidth: '16rem' }} 
          placeholder={t('search_placeholder')} 
          value={q} 
          onChange={e => setQ(e.target.value)} 
        />
        <Link 
          to="/invoices/new" 
          className="button button--primary" 
          style={{ textDecoration: 'none', textAlign: 'center' }}
        >
          {t('new_invoice')}
        </Link>
      </div>
      <div className="card">
        {filtered.length === 0 ? (
          <div className="card--pad" style={{ textAlign: 'center', padding: '2rem' }}>
            {q.trim() ? 'No invoices found matching your search.' : 'No invoices yet.'}
          </div>
        ) : (
          <table className="table">
            <thead className="thead">
              <tr>
                <th className="th">{t('id')}</th>
                <th className="th">{t('customer')}</th>
                <th className="th">{t('date')}</th>
                <th className="th w-48">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} className="tr">
                  <td className="td">
                    {inv.id}
                    {inv._offline && <span className="offline-indicator">Offline</span>}
                  </td>
                  <td className="td">{inv.customer_name || 'Unknown'}</td>
                  <td className="td">
                    {inv.created_at ? new Date(inv.created_at).toLocaleString() : 'Unknown'}
                  </td>
                  <td className="td">
                    <div className="actions">
                      <Link className="button button--link" to={`/invoices/${inv.id}`}>
                        {t('view')}
                      </Link>
                      <button 
                        className="button button--link" 
                        style={{ color: 'var(--danger)' }} 
                        onClick={() => onDelete(inv.id)}
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}


