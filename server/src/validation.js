import { z } from 'zod';
import { CONTENT_UPDATES, allowedNormalResponses, valuesOf } from './options.js';

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PHONE = /^[+0-9 ()-]{7,20}$/;

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

const optionalText = (max = 200) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? emptyToNull(value.trim()) : value ?? null),
    z.string().max(max).nullable(),
  );

const requiredText = (label, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

const isoDate = (label) => z.iso.date({ error: `${label} must be a valid date` });

const optionalNumber = (schema) => z.preprocess(emptyToNull, schema.nullable());

const uniqueList = (schema) => z.array(schema).transform((list) => [...new Set(list)]);

/**
 * Builds the New AMC schema against the current lookup-table options, so only
 * values that exist in the database are accepted.
 */
export function buildAmcSchema(options) {
  const pick = (key, label) =>
    z
      .string({ error: `Select ${label}` })
      .refine((value) => valuesOf(options, key).includes(value), `Select ${label}`);

  const pickNumber = (key, label) =>
    z
      .number({ error: `Select ${label}` })
      .refine((value) => valuesOf(options, key).includes(value), `Select ${label}`);

  const clientSchema = z.object({
    name: requiredText('Client name'),
    gstin: optionalText(15)
      .transform((value) => (value ? value.toUpperCase() : null))
      .refine((value) => !value || GSTIN.test(value), 'GSTIN format is invalid'),
    contact_person: optionalText(),
    email: z.preprocess(emptyToNull, z.email('Email is invalid').nullable()),
    phone: optionalText(20).refine((value) => !value || PHONE.test(value), 'Phone number is invalid'),
  });

  const contractSchema = z
    .object({
      website_url: z.url({
        protocol: /^https?$/,
        error: 'Enter a full URL starting with http:// or https://',
      }),
      platform: pick('platform', 'a platform'),
      plan: pick('plan', 'a plan'),
      start_date: isoDate('Start date'),
      end_date: isoDate('End date'),
      hours_quota: optionalNumber(z.number().nonnegative('Hours cannot be negative')),
      critical_response: pick('criticalResponse', 'a critical response time'),
      normal_response: pick('normalResponse', 'a normal response time'),
      scope: uniqueList(pick('scope', 'a scope item')),
      content_updates_per_month: optionalNumber(z.number().int().nonnegative()),
      exclusions: optionalText(2000),
      annual_fee: z
        .number({ error: 'Annual fee is required' })
        .nonnegative('Annual fee cannot be negative'),
      gst_rate: pickNumber('gstRate', 'a GST rate'),
      billing_cycle: pick('billingCycle', 'a billing cycle'),
      renewal_increase_pct: optionalNumber(pickNumber('renewalIncrease', 'a renewal increase')),
      out_of_scope_rate: optionalNumber(pickNumber('outOfScopeRate', 'an out-of-scope rate')),
      zoho_recurring: z.boolean(),
      password_rotation_months: optionalNumber(pickNumber('rotationMonths', 'a rotation period')),
      reminder_days: uniqueList(pickNumber('reminderDays', 'a reminder')),
      notify_client: z.boolean(),
      reminder_channels: uniqueList(pick('channel', 'a channel')),
    })
    .refine(
      (c) => {
        const allowed = allowedNormalResponses(options, c.plan);
        return !allowed || allowed.includes(c.normal_response);
      },
      { path: ['normal_response'], message: 'Not available on the selected plan' },
    )
    .refine((c) => c.end_date > c.start_date, {
      path: ['end_date'],
      message: 'End date must be after the start date',
    })
    .refine((c) => !c.scope.includes(CONTENT_UPDATES) || c.content_updates_per_month != null, {
      path: ['content_updates_per_month'],
      message: 'Enter the number of content updates per month',
    })
    .transform((c) => ({
      ...c,
      content_updates_per_month: c.scope.includes(CONTENT_UPDATES)
        ? c.content_updates_per_month
        : null,
    }));

  const assetSchema = z.object({
    type: pick('assetType', 'a type'),
    provider: optionalText(),
    // Optional: e.g. hosting recorded with only its provider.
    owned_by: z.preprocess(emptyToNull, pick('party', 'who owns it').nullable()),
    expiry_date: z.preprocess(emptyToNull, isoDate('Expiry').nullable()),
    auto_renew: z.boolean(),
  });

  const accessRefSchema = z.object({
    account: pick('account', 'an account'),
    login: optionalText(),
    vault_url: z.preprocess(
      emptyToNull,
      z.url({ protocol: /^https$/, error: 'Vault link must be an https:// URL' }).nullable(),
    ),
    two_fa_held_by: z.preprocess(emptyToNull, pick('party', 'who holds 2FA').nullable()),
  });

  return z.object({
    client: clientSchema,
    contract: contractSchema,
    assets: z.array(assetSchema).max(50),
    access_refs: z.array(accessRefSchema).max(50),
  });
}

/** Turns a ZodError into { "contract.end_date": "message", ... }. */
export function fieldErrors(error) {
  const errors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
