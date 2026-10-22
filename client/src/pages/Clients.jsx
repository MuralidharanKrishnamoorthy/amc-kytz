import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatDate, formatRupees } from '../lib/format.js';
import DaysLeft, { daysLeftText } from '../components/DaysLeft.jsx';
import { searchRows } from '../lib/search.js';
import Pagination from '../components/Pagination.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';

const PAGE_SIZE = 10;

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring ≤ 30 days' },
  { value: 'expired', label: 'Expired' },
];

const STATUS = {
  active: { tone: 'success', text: () => 'Active' },
  expiring: { tone: 'warning', text: () => 'Expiring' },
  expired: { tone: 'danger', text: () => 'Expired' },
  upcoming: { tone: 'neutral', text: (s) => `Starts ${formatDate(s.contract.startDate)}` },
  none: { tone: 'neutral', text: () => 'No contract' },
};

/** Date, plus the days-left badge when it is within 30 days or past. */
function DateWithBadge({ date, daysLeft }) {
  return (
    <span className="expiry">
      <span className="mono">{formatDate(date)}</span>
      {daysLeft <= 30 && <DaysLeft value={daysLeft} />}
    </span>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getSites(controller.signal)
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      });
    return () => controller.abort();
  }, []);

  // A new filter or search starts again from page 1.
  useEffect(() => setPage(1), [filter, search]);

  const visible = useMemo(() => {
    if (!data) return [];
    // Search covers every value the row displays.
    return searchRows(
      data.sites.filter((site) => filter === 'all' || site.status === filter),
      (site) => [
        site.client,
        site.host,
        site.url,
        site.platform,
        STATUS[site.status].text(site),
        site.contract && formatDate(site.contract.endDate),
        site.contract && daysLeftText(site.contract.daysLeft),
        site.contract && formatRupees(site.contract.annualFee),
        site.nextExpiry?.type,
        site.nextExpiry && formatDate(site.nextExpiry.date),
        site.nextExpiry && daysLeftText(site.nextExpiry.daysLeft),
      ],
      search,
    );
  }, [data, filter, search]);

  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / PAGE_SIZE)));
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Dashboard</Link> / <span>Clients &amp; sites</span>
      </nav>
      <header className="page-header">
        <div>
          <h1>Clients &amp; sites</h1>
          <p className="muted">
            {data ? `${data.sites.length} ${data.sites.length === 1 ? 'website' : 'websites'}` : ' '}
          </p>
        </div>
        <div className="page-actions">
          <input
            type="search"
            className="input search"
            placeholder="Search anything in the list"
            aria-label="Search websites"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Link to="/amcs/new" className="btn btn-primary">
            + New AMC
          </Link>
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          Could not load clients: {error}
        </div>
      )}

      {!data && !error && <TableSkeleton label="Loading clients" />}

      {data && (
        <section className="card panel">
          <header className="panel-header">
            <h2>Websites</h2>
            <div className="chips" role="group" aria-label="Filter by AMC status">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chip${filter === option.value ? ' chip-active' : ''}`}
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </header>

          {visible.length === 0 ? (
            <p className="empty">
              {data.sites.length === 0 ? 'No clients yet.' : 'No websites match this filter.'}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Website</th>
                    <th>Platform</th>
                    <th>AMC status</th>
                    <th>Contract ends</th>
                    <th>Annual fee</th>
                    <th>Next expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((site) => {
                    const status = STATUS[site.status];
                    return (
                      <tr key={site.id} className="row-link" onClick={() => navigate(`/sites/${site.id}`)}>
                        <td>
                          <Link to={`/sites/${site.id}`} onClick={(e) => e.stopPropagation()}>
                            {site.client}
                          </Link>
                        </td>
                        <td>{site.host}</td>
                        <td>{site.platform}</td>
                        <td>
                          <span className={`badge badge-${status.tone}`}>{status.text(site)}</span>
                        </td>
                        <td>
                          {site.contract ? (
                            <DateWithBadge date={site.contract.endDate} daysLeft={site.contract.daysLeft} />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="mono">
                          {site.contract ? formatRupees(site.contract.annualFee) : <span className="muted">—</span>}
                        </td>
                        <td>
                          {site.nextExpiry ? (
                            <>
                              <div className="cell-sub">{site.nextExpiry.type}</div>
                              <DateWithBadge date={site.nextExpiry.date} daysLeft={site.nextExpiry.daysLeft} />
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={currentPage}
            pageSize={PAGE_SIZE}
            total={visible.length}
            onChange={setPage}
            label="Websites pages"
          />
        </section>
      )}
    </>
  );
}
