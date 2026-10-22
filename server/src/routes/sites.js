import { Router } from 'express';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { HttpError } from '../lib/http-error.js';
import { today, daysBetween } from '../lib/dates.js';

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AGREEMENT_LINK_TTL_SECONDS = 60;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function contractStatus(contract, todayIso) {
  if (contract.start_date > todayIso) return 'upcoming';
  if (contract.end_date < todayIso) return 'expired';
  return 'active';
}

/**
 * The contract to feature on the page: the one running today, otherwise the
 * next one to start, otherwise the most recently ended.
 */
function pickCurrent(contracts) {
  return (
    contracts.find((c) => c.status === 'active') ??
    contracts.filter((c) => c.status === 'upcoming').at(-1) ??
    contracts.find((c) => c.status === 'expired') ??
    null
  );
}

/**
 * List status for a website, from its featured contract:
 * expiring = running and ends within 30 days.
 */
const EXPIRING_WINDOW_DAYS = 30;
function listStatus(contract) {
  if (!contract) return 'none';
  if (contract.status === 'active' && contract.daysLeft <= EXPIRING_WINDOW_DAYS) return 'expiring';
  return contract.status;
}

// Every website, one row each, for the Clients & sites page.
router.get('/', async (_req, res) => {
  const { data: sites, error } = await supabase.from('sites').select(`
      id, website_url, platform,
      client:clients ( name ),
      contracts ( id, start_date, end_date, annual_fee ),
      assets ( asset_type, expiry_date )
    `);
  if (error) throw error;

  const todayIso = today();
  const rows = sites.map((site) => {
    const contracts = site.contracts
      .map((c) => ({ ...c, status: contractStatus(c, todayIso), daysLeft: daysBetween(todayIso, c.end_date) }))
      .sort((a, b) => b.end_date.localeCompare(a.end_date));
    const current = pickCurrent(contracts);
    // Soonest asset expiry; an already-expired one comes first and needs attention.
    const next = [...site.assets].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0];

    return {
      id: site.id,
      client: site.client?.name ?? '—',
      url: site.website_url,
      host: hostOf(site.website_url),
      platform: site.platform,
      status: listStatus(current),
      contract: current && {
        startDate: current.start_date,
        endDate: current.end_date,
        daysLeft: current.daysLeft,
        annualFee: Number(current.annual_fee),
      },
      nextExpiry: next && {
        type: next.asset_type,
        date: next.expiry_date,
        daysLeft: daysBetween(todayIso, next.expiry_date),
      },
    };
  });

  rows.sort((a, b) => a.client.localeCompare(b.client) || a.host.localeCompare(b.host));
  res.json({ today: todayIso, sites: rows });
});

router.get('/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) throw new HttpError(404, 'Website not found');

  const { data: site, error } = await supabase
    .from('sites')
    .select(`
      id, website_url, platform,
      client:clients ( name, contact_person, phone ),
      contracts (
        id, plan, start_date, end_date, hours_quota, critical_response, normal_response,
        content_updates_per_month, exclusions, agreement_path, annual_fee, gst_rate,
        billing_cycle, renewal_increase_pct,
        contract_scope_items ( scope_item, item:scope_items ( sort_order ) )
      ),
      assets ( id, asset_type, provider, owned_by, expiry_date, auto_renew, type:asset_types ( sort_order ) ),
      access_refs ( id, account_type, login, vault_url, two_fa_held_by, account:account_types ( sort_order ) )
    `)
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw error;
  if (!site) throw new HttpError(404, 'Website not found');

  const todayIso = today();
  const bySortOrder = (key) => (a, b) => (a[key]?.sort_order ?? 0) - (b[key]?.sort_order ?? 0);

  const contracts = site.contracts
    .map(({ contract_scope_items: scopeItems, agreement_path: agreementPath, ...c }) => ({
      ...c,
      annual_fee: Number(c.annual_fee),
      gst_rate: Number(c.gst_rate),
      hours_quota: c.hours_quota === null ? null : Number(c.hours_quota),
      renewal_increase_pct: c.renewal_increase_pct === null ? null : Number(c.renewal_increase_pct),
      scope: scopeItems.sort(bySortOrder('item')).map((s) => s.scope_item),
      hasAgreement: Boolean(agreementPath),
      status: contractStatus(c, todayIso),
      daysLeft: daysBetween(todayIso, c.end_date),
    }))
    .sort((a, b) => b.end_date.localeCompare(a.end_date));

  const current = pickCurrent(contracts);

  res.json({
    today: todayIso,
    site: {
      id: site.id,
      url: site.website_url,
      host: hostOf(site.website_url),
      platform: site.platform,
    },
    client: site.client,
    contract: current,
    otherContracts: contracts.filter((c) => c !== current),
    assets: site.assets
      .sort((a, b) => bySortOrder('type')(a, b) || a.expiry_date.localeCompare(b.expiry_date))
      .map(({ type: _type, ...a }) => ({ ...a, daysLeft: daysBetween(todayIso, a.expiry_date) })),
    accessRefs: site.access_refs
      .sort(bySortOrder('account'))
      .map(({ account: _account, ...r }) => r),
  });
});

// Signed agreement: redirect to a short-lived link to the private file.
router.get('/:id/contracts/:contractId/agreement', async (req, res) => {
  const { id, contractId } = req.params;
  if (!UUID.test(id) || !UUID.test(contractId)) throw new HttpError(404, 'Agreement not found');

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('agreement_path')
    .eq('id', contractId)
    .eq('site_id', id)
    .maybeSingle();
  if (error) throw error;
  if (!contract?.agreement_path) throw new HttpError(404, 'Agreement not found');

  const { data, error: signError } = await supabase.storage
    .from(config.agreementsBucket)
    .createSignedUrl(contract.agreement_path, AGREEMENT_LINK_TTL_SECONDS);
  if (signError) throw signError;

  res.redirect(data.signedUrl);
});

export default router;
