import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { listProducts } from '../services/productsService.js'
import { createInvoice } from '../services/invoicesService.js'
import { useI18n } from "../hooks/useI18n.js";

export default function CreateInvoicePage() {
  const { t } = useI18n();
  const [customerName, setCustomerName] = useState("");
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const { data, error } = await listProducts();
      if (error) return toast.error(error.message);

      setProducts(data || []);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("Failed to load products");
    }
  }

  const items = useMemo(() => {
    try {
      const mappedItems = products
        .map((p) => ({
          product_id: p.id,
          name: p.name,
          price: Number(p.price),
          quantity: Number(quantities[p.id] || 0),
          stock: Number(p.stock),
          remaining: Number(p.remaining ?? p.stock),
        }))
        .filter((it) => it.quantity > 0);

      return mappedItems;
    } catch (error) {
      console.error("Error calculating items:", error);
      return [];
    }
  }, [products, quantities]);

  // Calculate real-time remaining stock
  const productsWithRealTimeStock = useMemo(() => {
    try {
      const mappedProducts = products.map((p) => {
        const requestedQty = Number(quantities[p.id] || 0);
        const currentRemaining = Number(p.remaining ?? p.stock);
        const realTimeRemaining = currentRemaining - requestedQty;

        return {
          ...p,
          realTimeRemaining,
          canAddMore: true, // Always allow adding, even for negative stock
          stockStatus:
            currentRemaining <= 0
              ? "out-of-stock"
              : currentRemaining < 10
              ? "low-stock"
              : "in-stock",
        };
      });

      return mappedProducts;
    } catch (error) {
      console.error("Error calculating real-time stock:", error);
      return products;
    }
  }, [products, quantities]);

  const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  // Calculate stock impact warnings
  const stockWarnings = useMemo(() => {
    try {
      const warnings = [];
      items.forEach((item) => {
        if (item.remaining < item.quantity) {
          const willBeNegative = item.remaining - item.quantity;
          warnings.push(
            `${item.name}: Will have ${willBeNegative} remaining stock`
          );
        }
      });
      return warnings;
    } catch (error) {
      console.error("Error calculating stock warnings:", error);
      return [];
    }
  }, [items]);

  async function onCreate() {
    try {
      if (!customerName.trim()) return toast.error(t("enter_customer"));
      setSaving(true);

      const result = await createInvoice(
        customerName.trim(),
        items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }))
      );

      setSaving(false);

      if (result.error) {
        toast.error(result.error.message);
        return;
      }

      // Show warnings if any (about negative stock)
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach((warning) => {
          toast.warning(warning);
        });
      }

      setCustomerName("");
      setQuantities({});
      toast.success("Invoice created successfully!");
    } catch (error) {
      console.error("Error creating invoice:", error);
      setSaving(false);
      toast.error(`Failed to create invoice: ${error.message}`);
    }
  }

  useEffect(() => {
    const inputs = document.querySelectorAll("input[type='number']");
    const preventWheel = (e) => e.preventDefault();
    const preventArrow = (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
    };

    inputs.forEach((input) => {
      input.addEventListener("keydown", preventArrow);
      input.addEventListener("wheel", preventWheel, { passive: false });
    });

    return () => {
      inputs.forEach((input) => {
        input.removeEventListener("keydown", preventArrow);
        input.removeEventListener("wheel", preventWheel);
      });
    };
  }, [products]);

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
                    <td className="td">
                      {it.name}
                      {it.remaining < it.quantity && (
                        <span
                          style={{
                            color: "var(--danger)",
                            marginLeft: "0.5rem",
                            fontSize: "0.75rem",
                            fontWeight: "bold",
                          }}
                        >
                          ⚠️ Insufficient Stock
                        </span>
                      )}
                    </td>
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

          {/* Stock Impact Warnings */}
          {stockWarnings.length > 0 && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "var(--surface-alt)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--warning)",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  color: "var(--warning)",
                  fontWeight: "bold",
                  marginBottom: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                ⚠️ Stock Impact Warnings
              </div>
              {stockWarnings.map((warning, index) => (
                <div
                  key={index}
                  style={{
                    color: "var(--danger)",
                    fontSize: "0.875rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  • {warning}
                </div>
              ))}
            </div>
          )}

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
          {productsWithRealTimeStock.map((p, index) => (
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
              <div
                style={{
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <div
                  className="font-semibold"
                  style={{
                    minWidth: "2rem",
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: "0.875rem",
                  }}
                >
                  {index + 1}.
                </div>
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
                    ₹{Number(p.price).toFixed(2)} • {t("stock")}: {p.stock} •{" "}
                    {t("remaining")}: {p.realTimeRemaining}
                    {p.stockStatus === "out-of-stock" && (
                      <span
                        style={{ color: "var(--danger)", marginLeft: "0.5rem" }}
                      >
                        ⚠️ Out of Stock
                      </span>
                    )}
                    {p.stockStatus === "low-stock" && (
                      <span
                        style={{
                          color: "var(--warning)",
                          marginLeft: "0.5rem",
                        }}
                      >
                        ⚠️ Low Stock
                      </span>
                    )}
                    {p.realTimeRemaining < 0 && (
                      <span
                        style={{ color: "var(--danger)", marginLeft: "0.5rem" }}
                      >
                        ⚠️ Will be Negative
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <input
                type="number"
                min="0"
                className="input input-product input--sm input--w-24"
                value={quantities[p.id] || ""}
                onChange={(e) => {
                  const newQty = Number(e.target.value) || 0;
                  setQuantities((q) => ({ ...q, [p.id]: e.target.value }));
                }}
                style={{
                  // Disable increment/decrement buttons
                  WebkitAppearance: "none",
                  MozAppearance: "textfield",
                  opacity: 1, // Always enabled since we allow negative stock
                }}
                title={
                  p.stockStatus === "out-of-stock"
                    ? "Product is out of stock but can still be added to invoice"
                    : ""
                }
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}


