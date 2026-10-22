/**
 * Page numbers to show: always the first, last, current and its neighbours,
 * with "…" for the gaps — e.g. 1 … 4 5 6 … 12.
 */
function pageList(page, pageCount) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(`gap-${p}`);
    result.push(p);
  });
  return result;
}

export default function Pagination({ page, pageSize, total, onChange, label }) {
  const pageCount = Math.ceil(total / pageSize);
  if (pageCount <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label={label}>
      <p className="pagination-summary">
        Showing {from}–{to} of {total}
      </p>
      <div className="pagination-pages">
        <button type="button" className="page-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>
          ‹ Prev
        </button>
        {pageList(page, pageCount).map((p) =>
          typeof p === 'string' ? (
            <span key={p} className="page-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`page-btn${p === page ? ' page-btn-active' : ''}`}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className="page-btn"
          disabled={page === pageCount}
          onClick={() => onChange(page + 1)}
        >
          Next ›
        </button>
      </div>
    </nav>
  );
}
