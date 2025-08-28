import { useEffect, useMemo, useState } from 'react'
import { I18nContext } from './contexts/I18nContext.js'

const translations = {
  en: {
    brand: 'Invoice Manager',
    nav_products: 'Products',
    nav_invoices: 'Invoices',
    nav_create: 'Create Invoice',
    footer_copy: year => `© ${year} Invoice Manager`,

    add_product: 'Add Product',
    name: 'Name',
    price: 'Price',
    stock: 'Stock',
    add: 'Add',

    search_placeholder: 'Search by customer or ID',
    new_invoice: 'New Invoice',
    id: 'ID',
    customer: 'Customer',
    date: 'Date',
    actions: 'Actions',
    view: 'View',
    delete: 'Delete',

    select_products: 'Select Products',
    invoice_preview: 'Invoice Preview',
    customer_name_placeholder: 'Customer name',
    qty: 'Qty',
    subtotal: 'Subtotal',
    total: 'Total',
    create_invoice: 'Create Invoice',
    creating: 'Creating...',

    invoice_number: n => `Invoice #${n}`,
    export_csv: 'Export CSV',
    export_pdf: 'Export PDF',

    enter_customer: 'Enter customer name',
    insufficient_stock: name => `Insufficient stock for ${name}`,
    product_added: 'Product added',
    product_updated: 'Product updated',
    product_deleted: 'Product deleted',
    invoice_deleted: 'Invoice deleted and stock restored',
    must_be_numbers: 'Price and stock must be numbers',
    confirm_delete_product: 'Delete this product?',
    confirm_delete_invoice: 'Delete this invoice and restore stock?',
  },
  hi: {
    brand: 'इनवॉइस मैनेजर',
    nav_products: 'उत्पाद',
    nav_invoices: 'इनवॉइस',
    nav_create: 'इनवॉइस बनाएँ',
    footer_copy: year => `© ${year} इनवॉइस मैनेजर। सर्वाधिकार सुरक्षित।`,

    add_product: 'उत्पाद जोड़ें',
    name: 'नाम',
    price: 'कीमत',
    stock: 'स्टॉक',
    remaining: 'शेष',
    add: 'जोड़ें',
    save: 'सहेजें',
    cancel: 'रद्द करें',
    edit: 'संपादित करें',

    search_placeholder: 'ग्राहक या आईडी से खोजें',
    new_invoice: 'नई इनवॉइस',
    id: 'आईडी',
    customer: 'ग्राहक',
    date: 'तारीख',
    actions: 'क्रियाएँ',
    view: 'देखें',
    delete: 'हटाएँ',

    select_products: 'उत्पाद चुनें',
    invoice_preview: 'इनवॉइस पूर्वावलोकन',
    customer_name_placeholder: 'ग्राहक का नाम',
    qty: 'मात्रा',
    subtotal: 'उप-योग',
    total: 'कुल',
    create_invoice: 'इनवॉइस बनाएँ',
    creating: 'बना रहा है...',

    invoice_number: n => `इनवॉइस #${n}`,
    export_csv: 'CSV एक्सपोर्ट करें',
    export_pdf: 'PDF एक्सपोर्ट करें',

    enter_customer: 'ग्राहक का नाम दर्ज करें',
    insufficient_stock: name => `${name} के लिए स्टॉक अपर्याप्त है`,
    product_added: 'उत्पाद जोड़ा गया',
    product_updated: 'उत्पाद अपडेट किया गया',
    product_deleted: 'उत्पाद हटाया गया',
    invoice_deleted: 'इनवॉइस हटाई गई और स्टॉक बहाल हुआ',
    must_be_numbers: 'कीमत और स्टॉक संख्याएँ होनी चाहिए',
    confirm_delete_product: 'क्या आप इस उत्पाद को हटाना चाहते हैं?',
    confirm_delete_invoice: 'क्या आप इस इनवॉइस को हटाकर स्टॉक बहाल करना चाहते हैं?',
  }
}



export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en')

  useEffect(() => {
    localStorage.setItem('lang', lang)
  }, [lang])

  const t = useMemo(() => {
    const dict = translations[lang] || translations.en
    return (key, ...args) => {
      const entry = dict[key]
      if (typeof entry === 'function') return entry(...args)
      return entry ?? key
    }
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}


