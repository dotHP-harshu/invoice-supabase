import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import ProductsPage from './pages/ProductsPage.jsx'
import InvoicesPage from './pages/InvoicesPage.jsx'
import InvoiceDetailPage from './pages/InvoiceDetailPage.jsx'
import CreateInvoicePage from './pages/CreateInvoicePage.jsx'
import ConnectionStatus from "./components/ConnectionStatus.jsx";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { I18nProvider } from "./i18n.jsx";
import { useI18n } from "./hooks/useI18n.js";
import { useEffect, useState } from "react";
import { startAutoSync } from "./offline/sync.js";

function AppShell() {
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light"
  );
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    localStorage.setItem("theme", theme);
    const root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
  }, [theme]);

  useEffect(() => {
    // Initialize auto-sync when app starts
    if (navigator.onLine) {
      startAutoSync();
    }

    // Check if app meets PWA criteria
    const checkPWAInstallable = async () => {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        // Check if not already installed
        const isStandalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          window.navigator.standalone === true;
        if (!isStandalone) {
          setCanInstall(true);
        }
      }
    };

    // Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e) => {
      console.log("PWA install prompt detected");
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    const handleAppInstalled = () => {
      console.log("PWA installed successfully");
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
      setCanInstall(false);
    };

    checkPWAInstallable();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installPWA() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowInstallPrompt(false);
        setDeferredPrompt(null);
      }
    }
  }

  return (
    <div className="app">
      <ConnectionStatus />
      <header className="header">
        <div className="container header__inner">
          <h1 className="brand">{t("brand")}</h1>
          <nav className="nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `nav-link ${isActive ? "is-active" : ""}`
              }
            >
              {t("nav_products")}
            </NavLink>
            <NavLink
              to="/invoices"
              className={({ isActive }) =>
                `nav-link ${isActive ? "is-active" : ""}`
              }
            >
              {t("nav_invoices")}
            </NavLink>
            <NavLink
              to="/invoices/new"
              className={({ isActive }) =>
                `nav-link ${isActive ? "is-active" : ""}`
              }
            >
              {t("nav_create")}
            </NavLink>
          </nav>
          <div className="cluster">
            {(showInstallPrompt || canInstall) && (
              <button
                className="button button--primary"
                onClick={installPWA}
                style={{ marginRight: "0.5rem" }}
              >
                📱 Install App
              </button>
            )}
            <button
              className="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label="Toggle theme"
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <select
              className="input"
              style={{ width: "auto" }}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label="Language"
            >
              <option value="en">EN</option>
              <option value="hi">हिं</option>
            </select>
          </div>
        </div>
      </header>
      <main className="main">
        <div className="container">
          <Routes>
            <Route path="/" element={<ProductsPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/invoices/new" element={<CreateInvoicePage />} />
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          </Routes>
        </div>
      </main>
      <ToastContainer position="top-right" autoClose={2500} />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AppShell />
      </I18nProvider>
    </BrowserRouter>
  )
}

export default App
