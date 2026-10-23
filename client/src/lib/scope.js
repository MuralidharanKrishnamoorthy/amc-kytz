/**
 * Groups scope items by frequency in the given order, e.g.
 *   [{ frequency: 'Half Yearly Once', items: [...] }, { frequency: 'Monthly Once', ... }]
 * Items without a known frequency go in a final group with frequency null.
 * Empty groups are dropped.
 */
export function groupByFrequency(items, frequencies = []) {
  return groupBy(items, 'frequency', frequencies).map(({ key, items: list }) => ({ frequency: key, items: list }));
}

/**
 * Same, by category (the sheet's headings, e.g. "SEO Updates"):
 *   [{ category: 'Support & Consultation', items: [...] }, ...]
 */
export function groupByCategory(items, categories = []) {
  return groupBy(items, 'category', categories).map(({ key, items: list }) => ({ category: key, items: list }));
}

function groupBy(items, field, order) {
  const groups = order
    .map((key) => ({ key, items: items.filter((item) => item[field] === key) }))
    .filter((group) => group.items.length);
  const rest = items.filter((item) => !order.includes(item[field]));
  if (rest.length) groups.push({ key: null, items: rest });
  return groups;
}
