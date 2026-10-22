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

export default router;
