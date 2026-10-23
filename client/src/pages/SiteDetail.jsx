import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatDate, formatRupees } from '../lib/format.js';
import DaysLeft from '../components/DaysLeft.jsx';
import { DetailSkeleton } from '../components/Skeleton.jsx';

const CONTENT_UPDATES = 'Content updates';
const COMING_SOON = 'Coming soon';

const STATUS_BADGE = {
  active: { tone: 'success', text: () => 'AMC active' },
  upcoming: { tone: 'neutral', text: (c) => `AMC starts ${formatDate(c.start_date)}` },
  expired: { tone: 'danger', text: () => 'AMC expired' },
};

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'contract', label: 'Contract' },
  { id: 'assets', label: 'Domain, hosting & SSL' },
  { id: 'access', label: 'Access' },
  { id: 'health', label: 'Health' },
  { id: 'work-log', label: 'Tickets & work log' },
  { id: 'billing', label: 'Billing' },
];

const Empty = () => <span className="muted">—</span>;

function Detail({ label, children }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd>{children ?? <Empty />}</dd>
    </div>
  );
}

/** One label/value row in the narrow right-hand cards. */
function Row({ label, children, mono = true }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{children ?? <Empty />}</dd>
    </div>
  );
}

/** Date, plus a coloured "· N days" when it is within 30 days or past. */
function ExpiryDate({ date, daysLeft }) {
  return (
    <span className="expiry">
      <span className="mono">{formatDate(date)}</span>
      {daysLeft <= 30 && <DaysLeft value={daysLeft} />}
    </span>
  );
}

/** "Today 02:00" for today, otherwise "13 Oct 02:00". */
function formatDateTime(iso, today) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const day = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (day === today) return `Today ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })} ${time}`;
}

/** "12 min", "3 h", "2 days" since a timestamp. */
function durationSince(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} days`;
}

function scopeLabel(item, contract) {
  if (item === CONTENT_UPDATES && contract.content_updates_per_month != null) {
    return `${contract.content_updates_per_month} content updates / month`;
  }
  return item;
}

/**
 * Proposed renewal fee (before GST): the quoted fee saved on the renewal if
 * there is one, otherwise annual fee × (1 + renewal increase %). No increase
 * entered means the fee stays the same (0%).
 */
function proposedFee(contract, renewal) {
  if (renewal?.proposed_fee != null) {
    const amount = Number(renewal.proposed_fee);
    const pct = Math.round(((amount / contract.annual_fee) - 1) * 1000) / 10;
    return { amount, pct, note: 'Quoted fee' };
  }
  const pct = contract.renewal_increase_pct ?? 0;
  return {
    amount: contract.annual_fee * (1 + pct / 100),
    pct,
    note: contract.renewal_increase_pct == null ? 'No renewal increase set, so the fee stays the same' : undefined,
  };
}

// ── Cards ───────────────────────────────────────────────────────────────────

function ContractCard({ siteId, contract }) {
  const quota = contract.hours_quota;
  return (
    <section className="card panel">
      <header className="panel-header">
        <h2>Contract</h2>
        {contract.hasAgreement && (
          <a href={api.agreementUrl(siteId, contract.id)} target="_blank" rel="noopener noreferrer">
            Signed agreement
          </a>
        )}
      </header>
      <dl className="details">
        <Detail label="Plan">{contract.plan}</Detail>
        <Detail label="Period">
          <span className="mono">
            {formatDate(contract.start_date)} – {formatDate(contract.end_date)}
          </span>
        </Detail>
        <Detail label="Fee">
          <span className="mono">
            {formatRupees(contract.annual_fee)} / yr + {contract.gst_rate}% GST
          </span>
        </Detail>
        <Detail label="Billing">{contract.billing_cycle}</Detail>
        <Detail label="SLA">
          Critical {contract.critical_response} · Normal {contract.normal_response}
        </Detail>
        <Detail label="Quota">{quota != null ? `${quota} h / month` : null}</Detail>
      </dl>

      <p className="detail-label">Scope</p>
      {contract.scope.length || contract.exclusions ? (
        <ul className="tags">
          {contract.scope.map((item) => (
            <li key={item} className="tag">
              {scopeLabel(item, contract)}
            </li>
          ))}
          {contract.exclusions && <li className="tag tag-muted">Excluded: {contract.exclusions}</li>}
        </ul>
      ) : (
        <p className="muted">Nothing selected</p>
      )}

      {/* Placeholder until hours are logged in the work log. */}
      <div className="hours">
        <div className="hours-head">
          <span className="detail-label-inline">Hours this month</span>
          <span className="mono">— / {quota != null ? `${quota} h` : '—'}</span>
        </div>
        <div className="progress" role="progressbar" aria-label="Hours this month" aria-valuenow={0} aria-valuemin={0}>
          <span className="progress-fill" style={{ width: '0%' }} />
        </div>
      </div>
    </section>
  );
}

function RenewalCard({ contract, renewal }) {
  const { amount, pct, note } = proposedFee(contract, renewal);
  return (
    <section className="card panel">
      <h2 className="panel-title">Renewal</h2>
      <dl className="rows-dl">
        {contract.status === 'upcoming' && <Row label="Contract starts">{formatDate(contract.start_date)}</Row>}
        <div>
          <dt>Contract ends</dt>
          <dd>
            <ExpiryDate date={contract.end_date} daysLeft={contract.daysLeft} />
            {contract.daysLeft > 30 && <span className="mono"> · {contract.daysLeft} days</span>}
          </dd>
        </div>
        <Row label="Status" mono={false}>
          {renewal?.status ?? 'Quote not sent'}
        </Row>
        <div>
          <dt>Proposed fee</dt>
          <dd className="mono" title={note}>
            {formatRupees(amount)} (+{pct}%)
          </dd>
        </div>
        {/* Placeholder until hours are logged: annual fee ÷ hours worked. */}
        <Row label="Effective hourly" />
      </dl>

      <div className="note-box">
        {renewal?.upsell_notes ? (
          <>Upsell notes: {renewal.upsell_notes}</>
        ) : (
          <span className="muted">Upsell notes: none yet.</span>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-block" disabled title={COMING_SOON}>
        Send renewal quote
      </button>
    </section>
  );
}

function HealthCard({ health, today }) {
  const h = health ?? {};
  const scan = [h.security_scan_result, h.security_scan_on && formatDate(h.security_scan_on).slice(0, 6)]
    .filter(Boolean)
    .join(' · ');
  return (
    <section className="card panel">
      <h2 className="panel-title">Health</h2>
      <dl className="rows-dl">
        <Row label="Uptime (30 days)">{h.uptime_30d_pct != null ? `${Number(h.uptime_30d_pct)}%` : null}</Row>
        <Row label="Last backup">{h.last_backup_at ? formatDateTime(h.last_backup_at, today) : null}</Row>
        <Row label="Last restore test">{h.last_restore_test_on ? formatDate(h.last_restore_test_on) : null}</Row>
        <Row label="Security scan">{scan || null}</Row>
        <Row label="Mobile speed score">{h.mobile_speed_score ?? null}</Row>
      </dl>
      {!health && <p className="muted small card-foot">Monitoring not connected yet.</p>}
    </section>
  );
}

// Placeholder until invoices are read from Zoho Books.
function InvoicesCard() {
  return (
    <section className="card panel">
      <header className="panel-header">
        <h2>Invoices</h2>
        <span className="muted small">via Zoho Books</span>
      </header>
      <p className="empty empty-sm">No invoices yet.</p>
    </section>
  );
}

// Placeholder until work can be logged.
function WorkLogCard() {
  return (
    <section className="card panel">
      <h2 className="panel-title">Work log</h2>
      <p className="empty empty-sm">No work logged yet.</p>
    </section>
  );
}

function AssetsCard({ assets }) {
  return (
    <section className="card panel">
      <h2 className="panel-title">Domain, hosting &amp; SSL</h2>
      {assets.length === 0 ? (
        <p className="empty">No domain, hosting, SSL or license added.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Provider</th>
                <th>Owned / paid by</th>
                <th>Expires</th>
                <th>Auto-renew</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>{asset.asset_type}</td>
                  <td>{asset.provider ?? <Empty />}</td>
                  <td>{asset.owned_by}</td>
                  <td>
                    <ExpiryDate date={asset.expiry_date} daysLeft={asset.daysLeft} />
                  </td>
                  <td>{asset.auto_renew ? 'On' : 'Off'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AccessCard({ accessRefs }) {
  return (
    <section className="card panel">
      <header className="panel-header">
        <h2>Access</h2>
        <span className="muted small">Passwords live in the vault · never stored here</span>
      </header>
      {accessRefs.length === 0 ? (
        <p className="empty">No access references added.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Login ID</th>
                <th>2FA held by</th>
                <th>Last rotated</th>
                <th aria-label="Vault link" />
              </tr>
            </thead>
            <tbody>
              {accessRefs.map((ref) => (
                <tr key={ref.id}>
                  <td>{ref.account_type}</td>
                  <td className="mono">{ref.login ?? <Empty />}</td>
                  <td>{ref.two_fa_held_by ?? <Empty />}</td>
                  {/* Placeholder until password rotations are recorded. */}
                  <td>
                    <Empty />
                  </td>
                  <td className="cell-action">
                    {ref.vault_url && (
                      <a className="btn btn-secondary btn-sm" href={ref.vault_url} target="_blank" rel="noopener noreferrer">
                        Open in vault
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OtherContracts({ contracts }) {
  if (!contracts.length) return null;
  return (
    <section className="card panel">
      <h2 className="panel-title">Other contracts</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Plan</th>
              <th>Fee</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="mono">
                  {formatDate(c.start_date)} – {formatDate(c.end_date)}
                </td>
                <td>{c.plan}</td>
                <td className="mono">{formatRupees(c.annual_fee)} / yr</td>
                <td>{STATUS_BADGE[c.status].text(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const NoContract = () => (
  <section className="card panel">
    <p className="empty">No contract for this website.</p>
  </section>
);

// ── Page ────────────────────────────────────────────────────────────────────

export default function SiteDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const tab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const selectTab = (next) =>
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    api
      .getSite(id, controller.signal)
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err);
      });
    return () => controller.abort();
  }, [id]);

  if (error) {
    return (
      <>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Dashboard</Link> / <Link to="/clients">Clients &amp; sites</Link>
        </nav>
        <div className="alert alert-error" role="alert">
          {error.status === 404 ? 'This website was not found.' : `Could not load this website: ${error.message}`}
        </div>
      </>
    );
  }
  if (!data) return <DetailSkeleton />;

  const { site, client, contract, health, renewal, today } = data;
  const badge = contract && STATUS_BADGE[contract.status];
  const contact = [client.contact_person, client.phone].filter(Boolean).join(', ');
  const platform = [site.platform, health?.cms_version].filter(Boolean).join(' ');

  const contractCard = contract ? <ContractCard siteId={site.id} contract={contract} /> : <NoContract />;
  const renewalCard = contract && <RenewalCard contract={contract} renewal={renewal} />;
  const healthCard = <HealthCard health={health} today={today} />;

  const content = {
    overview: {
      main: [contractCard, <AssetsCard assets={data.assets} />, <AccessCard accessRefs={data.accessRefs} />, <WorkLogCard />],
      side: [renewalCard, healthCard, <InvoicesCard />],
    },
    contract: { main: [contractCard, <OtherContracts contracts={data.otherContracts} />], side: [renewalCard] },
    assets: { main: [<AssetsCard assets={data.assets} />] },
    access: { main: [<AccessCard accessRefs={data.accessRefs} />] },
    health: { main: [healthCard] },
    'work-log': { main: [<WorkLogCard />] },
    billing: { main: [<InvoicesCard />] },
  }[tab];

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Dashboard</Link> / <Link to="/clients">Clients &amp; sites</Link> / <span>{client.name}</span>
      </nav>

      <header className="detail-header">
        <div>
          <div className="detail-title">
            <h1>{client.name}</h1>
            {badge && <span className={`badge badge-${badge.tone}`}>{badge.text(contract)}</span>}
            {health?.is_up === false && (
              <span className="badge badge-danger">
                Site down{health.down_since ? ` ${durationSince(health.down_since)}` : ''}
              </span>
            )}
          </div>
          <p className="muted">
            <a href={site.url} target="_blank" rel="noopener noreferrer">
              {site.host}
            </a>{' '}
            · {platform}
            {health?.php_version && ` · PHP ${health.php_version}`}
            {contact && ` · Contact: ${contact}`}
          </p>
        </div>
        {/* Placeholders until work logging, reports and the renewal workflow exist. */}
        <div className="detail-actions">
          <button type="button" className="btn btn-secondary" disabled title={COMING_SOON}>
            Log work
          </button>
          <button type="button" className="btn btn-secondary" disabled title={COMING_SOON}>
            Monthly report (PDF)
          </button>
          <button type="button" className="btn btn-primary" disabled title={COMING_SOON}>
            Start renewal
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Website sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="tab-panel"
            className={`tab${tab === t.id ? ' tab-active' : ''}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {content.side ? (
          <div className="detail-layout">
            <div className="detail-col">{content.main.map((card, i) => card && <div key={i}>{card}</div>)}</div>
            <div className="detail-col">{content.side.map((card, i) => card && <div key={i}>{card}</div>)}</div>
          </div>
        ) : (
          content.main.map((card, i) => <div key={i}>{card}</div>)
        )}
      </div>
    </>
  );
}
