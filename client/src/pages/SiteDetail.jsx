import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatDate, formatRupees } from '../lib/format.js';
import DaysLeft from '../components/DaysLeft.jsx';

const CONTENT_UPDATES = 'Content updates';

const STATUS_BADGE = {
  active: { tone: 'success', text: () => 'AMC active' },
  upcoming: { tone: 'neutral', text: (c) => `AMC starts ${formatDate(c.start_date)}` },
  expired: { tone: 'danger', text: () => 'AMC expired' },
};

function Detail({ label, children }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd>{children ?? <span className="muted">—</span>}</dd>
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

function scopeLabel(item, contract) {
  if (item === CONTENT_UPDATES && contract.content_updates_per_month != null) {
    return `${contract.content_updates_per_month} content updates / month`;
  }
  return item;
}

function ContractCard({ siteId, contract }) {
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
        <Detail label="Quota">{contract.hours_quota != null ? `${contract.hours_quota} h / month` : null}</Detail>
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
    </section>
  );
}

function RenewalCard({ contract }) {
  const pct = contract.renewal_increase_pct;
  const proposed = pct != null ? contract.annual_fee * (1 + pct / 100) : null;
  return (
    <section className="card panel">
      <h2 className="panel-title">Renewal</h2>
      <dl className="rows-dl">
        {contract.status === 'upcoming' && (
          <div>
            <dt>Contract starts</dt>
            <dd className="mono">{formatDate(contract.start_date)}</dd>
          </div>
        )}
        <div>
          <dt>Contract ends</dt>
          <dd>
            <ExpiryDate date={contract.end_date} daysLeft={contract.daysLeft} />
            {contract.daysLeft > 30 && <span className="mono"> · {contract.daysLeft} days</span>}
          </dd>
        </div>
        <div>
          <dt>Proposed fee</dt>
          <dd className="mono">
            {proposed != null ? `${formatRupees(proposed)} (+${pct}%)` : <span className="muted">—</span>}
          </dd>
        </div>
      </dl>
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
                  <td>{asset.provider ?? <span className="muted">—</span>}</td>
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
                <th aria-label="Vault link" />
              </tr>
            </thead>
            <tbody>
              {accessRefs.map((ref) => (
                <tr key={ref.id}>
                  <td>{ref.account_type}</td>
                  <td className="mono">{ref.login ?? <span className="muted">—</span>}</td>
                  <td>{ref.two_fa_held_by ?? <span className="muted">—</span>}</td>
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

export default function SiteDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

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
  if (!data) return <p className="muted">Loading…</p>;

  const { site, client, contract } = data;
  const badge = contract && STATUS_BADGE[contract.status];
  const contact = [client.contact_person, client.phone].filter(Boolean).join(', ');

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Dashboard</Link> / <Link to="/clients">Clients &amp; sites</Link> / <span>{client.name}</span>
      </nav>

      <header className="detail-header">
        <div className="detail-title">
          <h1>{client.name}</h1>
          {badge && <span className={`badge badge-${badge.tone}`}>{badge.text(contract)}</span>}
        </div>
        <p className="muted">
          <a href={site.url} target="_blank" rel="noopener noreferrer">
            {site.host}
          </a>{' '}
          · {site.platform}
          {contact && ` · Contact: ${contact}`}
        </p>
      </header>

      {contract ? (
        <div className="detail-grid">
          <ContractCard siteId={site.id} contract={contract} />
          <RenewalCard contract={contract} />
        </div>
      ) : (
        <p className="muted">No contract for this website.</p>
      )}

      <AssetsCard assets={data.assets} />
      <AccessCard accessRefs={data.accessRefs} />
      <OtherContracts contracts={data.otherContracts} />
    </>
  );
}
