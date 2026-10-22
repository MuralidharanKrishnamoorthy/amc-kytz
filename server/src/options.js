import { supabase } from './supabase.js';

// Form option key → lookup table, its primary-key column, and how to display
// a value (text lookups display their name as-is).
const SOURCES = {
  platform: { table: 'platforms', key: 'name' },
  plan: { table: 'plans', key: 'name' },
  criticalResponse: { table: 'critical_response_times', key: 'name' },
  normalResponse: { table: 'normal_response_times', key: 'name' },
  gstRate: { table: 'gst_rates', key: 'rate', format: (rate) => `${rate}%` },
  billingCycle: { table: 'billing_cycles', key: 'name' },
  scope: { table: 'scope_items', key: 'name' },
  assetType: { table: 'asset_types', key: 'name' },
  party: { table: 'parties', key: 'name' },
  account: { table: 'account_types', key: 'name' },
  rotationMonths: {
    table: 'password_rotation_periods',
    key: 'months',
    format: (months) => `${months} ${months === 1 ? 'month' : 'months'}`,
  },
  reminderDays: {
    table: 'reminder_offsets',
    key: 'days',
    // Design: "60 days before", "30 days", "15 days", "7 days"
    format: (days, index) => `${days} ${days === 1 ? 'day' : 'days'}${index === 0 ? ' before' : ''}`,
  },
  channel: { table: 'reminder_channels', key: 'name' },
};

// Scope item that carries a "per month" count.
export const CONTENT_UPDATES = 'Content updates';

const CACHE_TTL_MS = 60 * 1000;
let cache = null;

async function fetchOptions() {
  const entries = await Promise.all(
    Object.entries(SOURCES).map(async ([name, { table, key, format = String }]) => {
      const { data, error } = await supabase.from(table).select(key).order('sort_order');
      if (error) throw error;
      return [
        name,
        data.map((row, index) => ({ value: row[key], label: format(row[key], index) })),
      ];
    }),
  );
  return Object.fromEntries(entries);
}

/** Form options read from the lookup tables, cached briefly. */
export async function getOptions() {
  if (cache && cache.expires > Date.now()) return cache.value;
  const value = await fetchOptions();
  cache = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

export const valuesOf = (options, key) => options[key].map((option) => option.value);
