const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Case-insensitive pattern for a search term. Numbers only match whole
 * numbers, so "27" does not match inside "2027".
 */
function termPattern(term) {
  const start = /^\d/.test(term) ? '(?<!\\d)' : '';
  const end = /\d$/.test(term) ? '(?!\\d)' : '';
  return new RegExp(`${start}${escapeRegExp(term)}${end}`, 'i');
}

/**
 * Universal search over the values each row displays.
 *
 * 1. If any row contains the whole query as a phrase ("27 oct", "20 days"),
 *    only those rows are returned.
 * 2. Otherwise a row matches when every word appears somewhere in it, in any
 *    order ("godaddy domain").
 *
 * Values are joined with newlines so a phrase never spans two columns.
 */
export function searchRows(rows, getValues, query) {
  const q = query.trim().replace(/\s+/g, ' ');
  if (!q) return rows;

  const texts = rows.map((row) =>
    getValues(row)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .join('\n'),
  );

  const phrase = termPattern(q);
  const phraseHits = rows.filter((_, i) => phrase.test(texts[i]));
  if (phraseHits.length) return phraseHits;

  const words = q.split(' ').map(termPattern);
  return rows.filter((_, i) => words.every((w) => w.test(texts[i])));
}
