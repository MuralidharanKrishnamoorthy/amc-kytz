import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Checkbox, Field, RowErrors, Select, TextInput } from '../components/FormControls.jsx';
import { FormSkeleton } from '../components/Skeleton.jsx';
import Spinner from '../components/Spinner.jsx';

const INITIAL_ASSET_ROWS = 1;
const INITIAL_ACCESS_ROWS = 2;

// Placeholders from the design, keyed by asset_types name.
const PROVIDER_PLACEHOLDER = {
  Domain: 'Registrar',
  Hosting: 'Host and plan',
  SSL: 'Issuer',
};

// Scope item that carries a "per month" count (scope_items name).
const CONTENT_UPDATES = 'Content updates';

const emptyClient = { name: '', gstin: '', contact_person: '', email: '', phone: '' };

const emptyContract = {
  website_url: '',
  platform: '',
  plan: '',
  start_date: '',
  end_date: '',
  hours_quota: '',
  critical_response: '',
  normal_response: '',
  scope: [],
  content_updates_per_month: '',
  exclusions: '',
  annual_fee: '',
  gst_rate: '',
  billing_cycle: '',
  renewal_increase_pct: '',
  out_of_scope_rate: '',
  zoho_recurring: false,
  password_rotation_months: '',
  reminder_days: [],
  notify_client: false,
  reminder_channels: [],
};

const newAsset = () => ({
  key: crypto.randomUUID(),
  type: '',
  provider: '',
  owned_by: '',
  expiry_date: '',
  auto_renew: false,
});

const newAccessRef = () => ({
  key: crypto.randomUUID(),
  account: '',
  login: '',
  vault_url: '',
  two_fa_held_by: '',
});

const rows = (count, factory) => Array.from({ length: count }, factory);

const isBlankAsset = (a) => !a.type && !a.provider.trim() && !a.owned_by && !a.expiry_date && !a.auto_renew;
const isBlankAccess = (r) => !r.account && !r.login.trim() && !r.vault_url.trim() && !r.two_fa_held_by;

const toNumber = (value) => (value === '' ? null : Number(value));
const toggle = (list, value, on) => (on ? [...list, value] : list.filter((v) => v !== value));

/**
 * Blank rows are dropped before sending, so server error keys like
 * "assets.0.type" refer to the filtered list. Map them back to the row the
 * user actually sees.
 */
function remapRowErrors(fields, prefix, indexMap) {
  const result = {};
  for (const [key, message] of Object.entries(fields)) {
    const match = key.match(new RegExp(`^${prefix}\\.(\\d+)\\.(.+)$`));
    result[match ? `${prefix}.${indexMap[Number(match[1])]}.${match[2]}` : key] = message;
  }
  return result;
}

function rowErrors(errors, prefix, index) {
  const start = `${prefix}.${index}.`;
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith(start)));
}

function FormHeader() {
  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Dashboard</Link> / <span>New AMC</span>
      </nav>
      <h1>New AMC</h1>
      <p className="muted">Set up the contract, the site&apos;s assets and reminders in one go.</p>
    </>
  );
}

export default function NewAmc() {
  const navigate = useNavigate();
  const formRef = useRef(null);

  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [client, setClient] = useState(emptyClient);
  const [contract, setContract] = useState(emptyContract);
  const [assets, setAssets] = useState(() => rows(INITIAL_ASSET_ROWS, newAsset));
  const [accessRefs, setAccessRefs] = useState(() => rows(INITIAL_ACCESS_ROWS, newAccessRef));
  const [agreement, setAgreement] = useState(null);

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getOptions(controller.signal)
      .then(setOptions)
      .catch((err) => {
        if (err.name !== 'AbortError') setLoadError(err.message);
      });
    return () => controller.abort();
  }, []);

  // Move focus to the first invalid field only right after a failed save, not
  // while the user is fixing fields (which also changes `errors`).
  const focusFirstError = useRef(false);
  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [errors]);

  // Editing a field clears its error message.
  const clearError = (key) =>
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key]: _removed, ...rest } = current;
      return rest;
    });

  const setClientField = (field) => (value) => {
    clearError(`client.${field}`);
    setClient((c) => ({ ...c, [field]: value }));
  };
  const setContractField = (field) => (value) => {
    clearError(`contract.${field}`);
    setContract((c) => ({ ...c, [field]: value }));
  };
  const updateRow = (setter, prefix, index, field) => (value) => {
    clearError(`${prefix}.${index}.${field}`);
    setter((list) => list.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  // Props shared by every input bound to a top-level field.
  const bind = (section, field, setter) => (id, describedBy) => ({
    id,
    describedBy,
    error: errors[`${section}.${field}`],
    value: (section === 'client' ? client : contract)[field],
    onChange: setter(field),
  });
  const clientInput = (field) => bind('client', field, setClientField);
  const contractInput = (field) => bind('contract', field, setContractField);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const assetIndexMap = [];
    const assetPayload = [];
    assets.forEach((asset, index) => {
      if (isBlankAsset(asset)) return;
      assetIndexMap.push(index);
      const { key: _key, ...rest } = asset;
      assetPayload.push(rest);
    });

    const accessIndexMap = [];
    const accessPayload = [];
    accessRefs.forEach((ref, index) => {
      if (isBlankAccess(ref)) return;
      accessIndexMap.push(index);
      const { key: _key, ...rest } = ref;
      accessPayload.push(rest);
    });

    const payload = {
      client,
      contract: {
        ...contract,
        hours_quota: toNumber(contract.hours_quota),
        content_updates_per_month: toNumber(contract.content_updates_per_month),
        annual_fee: toNumber(contract.annual_fee),
        gst_rate: toNumber(contract.gst_rate),
        renewal_increase_pct: toNumber(contract.renewal_increase_pct),
        out_of_scope_rate: toNumber(contract.out_of_scope_rate),
        password_rotation_months: toNumber(contract.password_rotation_months),
      },
      assets: assetPayload,
      access_refs: accessPayload,
    };

    setSaving(true);
    try {
      await api.createAmc(payload, agreement);
      navigate('/', { state: { flash: `AMC created for ${client.name.trim()}.` } });
    } catch (err) {
      setSaving(false);
      let fields = remapRowErrors(err.fields, 'assets', assetIndexMap);
      fields = remapRowErrors(fields, 'access_refs', accessIndexMap);
      setFormError(err.message);
      focusFirstError.current = true;
      setErrors(fields);
    }
  }

  if (loadError) {
    return (
      <div className="alert alert-error" role="alert">
        Could not load the form: {loadError}
      </div>
    );
  }
  if (!options) {
    return (
      <div className="amc-form">
        <FormHeader />
        <FormSkeleton />
      </div>
    );
  }

  const contentUpdatesOn = contract.scope.includes(CONTENT_UPDATES);

  return (
    <form ref={formRef} className="amc-form" onSubmit={handleSubmit} noValidate>
      <FormHeader />

      {formError && (
        <div className="alert alert-error" role="alert">
          {formError}
        </div>
      )}

      <fieldset className="card section">
        <legend>1 · Client &amp; site</legend>
        <div className="grid grid-3">
          <Field label="Client / company name" error={errors['client.name']}>
            {(id, d) => <TextInput {...clientInput('name')(id, d)} autoComplete="organization" />}
          </Field>
          <Field label="GSTIN" error={errors['client.gstin']}>
            {(id, d) => <TextInput {...clientInput('gstin')(id, d)} placeholder="Optional" maxLength={15} />}
          </Field>
          <Field label="Contact person" error={errors['client.contact_person']}>
            {(id, d) => <TextInput {...clientInput('contact_person')(id, d)} autoComplete="name" />}
          </Field>
          <Field label="Email" error={errors['client.email']}>
            {(id, d) => <TextInput {...clientInput('email')(id, d)} type="email" autoComplete="email" />}
          </Field>
          <Field label="Phone / WhatsApp" error={errors['client.phone']}>
            {(id, d) => <TextInput {...clientInput('phone')(id, d)} type="tel" autoComplete="tel" />}
          </Field>
          <Field label="Website URL" error={errors['contract.website_url']}>
            {(id, d) => <TextInput {...contractInput('website_url')(id, d)} type="url" placeholder="https://" />}
          </Field>
          <Field label="Platform" error={errors['contract.platform']}>
            {(id, d) => <Select {...contractInput('platform')(id, d)} options={options.platform} placeholder="Select platform" />}
          </Field>
        </div>
      </fieldset>

      <fieldset className="card section">
        <legend>2 · Contract, scope &amp; SLA</legend>
        <div className="grid grid-4">
          <Field label="Plan" error={errors['contract.plan']}>
            {(id, d) => <Select {...contractInput('plan')(id, d)} options={options.plan} placeholder="Select plan" />}
          </Field>
          <Field label="Start date" error={errors['contract.start_date']}>
            {(id, d) => <TextInput {...contractInput('start_date')(id, d)} type="date" />}
          </Field>
          <Field label="End date" error={errors['contract.end_date']}>
            {(id, d) => (
              <TextInput {...contractInput('end_date')(id, d)} type="date" min={contract.start_date || undefined} />
            )}
          </Field>
          <Field label="Hours quota / month" error={errors['contract.hours_quota']}>
            {(id, d) => <TextInput {...contractInput('hours_quota')(id, d)} type="number" min="0" step="0.5" />}
          </Field>
          <Field label="Critical response" error={errors['contract.critical_response']}>
            {(id, d) => <Select {...contractInput('critical_response')(id, d)} options={options.criticalResponse} placeholder="Select critical response" />}
          </Field>
          <Field label="Normal response" error={errors['contract.normal_response']}>
            {(id, d) => <Select {...contractInput('normal_response')(id, d)} options={options.normalResponse} placeholder="Select normal response" />}
          </Field>
        </div>

        <p className="group-label">Included in scope</p>
        <div className="check-grid">
          {options.scope.map((item) =>
            item.value === CONTENT_UPDATES ? (
              <Checkbox
                key={item.value}
                label="Content updates (per month:"
                checked={contentUpdatesOn}
                onChange={(on) => {
                  if (!on) clearError('contract.content_updates_per_month');
                  setContract((c) => ({ ...c, scope: toggle(c.scope, item.value, on) }));
                }}
              >
                <input
                  className="input input-inline"
                  type="number"
                  min="0"
                  step="1"
                  aria-label="Content updates per month"
                  aria-invalid={Boolean(errors['contract.content_updates_per_month'])}
                  disabled={!contentUpdatesOn}
                  value={contract.content_updates_per_month}
                  onChange={(e) => setContractField('content_updates_per_month')(e.target.value)}
                />
                <span>)</span>
              </Checkbox>
            ) : (
              <Checkbox
                key={item.value}
                label={item.label}
                checked={contract.scope.includes(item.value)}
                onChange={(on) => setContract((c) => ({ ...c, scope: toggle(c.scope, item.value, on) }))}
              />
            ),
          )}
        </div>
        {errors['contract.content_updates_per_month'] && (
          <p className="field-error">{errors['contract.content_updates_per_month']}</p>
        )}

        <Field label="Exclusions (billed separately)" error={errors['contract.exclusions']} className="full">
          {(id, d) => (
            <textarea
              id={id}
              className="input"
              rows={3}
              aria-describedby={d}
              aria-invalid={Boolean(errors['contract.exclusions'])}
              placeholder="e.g. new pages, redesign, SEO, third-party licence costs"
              value={contract.exclusions}
              onChange={(e) => setContractField('exclusions')(e.target.value)}
            />
          )}
        </Field>

        <Field label="Signed agreement" error={errors.agreement}>
          {(id, d) => (
            <input
              id={id}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              aria-describedby={d}
              aria-invalid={Boolean(errors.agreement)}
              onChange={(e) => setAgreement(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="card section">
        <legend>3 · Billing</legend>
        <div className="grid grid-4">
          <Field label="Annual fee (₹, before GST)" error={errors['contract.annual_fee']}>
            {(id, d) => <TextInput {...contractInput('annual_fee')(id, d)} type="number" min="0" step="1" />}
          </Field>
          <Field label="GST" error={errors['contract.gst_rate']}>
            {(id, d) => <Select {...contractInput('gst_rate')(id, d)} options={options.gstRate} placeholder="Select GST" />}
          </Field>
          <Field label="Billing cycle" error={errors['contract.billing_cycle']}>
            {(id, d) => <Select {...contractInput('billing_cycle')(id, d)} options={options.billingCycle} placeholder="Select billing cycle" />}
          </Field>
          <Field label="Renewal increase (%)" error={errors['contract.renewal_increase_pct']}>
            {(id, d) => (
              <TextInput {...contractInput('renewal_increase_pct')(id, d)} type="number" min="0" max="100" step="0.5" />
            )}
          </Field>
          <Field label="Out-of-scope rate (₹ / hour)" error={errors['contract.out_of_scope_rate']}>
            {(id, d) => <TextInput {...contractInput('out_of_scope_rate')(id, d)} type="number" min="0" step="1" />}
          </Field>
        </div>
        <div className="check-row billing-zoho">
          <Checkbox
            label="Create recurring invoices in Zoho Books automatically"
            checked={contract.zoho_recurring}
            onChange={setContractField('zoho_recurring')}
          />
        </div>
      </fieldset>

      <fieldset className="card section">
        <legend>4 · Domain, hosting, SSL &amp; licenses</legend>
        <div className="rows rows-assets">
          <div className="row-head">
            <span>Type</span>
            <span>Provider</span>
            <span>Owned / paid by</span>
            <span>Expiry</span>
            <span>Auto-renew</span>
          </div>
          {assets.map((asset, index) => {
            const err = (field) => errors[`assets.${index}.${field}`];
            return (
              <div className="row" key={asset.key}>
                <Select
                  aria-label={`Asset ${index + 1} type`}
                  error={err('type')}
                  value={asset.type}
                  onChange={updateRow(setAssets, 'assets', index, 'type')}
                  options={options.assetType} placeholder="Select type"
                />
                <input
                  className="input"
                  aria-label={`Asset ${index + 1} provider`}
                  aria-invalid={Boolean(err('provider'))}
                  placeholder={PROVIDER_PLACEHOLDER[asset.type]}
                  value={asset.provider}
                  onChange={(e) => updateRow(setAssets, 'assets', index, 'provider')(e.target.value)}
                />
                <Select
                  aria-label={`Asset ${index + 1} owned by`}
                  error={err('owned_by')}
                  value={asset.owned_by}
                  onChange={updateRow(setAssets, 'assets', index, 'owned_by')}
                  options={options.party} placeholder="Select owned / paid by"
                />
                <input
                  className="input"
                  type="date"
                  aria-label={`Asset ${index + 1} expiry`}
                  aria-invalid={Boolean(err('expiry_date'))}
                  value={asset.expiry_date}
                  onChange={(e) => updateRow(setAssets, 'assets', index, 'expiry_date')(e.target.value)}
                />
                <Checkbox
                  label="On"
                  checked={asset.auto_renew}
                  onChange={updateRow(setAssets, 'assets', index, 'auto_renew')}
                />
                <RowErrors errors={rowErrors(errors, 'assets', index)} />
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn-dashed" onClick={() => setAssets((list) => [...list, newAsset()])}>
          + Add asset
        </button>
      </fieldset>

      <fieldset className="card section">
        <legend>5 · Access references</legend>
        <p className="note">
          No password fields here by design. Save the password in your vault, then paste the vault entry link.
        </p>
        <div className="rows rows-access">
          <div className="row-head">
            <span>Account</span>
            <span>Login ID / email</span>
            <span>Vault entry link</span>
            <span>2FA held by</span>
          </div>
          {accessRefs.map((ref, index) => {
            const err = (field) => errors[`access_refs.${index}.${field}`];
            return (
              <div className="row" key={ref.key}>
                <Select
                  aria-label={`Account ${index + 1}`}
                  error={err('account')}
                  value={ref.account}
                  onChange={updateRow(setAccessRefs, 'access_refs', index, 'account')}
                  options={options.account} placeholder="Select account"
                />
                <input
                  className="input"
                  aria-label={`Account ${index + 1} login`}
                  aria-invalid={Boolean(err('login'))}
                  autoComplete="off"
                  value={ref.login}
                  onChange={(e) => updateRow(setAccessRefs, 'access_refs', index, 'login')(e.target.value)}
                />
                <input
                  className="input"
                  type="url"
                  aria-label={`Account ${index + 1} vault link`}
                  aria-invalid={Boolean(err('vault_url'))}
                  placeholder="https://vault..."
                  value={ref.vault_url}
                  onChange={(e) => updateRow(setAccessRefs, 'access_refs', index, 'vault_url')(e.target.value)}
                />
                <Select
                  aria-label={`Account ${index + 1} 2FA held by`}
                  error={err('two_fa_held_by')}
                  value={ref.two_fa_held_by}
                  onChange={updateRow(setAccessRefs, 'access_refs', index, 'two_fa_held_by')}
                  options={options.party} placeholder="Select 2FA held by"
                />
                <RowErrors errors={rowErrors(errors, 'access_refs', index)} />
              </div>
            );
          })}
        </div>
        <div className="inline-actions">
          <button
            type="button"
            className="btn btn-dashed"
            onClick={() => setAccessRefs((list) => [...list, newAccessRef()])}
          >
            + Add account
          </button>
          <label className="inline-label">
            Rotate passwords every
            <Select
              aria-label="Rotate passwords every"
              error={errors['contract.password_rotation_months']}
              value={contract.password_rotation_months}
              onChange={setContractField('password_rotation_months')}
              options={options.rotationMonths} placeholder="Select period"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="card section">
        <legend>6 · Reminders</legend>
        <div className="check-row">
          {options.reminderDays.map((item) => (
            <Checkbox
              key={item.value}
              label={item.label}
              checked={contract.reminder_days.includes(item.value)}
              onChange={(on) =>
                setContract((c) => ({ ...c, reminder_days: toggle(c.reminder_days, item.value, on) }))
              }
            />
          ))}
        </div>
        <div className="check-row">
          <Checkbox
            label="Also notify the client"
            checked={contract.notify_client}
            onChange={setContractField('notify_client')}
          />
          {options.channel.map((item) => (
            <Checkbox
              key={item.value}
              label={item.label}
              checked={contract.reminder_channels.includes(item.value)}
              onChange={(on) =>
                setContract((c) => ({ ...c, reminder_channels: toggle(c.reminder_channels, item.value, on) }))
              }
            />
          ))}
        </div>
      </fieldset>

      <div className="form-actions">
        <Link to="/" className="btn btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? (
            <>
              <Spinner /> Saving
            </>
          ) : (
            'Save AMC'
          )}
        </button>
      </div>
    </form>
  );
}
