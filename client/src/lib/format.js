const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹1,55,000 */
export function formatRupees(amount) {
  return `₹${inr.format(Math.round(amount))}`;
}

/** ₹18.6L, ₹1.2Cr, or the full amount below one lakh. */
export function formatRupeesCompact(amount) {
  const trim = (n) => n.toFixed(1).replace(/\.0$/, '');
  if (amount >= 1e7) return `₹${trim(amount / 1e7)}Cr`;
  if (amount >= 1e5) return `₹${trim(amount / 1e5)}L`;
  return formatRupees(amount);
}

const toUtcDate = (iso) => new Date(`${iso}T00:00:00Z`);

/** 21 Oct 2026 */
export function formatDate(iso) {
  return toUtcDate(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Wednesday, 21 October 2026 */
export function formatLongDate(iso) {
  const date = toUtcDate(iso);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const rest = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${weekday}, ${rest}`;
}

export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
