import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { listProducts, createProduct, updateProduct, deleteProduct, subscribeProducts } from '../services/productsService.js'
import { useI18n } from '../hooks/useI18n.js'

export default function ProductsPage() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({ name: '', price: '', stock: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', price: '', stock: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
    const sub = subscribeProducts(() => load())
    return () => sub.unsubscribe()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await listProducts()
    setLoading(false)
    if (error) return toast.error(error.message)
    setProducts(data || [])
  }

  async function onCreate(e) {
    e.preventDefault()
    setSaving(true)
    const price = Number(form.price)
    const stock = Number(form.stock)
    if (Number.isNaN(price) || Number.isNaN(stock)) {
      toast.error(t('must_be_numbers'))
      setSaving(false)
      return
    }
    const { error } = await createProduct({ name: form.name, price, stock })
    setSaving(false)
    if (error) return toast.error(error.message)
    setForm({ name: '', price: '', stock: '' })
    toast.success(t('product_added'))
  }

  async function onUpdate(productId, updates) {
    const { error } = await updateProduct(productId, updates)
    if (error) return toast.error(error.message)
    toast.success(t('product_updated'))
  }

  function startEdit(p) {
    setEditingId(p.id)
    setEditForm({ name: p.name, price: String(p.price), stock: String(p.stock) })
  }

  async function saveEdit(e) {
    e.preventDefault()
    const id = editingId
    const updates = {
      name: editForm.name,
      price: Number(editForm.price),
      stock: Number(editForm.stock),
    }
    const { error } = await updateProduct(id, updates)
    if (error) return toast.error(error.message)
    toast.success(t('product_updated'))
    setEditingId(null)
  }

  async function onDelete(productId) {
    if (!confirm(t('confirm_delete_product'))) return
    const { error } = await deleteProduct(productId)
    if (error) return toast.error(error.message)
    toast.success(t('product_deleted'))
  }

  return (
    <div className="stack">
      <section className="card card--pad">
        <h2 className="font-semibold" style={{ marginBottom: "0.75rem" }}>
          {t("add_product")}
        </h2>
        <form
          className="grid"
          style={{ gridTemplateColumns: "1fr", gap: "0.75rem" }}
          onSubmit={onCreate}
        >
          <input
            className="input"
            placeholder={t("name")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder={t("price")}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder={t("stock")}
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            required
          />
          <button disabled={saving} className="button button--primary">
            {saving ? "..." : t("add")}
          </button>
        </form>
      </section>

      <section className="card">
        {loading ? (
          <p>Loading .....</p>
        ) : (
          <table className="table">
            <thead className="thead">
              <tr>
                <th className="th">{t("name")}</th>
                <th className="th">{t("price")}</th>
                <th className="th">{t("stock")}</th>
                <th className="th">{t("remaining")}</th>
                <th className="th w-48">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="tr">
                  <td className="td">
                    {editingId === p.id ? (
                      <input
                        className="input"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                      />
                    ) : (
                      p.name
                    )}
                  </td>
                  <td className="td">
                    {editingId === p.id ? (
                      <input
                        className="input"
                        value={editForm.price}
                        onChange={(e) =>
                          setEditForm({ ...editForm, price: e.target.value })
                        }
                      />
                    ) : (
                      `₹${Number(p.price).toFixed(2)}`
                    )}
                  </td>
                  <td className="td">
                    {editingId === p.id ? (
                      <input
                        className="input"
                        value={editForm.stock}
                        onChange={(e) =>
                          setEditForm({ ...editForm, stock: e.target.value })
                        }
                      />
                    ) : (
                      <div>
                        {p.stock}
                        {p._offline && <span className="offline-indicator">Offline</span>}
                      </div>
                    )}
                  </td>
                  <td className="td" style={{ color: Number(p.remaining ?? p.stock) < 0 ? 'var(--danger)' : undefined }}>
                    <div>
                      {Number(p.remaining ?? p.stock)}
                      {p._offline && <span className="offline-indicator">Offline</span>}
                      {Number(p.remaining ?? p.stock) < 0 && (
                        <span style={{ 
                          color: 'var(--danger)', 
                          marginLeft: '0.5rem',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>
                          ⚠️ Negative Stock
                        </span>
                      )}
                      {Number(p.remaining ?? p.stock) === 0 && (
                        <span style={{ 
                          color: 'var(--warning)', 
                          marginLeft: '0.5rem',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>
                          ⚠️ Out of Stock
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="td">
                    <div className="actions">
                      {editingId === p.id ? (
                        <>
                          <button
                            className="button button--link"
                            onClick={saveEdit}
                          >
                            {t("save")}
                          </button>
                          <button
                            className="button button--link"
                            onClick={() => setEditingId(null)}
                          >
                            {t("cancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="button button--link"
                            onClick={() =>
                              onUpdate(p.id, { stock: p.stock + 1 })
                            }
                          >
                            +1 {t("stock")}
                          </button>
                          <button
                            className="button button--link"
                            onClick={() => startEdit(p)}
                          >
                            {t("edit")}
                          </button>
                          <button
                            className="button button--link"
                            style={{ color: "var(--danger)" }}
                            onClick={() => onDelete(p.id)}
                          >
                            {t("delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}


