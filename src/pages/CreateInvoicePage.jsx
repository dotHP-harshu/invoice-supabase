import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { listProducts } from '../services/productsService.js'
import { createInvoice } from '../services/invoicesService.js'
import { useI18n } from '../i18n.jsx'

export default function CreateInvoicePage() {
  const { t } = useI18n()
  const [customerName, setCustomerName] = useState('')
  const [products, setProducts] = useState([])
  const [quantities, setQuantities] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data, error } = await listProducts()
    if (error) return toast.error(error.message)
    setProducts(data || [])
  }

  const items = useMemo(() => {
    return products
      .map(p => ({ product_id: p.id, name: p.name, price: Number(p.price), quantity: Number(quantities[p.id] || 0), stock: p.stock }))
      .filter(it => it.quantity > 0)
  }, [products, quantities])

  const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0)

  async function onCreate() {
    if (!customerName.trim()) return toast.error(t('enter_customer'))
    // validate stock
    for (const it of items) {
      if (it.quantity > it.stock) {
        return toast.error(t('insufficient_stock', it.name))
      }
    }
    setSaving(true)
    const { error } = await createInvoice(customerName.trim(), items.map(i => ({ product_id: i.product_id, quantity: i.quantity })))
    setSaving(false)
    if (error) return toast.error(error.message)
    setCustomerName('')
    setQuantities({})
    toast.success('OK')
  }

  return (
    <div className="grid grid-2">
      <section className="card card--pad">
        <h2 className="font-semibold" style={{ marginBottom: "0.75rem" }}>
          {t("invoice_preview")}
        </h2>
        <div className="stack">
          <input
            className="input"
            placeholder={t("customer_name_placeholder")}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead className="thead">
                <tr>
                  <th className="th">{t("name")}</th>
                  <th className="th">{t("price")}</th>
                  <th className="th">{t("qty")}</th>
                  <th className="th">{t("subtotal")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.product_id} className="tr">
                    <td className="td">{it.name}</td>
                    <td className="td">₹{it.price.toFixed(2)}</td>
                    <td className="td">{it.quantity}</td>
                    <td className="td">
                      ₹{(it.price * it.quantity).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-right font-semibold">
            {t("total")}: ₹{total.toFixed(2)}
          </div>
          <button
            disabled={saving || items.length === 0}
            className="button button--primary"
            onClick={onCreate}
          >
            {saving ? t("creating") : t("create_invoice")}
          </button>
        </div>
      </section>
      <section
        className="card card--pad hide-scrollbar"
        style={{ maxHeight: "500px", overflow: "auto" }}
      >
        <h2 className="font-semibold" style={{ marginBottom: "0.75rem" }}>
          {t("select_products")}
        </h2>
        <div className="stack">
          {products.map((p) => (
            <div
              key={p.id}
              className="card card--pad"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  className="font-semibold"
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.name}
                </div>
                <div className="muted">
                  ₹{Number(p.price).toFixed(2)} • {t("stock")}: {p.stock}
                </div>
              </div>
              <input
                type="number"
                min="0"
                max={p.stock}
                className="input input--sm input--w-24"
                value={quantities[p.id] || ""}
                onChange={(e) =>
                  setQuantities((q) => ({ ...q, [p.id]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}


