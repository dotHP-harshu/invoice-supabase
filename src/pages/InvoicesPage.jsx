import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { listInvoices, deleteInvoice, subscribeInvoices } from '../services/invoicesService.js'
import { useI18n } from '../i18n.jsx'

export default function InvoicesPage() {
  const { t } = useI18n()
  const [invoices, setInvoices] = useState([])
  const [q, setQ] = useState('')

  useEffect(() => {
    load()
    const sub = subscribeInvoices(() => load())
    return () => sub.unsubscribe()
  }, [])

  async function load() {
    const { data, error } = await listInvoices()
    if (error) return toast.error(error.message)
    setInvoices(data || [])
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return invoices
    return invoices.filter(inv => inv.customer_name.toLowerCase().includes(s) || String(inv.id).includes(s))
  }, [q, invoices])

  async function onDelete(id) {
    if (!confirm(t('confirm_delete_invoice'))) return
    const { error } = await deleteInvoice(id)
    if (error) return toast.error(error.message)
    toast.success(t('invoice_deleted'))
  }

  return (
    <div className="stack">
      <div className="cluster wrap between">
        <input className="input" style={{ maxWidth: '16rem' }} placeholder={t('search_placeholder')} value={q} onChange={e => setQ(e.target.value)} />
        <Link to="/invoices/new" className="button button--primary" style={{ textDecoration: 'none', textAlign: 'center' }}>{t('new_invoice')}</Link>
      </div>
      <div className="card">
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
                <td className="td">{inv.id}</td>
                <td className="td">{inv.customer_name}</td>
                <td className="td">{new Date(inv.created_at).toLocaleString()}</td>
                <td className="td">
                  <div className="actions">
                    <Link className="button button--link" to={`/invoices/${inv.id}`}>{t('view')}</Link>
                    <button className="button button--link" style={{ color: 'var(--danger)' }} onClick={() => onDelete(inv.id)}>{t('delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


