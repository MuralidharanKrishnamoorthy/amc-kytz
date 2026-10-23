import { Router } from 'express';
import { supabase } from '../supabase.js';
import { today, addDays, daysBetween } from '../lib/dates.js';

const router = Router();

const EXPIRING_WINDOW_DAYS = 30;

// Contracts share the list with assets, whose kind is their asset_types name.
const AMC_KIND = 'AMC';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Flattens every site's contracts and assets into one list of dated items so
 * the dashboard can treat "AMC ends" and "domain expires" the same way.
 */
function toItems(sites, todayIso) {
  const items = [];
  for (const site of sites) {
    const base = {
      siteId: site.id,
      site: hostOf(site.website_url),
      url: site.website_url,
      client: site.client?.name ?? '—',
    };

    // A contract has no auto-renew of its own; its row shows the website's
    // domain auto-renew instead (soonest-expiring domain if there are several).
    const domain = site.assets
      .filter((a) => a.asset_type === 'Domain')
      .sort((a, b) => (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999'))[0];

    for (const contract of site.contracts) {
      items.push({
        ...base,
        id: `contract:${contract.id}`,
        kind: AMC_KIND,
        detail: contract.plan,
        expiry: contract.end_date,
        daysLeft: daysBetween(todayIso, contract.end_date),
        autoRenew: null,
        domainAutoRenew: domain ? domain.auto_renew : null,
      });
    }

    // Assets without an expiry date (e.g. hosting known only by its provider)
    // have nothing to count down to.
    for (const asset of site.assets.filter((a) => a.expiry_date)) {
      items.push({
        ...base,
        id: `asset:${asset.id}`,
        kind: asset.asset_type,
        detail: asset.provider,
        expiry: asset.expiry_date,
        daysLeft: daysBetween(todayIso, asset.expiry_date),
        autoRenew: asset.auto_renew,
      });
    }
  }
  return items.sort((a, b) => a.expiry.localeCompare(b.expiry));
}

router.get('/', async (_req, res) => {
  const { data: sites, error } = await supabase.from('sites').select(`
      id, website_url, client_id,
      client:clients ( name ),
      contracts ( id, plan, end_date, annual_fee ),
      assets ( id, asset_type, provider, expiry_date, auto_renew )
    `);

  if (error) throw error;

  const todayIso = today();
  const windowEnd = addDays(todayIso, EXPIRING_WINDOW_DAYS);

  let activeAmcs = 0;
  let annualValue = 0;
  const activeClients = new Set();
  for (const site of sites) {
    for (const contract of site.contracts) {
      if (contract.end_date < todayIso) continue;
      activeAmcs += 1;
      annualValue += Number(contract.annual_fee);
      activeClients.add(site.client_id);
    }
  }

  const items = toItems(sites, todayIso);
  const expiringSoon = items.filter((i) => i.expiry >= todayIso && i.expiry <= windowEnd);
  const byKind = expiringSoon.reduce(
    (acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }),
    {},
  );

  res.json({
    today: todayIso,
    stats: {
      activeAmcs,
      activeClients: activeClients.size,
      annualValue,
      monthlyValue: annualValue / 12,
      expiringSoon: {
        windowDays: EXPIRING_WINDOW_DAYS,
        total: expiringSoon.length,
        byKind,
      },
      // Invoicing and uptime monitoring are not built yet.
      overdueInvoices: { total: 0, outstanding: 0 },
      sitesDown: { total: 0 },
    },
    // Sorted by expiry, so already-expired items (negative daysLeft) come first.
    upcoming: items,
  });
});

export default router;
