import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Checkbox, Field, GroupCheckbox, RowErrors, Select, TextInput } from '../components/FormControls.jsx';
import { groupByCategory, groupByFrequency } from '../lib/scope.js';
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

const asText = (value) => (value === null || value === undefined ? '' : String(value));

/**
 * Turns a saved AMC (GET /api/amcs/:id) into form state. List values that are
 * no longer offered (e.g. a removed scope item) are dropped so they don't fail
 * validation invisibly; single values are kept so the field shows an error.
 */
function toFormState(amc, options) {
  const known = (key, list) => list.filter((v) => options[key].some((o) => o.value === v));
  const k = amc.contract;
  return {
    client: Object.fromEntries(Object.keys(emptyClient).map((f) => [f, asText(amc.client[f])])),
    contract: {
      ...Object.fromEntries(Object.keys(emptyContract).map((f) => [f, asText(k[f])])),
      scope: known('scope', k.scope),
      reminder_days: known('reminderDays', k.reminder_days),
      reminder_channels: known('channel', k.reminder_channels),
      zoho_recurring: Boolean(k.zoho_recurring),
      notify_client: Boolean(k.notify_client),
    },
    assets: amc.assets.length
      ? amc.assets.map((a) => ({
          key: crypto.randomUUID(),
          type: asText(a.type),
          provider: asText(a.provider),
          owned_by: asText(a.owned_by),
          expiry_date: asText(a.expiry_date),
          auto_renew: Boolean(a.auto_renew),
        }))
      : rows(INITIAL_ASSET_ROWS, newAsset),
    accessRefs: amc.access_refs.length
      ? amc.access_refs.map((r) => ({
          key: crypto.randomUUID(),
          account: asText(r.account),
          login: asText(r.login),
          vault_url: asText(r.vault_url),
          two_fa_held_by: asText(r.two_fa_held_by),
        }))
      : rows(INITIAL_ACCESS_ROWS, newAccessRef),
  };
}

function FormHeader({ editing }) {
  if (editing) {
    return (
      <>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Dashboard</Link> / <Link to="/clients">Clients &amp; sites</Link>
          {editing.siteId && (
            <>
              {' '}/ <Link to={`/sites/${editing.siteId}`}>{editing.clientName}</Link>
            </>
          )}{' '}
          / <span>Edit AMC</span>
        </nav>
        <h1>Edit AMC</h1>
        <p className="muted">Change any detail of this AMC. Nothing is saved until you click Save changes.</p>
      </>
    );
  }
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

/**
 * New AMC (/amcs/new) and Edit AMC (/amcs/:id/edit) share this form. Keyed by
 * the id so switching between them always starts from fresh state.
 */
export default function AmcFormPage() {
  const { id } = useParams();
  return <AmcForm key={id ?? 'new'} editId={id ?? null} />;
}

function AmcForm({ editId }) {
  const navigate = useNavigate();
  const formRef = useRef(null);
  // Edit mode: { siteId, clientName, hasAgreement } once the AMC has loaded.
  const [editing, setEditing] = useState(null);
  // Edit mode: the user chose to remove the saved signed agreement.
  const [removeSavedAgreement, setRemoveSavedAgreement] = useState(false);

  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [client, setClient] = useState(emptyClient);
  const [contract, setContract] = useState(emptyContract);
  const [assets, setAssets] = useState(() => rows(INITIAL_ASSET_ROWS, newAsset));
  const [accessRefs, setAccessRefs] = useState(() => rows(INITIAL_ACCESS_ROWS, newAccessRef));
  const [agreement, setAgreement] = useState(null);
  // Section filter chosen inside each frequency dropdown ('all' when unset).
  const [scopeCategoryFilter, setScopeCategoryFilter] = useState({});
  const setScopeCategory = (frequency, category) =>
    setScopeCategoryFilter((current) => ({ ...current, [frequency]: category }));

  // Scope frequency dropdowns that are open (all closed to start).
  const [openScope, setOpenScope] = useState(() => new Set());
  const toggleScopeGroup = (frequency) =>
    setOpenScope((open) => {
      const next = new Set(open);
      if (next.has(frequency)) next.delete(frequency);
      else next.add(frequency);
      return next;
    });
  const agreementInput = useRef(null);

  // Clears the chosen file (the browser input keeps its own value, so reset it too).
  const removeAgreement = () => {
    setAgreement(null);
    clearError('agreement');
    if (agreementInput.current) agreementInput.current.value = '';
  };

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load the dropdown options and, when editing, the saved AMC; the form shows
  // once both are in so it never flashes empty fields.
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.getOptions(controller.signal), editId ? api.getAmc(editId, controller.signal) : null])
      .then(([opts, amc]) => {
        if (amc) {
          const form = toFormState(amc, opts);
          setClient(form.client);
          setContract(form.contract);
          setAssets(form.assets);
          setAccessRefs(form.accessRefs);
          setEditing({ siteId: amc.siteId, clientName: amc.client.name, hasAgreement: amc.hasAgreement });
          // Open the scope dropdowns that have ticked items.
          setOpenScope(
            new Set(opts.scope.filter((o) => form.contract.scope.includes(o.value)).map((o) => o.frequency).filter(Boolean)),
          );
        }
        setOptions(opts);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setLoadError(err.status === 404 ? 'This AMC was not found.' : err.message);
      });
    return () => controller.abort();
  }, [editId]);

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

  // Normal response options depend on the plan (plan_normal_responses).
  // null = no restriction configured for that plan.
  const allowedNormal = (plan) => options?.normalResponseByPlan?.[plan] ?? null;

  // Changing the plan drops a normal response the new plan doesn't allow.
  const changePlan = (plan) => {
    clearError('contract.plan');
    setContract((c) => {
      const allowed = allowedNormal(plan);
      const keep = !allowed || allowed.includes(c.normal_response);
      return { ...c, plan, normal_response: keep ? c.normal_response : '' };
    });
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
      if (editId) {
        const saved = await api.updateAmc(editId, payload, agreement, removeSavedAgreement);
        navigate(`/sites/${saved.siteId}`, { state: { flash: 'AMC updated.' } });
      } else {
        await api.createAmc(payload, agreement);
        navigate('/', { state: { flash: `AMC created for ${client.name.trim()}.` } });
      }
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
        <FormHeader editing={editId ? {} : null} />
        <FormSkeleton />
      </div>
    );
  }

  const contentUpdatesOn = contract.scope.includes(CONTENT_UPDATES);

  const toggleScope = (value) => (on) => setContract((c) => ({ ...c, scope: toggle(c.scope, value, on) }));

  // One scope checkbox. A "Content updates" item also carries a per-month count.
  const renderScopeItem = (item) =>
    item.value === CONTENT_UPDATES ? (
      <Checkbox
        key={item.value}
        label="Content updates (per month:"
        checked={contentUpdatesOn}
        onChange={(on) => {
          if (!on) clearError('contract.content_updates_per_month');
          toggleScope(item.value)(on);
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
        onChange={toggleScope(item.value)}
      />
    );

  // Locked until a plan is picked, when plan rules exist; then only that plan's options.
  const normalResponseLocked = Boolean(options.normalResponseByPlan) && !contract.plan;
  const planNormal = allowedNormal(contract.plan);
  const normalResponseOptions = planNormal
    ? options.normalResponse.filter((o) => planNormal.includes(o.value))
    : options.normalResponse;

  return (
    <form ref={formRef} className="amc-form" onSubmit={handleSubmit} noValidate>
      <FormHeader editing={editing} />

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
            {(id, d) => (
              <Select {...contractInput('plan')(id, d)} onChange={changePlan} options={options.plan} placeholder="Select plan" />
            )}
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
            {(id, d) => (
              <Select
                {...contractInput('normal_response')(id, d)}
                options={normalResponseOptions}
                disabled={normalResponseLocked}
                placeholder={normalResponseLocked ? 'Select a plan first' : 'Select normal response'}
              />
            )}
          </Field>
        </div>

        <p className="group-label">Included in scope</p>
        {groupByFrequency(options.scope, options.scopeFrequencies).map((group) => {
          const values = group.items.map((item) => item.value);
          const selected = values.filter((v) => contract.scope.includes(v)).length;
          // Items without a frequency (before the migration) are shown as a plain list.
          if (!group.frequency) {
            return (
              <div key="other" className="scope-group">
                <div className="check-grid">{group.items.map(renderScopeItem)}</div>
              </div>
            );
          }
          const open = openScope.has(group.frequency);
          const bodyId = `scope-${group.frequency.replace(/\W+/g, '-').toLowerCase()}`;
          return (
            <div key={group.frequency} className="scope-group">
              <div className="scope-head">
                <button
                  type="button"
                  className={`scope-toggle${open ? ' scope-toggle-open' : ''}`}
                  aria-expanded={open}
                  aria-controls={bodyId}
                  aria-label={`${open ? 'Hide' : 'Show'} ${group.frequency} items`}
                  onClick={() => toggleScopeGroup(group.frequency)}
                >
                  ▸
                </button>
                <GroupCheckbox
                  label={group.frequency}
                  selected={selected}
                  total={values.length}
                  onChange={(on) =>
                    setContract((c) => ({
                      ...c,
                      scope: on
                        ? [...new Set([...c.scope, ...values])]
                        : c.scope.filter((v) => !values.includes(v)),
                    }))
                  }
                />
              </div>
              {open &&
                (() => {
                  const categories = groupByCategory(group.items, options.scopeCategories);
                  const named = categories.filter((cat) => cat.category);
                  const active = scopeCategoryFilter[group.frequency] ?? 'all';
                  const shown = active === 'all' ? categories : categories.filter((cat) => cat.category === active);
                  return (
                    <div id={bodyId} className="scope-body">
                      {/* Excel sections inside this frequency, e.g. "Technical Maintenance". */}
                      {named.length > 0 && (
                        <div className="chips scope-chips" role="group" aria-label={`Filter ${group.frequency} by section`}>
                          {[{ category: 'all', label: 'All' }, ...named.map((c) => ({ category: c.category, label: c.category }))].map(
                            (chip) => (
                              <button
                                key={chip.category}
                                type="button"
                                className={`chip chip-sm${active === chip.category ? ' chip-active' : ''}`}
                                aria-pressed={active === chip.category}
                                onClick={() => setScopeCategory(group.frequency, chip.category)}
                              >
                                {chip.label}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                      {shown.map((cat) => (
                        <div key={cat.category ?? 'other'} className="scope-category">
                          {cat.category && <p className="scope-category-name">{cat.category}</p>}
                          <div className="check-grid">{cat.items.map(renderScopeItem)}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
            </div>
          );
        })}
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
            <div className="file-row">
              <input
                ref={agreementInput}
                id={id}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                aria-describedby={d}
                aria-invalid={Boolean(errors.agreement)}
                onChange={(e) => {
                  clearError('agreement');
                  setAgreement(e.target.files?.[0] ?? null);
                }}
              />
              {agreement && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={removeAgreement}>
                  Remove
                </button>
              )}
            </div>
          )}
        </Field>
        {/* Edit mode: the agreement already saved on this AMC. */}
        {editing?.hasAgreement && (
          <p className="saved-file small">
            {agreement ? (
              <span className="muted">The saved agreement will be replaced by the file chosen above.</span>
            ) : removeSavedAgreement ? (
              <>
                <span className="muted">The saved agreement will be removed when you save.</span>
                <button type="button" className="link-button" onClick={() => setRemoveSavedAgreement(false)}>
                  Undo
                </button>
              </>
            ) : (
              <>
                <span className="muted">Saved agreement:</span>
                <a href={api.agreementUrl(editing.siteId, editId)} target="_blank" rel="noopener noreferrer">
                  View
                </a>
                <button type="button" className="link-button" onClick={() => setRemoveSavedAgreement(true)}>
                  Remove
                </button>
              </>
            )}
          </p>
        )}
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
              <Select
                {...contractInput('renewal_increase_pct')(id, d)}
                options={options.renewalIncrease}
                placeholder="Select renewal increase"
              />
            )}
          </Field>
          <Field label="Out-of-scope rate (₹ / hour)" error={errors['contract.out_of_scope_rate']}>
            {(id, d) => (
              <Select
                {...contractInput('out_of_scope_rate')(id, d)}
                options={options.outOfScopeRate}
                placeholder="Select out-of-scope rate"
              />
            )}
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
        <Link to={editing?.siteId ? `/sites/${editing.siteId}` : '/'} className="btn btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? (
            <>
              <Spinner /> Saving
            </>
          ) : (
            editId ? 'Save changes' : 'Save AMC'
          )}
        </button>
      </div>
    </form>
  );
}
