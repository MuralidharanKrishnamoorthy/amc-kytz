import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '../lib/format.js';
import DaysLeft, { daysLeftText } from './DaysLeft.jsx';
import { searchRows } from '../lib/search.js';
import Pagination from './Pagination.jsx';

// Item kinds are 'AMC' for contracts, otherwise the asset_types name.
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'AMC', label: 'AMC' },
  { value: 'Domain', label: 'Domain' },
  { value: 'Hosting', label: 'Hosting' },
  { value: 'SSL', label: 'SSL' },
  { value: 'License', label: 'Licenses' },
];

const TYPE_LABELS = {
  AMC: 'AMC contract',
  SSL: 'SSL certificate',
};

function AutoRenew({ value }) {
  if (value === null) return <span className="muted">—</span>;
  return value ? 'On' : 'Off';
}

const PAGE_SIZE = 5;

export default function ExpiryTable({ items, search }) {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  // A new filter or search starts again from page 1.
  useEffect(() => setPage(1), [filter, search]);

  // Search covers every value the row displays, so whatever you see can be found.
  const visible = useMemo(
    () =>
      searchRows(
        items.filter((item) => filter === 'all' || item.kind === filter),
        (item) => [
          item.site,
          item.url,
          TYPE_LABELS[item.kind] ?? item.kind,
          item.detail,
          item.client,
          formatDate(item.expiry),
          item.expiry,
          daysLeftText(item.daysLeft),
          item.autoRenew === null ? null : item.autoRenew ? 'On' : 'Off',
        ],
        search,
      ),
    [items, filter, search],
  );

  // Clamp in case the list shrank (e.g. after a refresh) below the current page.
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / PAGE_SIZE)));
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="card panel">
      <header className="panel-header">
        <h2>Upcoming expiries &amp; renewals</h2>
        <div className="chips" role="group" aria-label="Filter by type">
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
          {items.length === 0 ? 'Nothing to track yet.' : 'No items match this filter.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Client</th>
                <th>Expires</th>
                <th>Left</th>
                <th>Auto-renew</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => (
                <tr key={item.id} className="row-link" onClick={() => navigate(`/sites/${item.siteId}`)}>
                  <td>
                    {/* The link keeps the row keyboard- and middle-click-accessible. */}
                    <Link to={`/sites/${item.siteId}`} onClick={(e) => e.stopPropagation()}>
                      {item.site}
                    </Link>
                  </td>
                  <td>
                    {TYPE_LABELS[item.kind] ?? item.kind}
                    {item.detail && <div className="cell-sub">{item.detail}</div>}
                  </td>
                  <td>{item.client}</td>
                  <td className="mono">{formatDate(item.expiry)}</td>
                  <td>
                    <DaysLeft value={item.daysLeft} />
                  </td>
                  <td>
                    <AutoRenew value={item.autoRenew} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={visible.length}
        onChange={setPage}
        label="Expiries pages"
      />
    </section>
  );
}
