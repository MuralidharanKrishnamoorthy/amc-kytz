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
  renewalIncrease: { table: 'renewal_increase_rates', key: 'pct', format: (pct) => `${pct}%` },
  outOfScopeRate: {
    table: 'out_of_scope_rates',
    key: 'rate',
    format: (rate) => `₹${Number(rate).toLocaleString('en-IN')}`,
  },
  // Scope items also carry their frequency and category, used to group the checkboxes.
  scope: { table: 'scope_items', key: 'name', extra: ['frequency', 'category'] },
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

// PostgREST / Postgres codes for a table or column that doesn't exist yet.
const TABLE_MISSING = 'PGRST205';
const COLUMN_MISSING = '42703';

const CACHE_TTL_MS = 60 * 1000;
let cache = null;

async function fetchOptions() {
  const entries = await Promise.all(
    Object.entries(SOURCES).map(async ([name, { table, key, extra = [], format = String }]) => {
      const select = (columns) => supabase.from(table).select(columns.join(', ')).order('sort_order');
      // Extra columns come from migrations that may not have run yet: drop them
      // one at a time (newest last) until the query works.
      let columns = [...extra];
      let { data, error } = await select([key, ...columns]);
      while (error?.code === COLUMN_MISSING && columns.length) {
        columns = columns.slice(0, -1);
        ({ data, error } = await select([key, ...columns]));
      }
      // A lookup table whose migration hasn't run yet gives an empty list
      // instead of breaking the whole form.
      if (error?.code === TABLE_MISSING) return [name, []];
      if (error) throw error;
      return [
        name,
        data.map((row, index) => ({
          value: row[key],
          label: format(row[key], index),
          ...Object.fromEntries(extra.map((col) => [col, row[col] ?? null])),
        })),
      ];
    }),
  );
  const [normalResponseByPlan, scopeFrequencies, scopeCategories] = await Promise.all([
    fetchNormalResponseByPlan(),
    fetchNames('scope_frequencies'),
    fetchNames('scope_categories'),
  ]);
  return { ...Object.fromEntries(entries), normalResponseByPlan, scopeFrequencies, scopeCategories };
}

/** Names from a small lookup table in display order; [] if the table isn't set up yet. */
async function fetchNames(table) {
  const { data, error } = await supabase.from(table).select('name').order('sort_order');
  if (error?.code === TABLE_MISSING) return [];
  if (error) throw error;
  return data.map((row) => row.name);
}

/**
 * Normal response options allowed per plan, e.g.
 * { 'Plan C': ['Only weekdays'] }. null = no restriction (table not created yet).
 */
async function fetchNormalResponseByPlan() {
  const { data, error } = await supabase.from('plan_normal_responses').select('plan, normal_response');
  if (error?.code === TABLE_MISSING) return null;
  if (error) throw error;
  const byPlan = {};
  for (const { plan, normal_response: response } of data) {
    (byPlan[plan] ??= []).push(response);
  }
  return byPlan;
}

/** Normal response values allowed for a plan; null = any. */
export function allowedNormalResponses(options, plan) {
  return options.normalResponseByPlan?.[plan] ?? null;
}

/** Form options read from the lookup tables, cached briefly. */
export async function getOptions() {
  if (cache && cache.expires > Date.now()) return cache.value;
  const value = await fetchOptions();
  cache = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

export const valuesOf = (options, key) => options[key].map((option) => option.value);
