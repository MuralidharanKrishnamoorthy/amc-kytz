/** A shimmering placeholder block. */
export function Skeleton({ width = '100%', height = 14, className = '' }) {
  return <span className={`skeleton ${className}`} style={{ width, height }} aria-hidden="true" />;
}

/** Wraps placeholders so screen readers announce one "Loading" instead. */
function Loading({ label, children }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}

const STAT_CARDS = 5;
const TABLE_ROWS = 5;

export function DashboardSkeleton() {
  return (
    <Loading label="Loading dashboard">
      <div className="stats">
        {Array.from({ length: STAT_CARDS }, (_, i) => (
          <div key={i} className="card stat">
            <Skeleton width="60%" />
            <Skeleton width="40%" height={30} className="skeleton-gap" />
            <Skeleton width="75%" height={12} />
          </div>
        ))}
      </div>
      <div className="card panel">
        <div className="panel-header">
          <Skeleton width={220} height={20} />
          <Skeleton width={320} height={30} />
        </div>
        {Array.from({ length: TABLE_ROWS }, (_, i) => (
          <div key={i} className="skeleton-row">
            <Skeleton width="18%" />
            <Skeleton width="14%" />
            <Skeleton width="18%" />
            <Skeleton width="12%" />
            <Skeleton width="10%" height={20} />
            <Skeleton width="6%" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function TableSkeleton({ label, rows = 10, columns = 7 }) {
  return (
    <Loading label={label}>
      <div className="card panel">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="skeleton-row">
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton key={c} width={`${Math.floor(80 / columns)}%`} />
            ))}
          </div>
        ))}
      </div>
    </Loading>
  );
}

// Field counts per section mirror the real form so nothing jumps on load.
const FORM_SECTIONS = [
  { columns: 3, fields: 7 },
  { columns: 4, fields: 6 },
  { columns: 4, fields: 5 },
];

export function FormSkeleton() {
  return (
    <Loading label="Loading form">
      {FORM_SECTIONS.map((section, s) => (
        <div key={s} className="card section">
          <Skeleton width={200} height={18} className="skeleton-legend" />
          <div className={`grid grid-${section.columns}`}>
            {Array.from({ length: section.fields }, (_, f) => (
              <div key={f} className="field">
                <Skeleton width="55%" height={12} />
                <Skeleton height={38} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Loading>
  );
}
