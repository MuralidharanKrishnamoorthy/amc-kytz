import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatLongDate, formatRupees, formatRupeesCompact, plural } from '../lib/format.js';
import StatCard from '../components/StatCard.jsx';
import ExpiryTable from '../components/ExpiryTable.jsx';
import { DashboardSkeleton, Skeleton } from '../components/Skeleton.jsx';

// Acronyms keep their case: "4 AMC · 3 domain · 2 SSL".
const shortKind = (kind) => (kind === kind.toUpperCase() ? kind : kind.toLowerCase());

// "4 AMC · 3 domain · 2 SSL" — contracts first, then asset types.
function breakdown(byKind) {
  const { AMC: amc, ...assets } = byKind;
  const parts = Object.entries(assets).map(([kind, count]) => `${count} ${shortKind(kind)}`);
  if (amc) parts.unshift(`${amc} AMC`);
  return parts.length ? parts.join(' · ') : 'Nothing due';
}

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useState(location.state?.flash ?? null);

  useEffect(() => {
    // Clear router state so the flash message doesn't reappear on refresh.
    if (location.state?.flash) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getDashboard(controller.signal)
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      });
    return () => controller.abort();
  }, []);

  const stats = data?.stats;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">{data ? formatLongDate(data.today) : <Skeleton width={220} />}</p>
        </div>
        <div className="page-actions">
          <input
            type="search"
            className="input search"
            placeholder="Search anything in the list"
            aria-label="Search expiries"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Link to="/amcs/new" className="btn btn-primary">
            + New AMC
          </Link>
        </div>
      </header>

      {flash && (
        <div className="alert alert-success" role="status">
          {flash}
          <button type="button" className="alert-close" aria-label="Dismiss" onClick={() => setFlash(null)}>
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          Could not load the dashboard: {error}
        </div>
      )}

      {!data && !error && <DashboardSkeleton />}

      {stats && (
        <>
          <div className="stats">
            <StatCard
              label="Active AMCs"
              value={stats.activeAmcs}
              hint={`across ${plural(stats.activeClients, 'client')}`}
            />
            <StatCard
              label="Annual recurring value"
              value={formatRupeesCompact(stats.annualValue)}
              hint={`≈ ${formatRupees(stats.monthlyValue)} per month`}
            />
            <StatCard
              label={`Expiring in ${stats.expiringSoon.windowDays} days`}
              value={stats.expiringSoon.total}
              hint={breakdown(stats.expiringSoon.byKind)}
              tone={stats.expiringSoon.total ? 'warning' : undefined}
            />
            <StatCard
              label="Overdue invoices"
              value={stats.overdueInvoices.total}
              hint={`${formatRupees(stats.overdueInvoices.outstanding)} outstanding`}
              tone={stats.overdueInvoices.total ? 'danger' : undefined}
            />
            <StatCard
              label="Sites down now"
              value={stats.sitesDown.total}
              hint="Monitoring not connected"
              tone={stats.sitesDown.total ? 'danger' : undefined}
            />
          </div>

          <ExpiryTable items={data.upcoming} search={search} />
        </>
      )}
    </>
  );
}
