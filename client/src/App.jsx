import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import NewAmc from './pages/NewAmc.jsx';
import SiteDetail from './pages/SiteDetail.jsx';
import Clients from './pages/Clients.jsx';

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const closeButton = useRef(null);
  const wasOpen = useRef(false);
  const location = useLocation();
  const onSitePage = location.pathname.startsWith('/sites/');

  // Navigating anywhere closes the menu.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Esc closes; focus moves into the menu on open and back to ☰ on close.
  useEffect(() => {
    if (menuOpen) {
      closeButton.current?.focus();
      const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
      document.addEventListener('keydown', onKey);
      wasOpen.current = true;
      return () => document.removeEventListener('keydown', onKey);
    }
    if (wasOpen.current) menuButton.current?.focus();
    wasOpen.current = false;
  }, [menuOpen]);

  return (
    <div className="shell">
      <header className="topbar">
        <button
          ref={menuButton}
          type="button"
          className="menu-button"
          aria-label="Open menu"
          aria-controls="sidebar"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <MenuIcon />
        </button>
        <span className="topbar-brand">AMC Desk</span>
      </header>

      <div
        className={`backdrop${menuOpen ? ' backdrop-open' : ''}`}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />
      <aside id="sidebar" className={`sidebar${menuOpen ? ' sidebar-open' : ''}`} inert={!menuOpen}>
        <div className="sidebar-head">
          <span className="brand">AMC Desk</span>
          <button
            ref={closeButton}
            type="button"
            className="sidebar-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
        </div>
        <nav aria-label="Main">
          <NavLink to="/" end className="nav-link">
            Dashboard
          </NavLink>
          {/* Website pages live under Clients & sites, so keep it highlighted there. */}
          <NavLink
            to="/clients"
            className={({ isActive }) => `nav-link${isActive || onSitePage ? ' active' : ''}`}
          >
            Clients &amp; sites
          </NavLink>
        </nav>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/amcs/new" element={<NewAmc />} />
          <Route path="/amcs/:id/edit" element={<NewAmc />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/sites/:id" element={<SiteDetail />} />
          <Route path="*" element={<p className="muted">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
