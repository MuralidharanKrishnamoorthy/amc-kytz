import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { HttpError } from '../lib/http-error.js';
import { getOptions } from '../options.js';
import { buildAmcSchema, fieldErrors } from '../validation.js';

const router = Router();

const ALLOWED_AGREEMENT_TYPES = new Map([
  ['application/pdf', '.pdf'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AGREEMENT_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, 'Validation failed', { agreement: 'Upload a PDF, PNG or JPG file' }));
  },
});

function parsePayload(raw) {
  if (typeof raw !== 'string') throw new HttpError(400, 'Missing form data');
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Form data is not valid JSON');
  }
}

async function uploadAgreement(file) {
  const ext = ALLOWED_AGREEMENT_TYPES.get(file.mimetype) ?? path.extname(file.originalname);
  const objectPath = `${new Date().getFullYear()}/${randomUUID()}${ext}`;
  const { error } = await supabase.storage
    .from(config.agreementsBucket)
    .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw error;
  return objectPath;
}

/** Maps validated form data onto the column names create_amc() expects. */
function toDbPayload({ client, contract, assets, access_refs }, agreementPath) {
  return {
    client,
    site: {
      website_url: contract.website_url,
      platform: contract.platform,
      password_rotation_months: contract.password_rotation_months,
    },
    contract: {
      plan: contract.plan,
      start_date: contract.start_date,
      end_date: contract.end_date,
      hours_quota: contract.hours_quota,
      critical_response: contract.critical_response,
      normal_response: contract.normal_response,
      content_updates_per_month: contract.content_updates_per_month,
      exclusions: contract.exclusions,
      agreement_path: agreementPath,
      annual_fee: contract.annual_fee,
      gst_rate: contract.gst_rate,
      billing_cycle: contract.billing_cycle,
      renewal_increase_pct: contract.renewal_increase_pct,
      out_of_scope_rate: contract.out_of_scope_rate,
      zoho_recurring: contract.zoho_recurring,
      notify_client: contract.notify_client,
      scope: contract.scope,
      reminder_days: contract.reminder_days,
      reminder_channels: contract.reminder_channels,
    },
    assets: assets.map((asset) => ({
      asset_type: asset.type,
      provider: asset.provider,
      owned_by: asset.owned_by,
      expiry_date: asset.expiry_date,
      auto_renew: asset.auto_renew,
    })),
    access_refs: access_refs.map((ref) => ({
      account_type: ref.account,
      login: ref.login,
      vault_url: ref.vault_url,
      two_fa_held_by: ref.two_fa_held_by,
    })),
  };
}

router.post('/', upload.single('agreement'), async (req, res) => {
  const schema = buildAmcSchema(await getOptions());
  const parsed = schema.safeParse(parsePayload(req.body.data));
  if (!parsed.success) {
    throw new HttpError(422, 'Please fix the highlighted fields', fieldErrors(parsed.error));
  }

  const agreementPath = req.file ? await uploadAgreement(req.file) : null;

  const { data: contractId, error } = await supabase.rpc('create_amc', {
    payload: toDbPayload(parsed.data, agreementPath),
  });

  if (error) {
    if (agreementPath) {
      await supabase.storage.from(config.agreementsBucket).remove([agreementPath]);
    }
    if (error.hint === 'site_client_mismatch') {
      throw new HttpError(409, 'Please fix the highlighted fields', {
        'contract.website_url': 'This website is already registered to another client',
      });
    }
    if (error.code === '23505') {
      throw new HttpError(409, 'This client or website was just created by someone else. Please retry.');
    }
    throw error;
  }

  res.status(201).json({ id: contractId });
});

// ── Edit ─────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const num = (value) => (value === null || value === undefined ? null : Number(value));
const bySortOrder = (key) => (a, b) => (a[key]?.sort_order ?? 0) - (b[key]?.sort_order ?? 0);

function assertContractId(id) {
  if (!UUID.test(id)) throw new HttpError(404, 'AMC not found');
}

/** Loads an AMC in the same shape the New AMC form sends, for editing. */
router.get('/:id', async (req, res) => {
  assertContractId(req.params.id);

  const { data: k, error } = await supabase
    .from('contracts')
    .select(`
      id, plan, start_date, end_date, hours_quota, critical_response, normal_response,
      content_updates_per_month, exclusions, agreement_path, annual_fee, gst_rate,
      billing_cycle, renewal_increase_pct, out_of_scope_rate, zoho_recurring, notify_client,
      contract_scope_items ( scope_item ),
      contract_reminder_offsets ( days ),
      contract_reminder_channels ( channel ),
      site:sites (
        id, website_url, platform, password_rotation_months,
        client:clients ( name, gstin, contact_person, email, phone ),
        assets ( asset_type, provider, owned_by, expiry_date, auto_renew, type:asset_types ( sort_order ) ),
        access_refs ( account_type, login, vault_url, two_fa_held_by, account:account_types ( sort_order ) )
      )
    `)
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw error;
  if (!k) throw new HttpError(404, 'AMC not found');

  const { site } = k;
  res.json({
    id: k.id,
    siteId: site.id,
    hasAgreement: Boolean(k.agreement_path),
    client: site.client,
    contract: {
      website_url: site.website_url,
      platform: site.platform,
      plan: k.plan,
      start_date: k.start_date,
      end_date: k.end_date,
      hours_quota: num(k.hours_quota),
      critical_response: k.critical_response,
      normal_response: k.normal_response,
      scope: k.contract_scope_items.map((s) => s.scope_item),
      content_updates_per_month: k.content_updates_per_month,
      exclusions: k.exclusions,
      annual_fee: num(k.annual_fee),
      gst_rate: num(k.gst_rate),
      billing_cycle: k.billing_cycle,
      renewal_increase_pct: num(k.renewal_increase_pct),
      out_of_scope_rate: num(k.out_of_scope_rate),
      zoho_recurring: k.zoho_recurring,
      password_rotation_months: site.password_rotation_months,
      reminder_days: k.contract_reminder_offsets.map((r) => r.days),
      notify_client: k.notify_client,
      reminder_channels: k.contract_reminder_channels.map((r) => r.channel),
    },
    assets: site.assets.sort(bySortOrder('type')).map((a) => ({
      type: a.asset_type,
      provider: a.provider,
      owned_by: a.owned_by,
      expiry_date: a.expiry_date,
      auto_renew: a.auto_renew,
    })),
    access_refs: site.access_refs.sort(bySortOrder('account')).map((r) => ({
      account: r.account_type,
      login: r.login,
      vault_url: r.vault_url,
      two_fa_held_by: r.two_fa_held_by,
    })),
  });
});

/**
 * Saves an edited AMC. Same multipart shape and validation as create, plus an
 * optional `remove_agreement=true` field. The signed agreement is kept unless
 * a new file is uploaded (replaces it) or removal is requested; the old file
 * is deleted only after the database update succeeds.
 */
router.put('/:id', upload.single('agreement'), async (req, res) => {
  assertContractId(req.params.id);

  const schema = buildAmcSchema(await getOptions());
  const parsed = schema.safeParse(parsePayload(req.body.data));
  if (!parsed.success) {
    throw new HttpError(422, 'Please fix the highlighted fields', fieldErrors(parsed.error));
  }

  const { data: existing, error: loadError } = await supabase
    .from('contracts')
    .select('agreement_path, site_id')
    .eq('id', req.params.id)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!existing) throw new HttpError(404, 'AMC not found');

  const oldPath = existing.agreement_path;
  const removeAgreement = req.body.remove_agreement === 'true';
  const newPath = req.file ? await uploadAgreement(req.file) : null;
  const finalPath = newPath ?? (removeAgreement ? null : oldPath);

  const { error } = await supabase.rpc('update_amc', {
    p_contract_id: req.params.id,
    payload: toDbPayload(parsed.data, finalPath),
  });

  if (error) {
    if (newPath) await supabase.storage.from(config.agreementsBucket).remove([newPath]);
    // PostgREST: function not found — the update_amc migration hasn't been run.
    if (error.code === 'PGRST202') {
      throw new HttpError(503, 'Editing is not set up yet: run supabase/migrations/apply_all_changes.sql in Supabase.');
    }
    if (error.hint === 'contract_not_found') throw new HttpError(404, 'AMC not found');
    if (error.hint === 'client_name_taken') {
      throw new HttpError(409, 'Please fix the highlighted fields', {
        'client.name': 'Another client already has this name',
      });
    }
    if (error.hint === 'site_url_taken' || error.code === '23505') {
      throw new HttpError(409, 'Please fix the highlighted fields', {
        'contract.website_url': 'This website is already registered to another AMC',
      });
    }
    throw error;
  }

  // The new record no longer points at the old file: remove it from storage.
  if (oldPath && oldPath !== finalPath) {
    await supabase.storage.from(config.agreementsBucket).remove([oldPath]);
  }

  res.json({ id: req.params.id, siteId: existing.site_id });
});

export default router;
