// Shared number/label formatters for the report dashboards (LMS + AMT-CS1).

/** A 0–1 rate as a whole-percent string, or an em dash when null. */
export function pct(rate: number | null | undefined): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`;
}

/** A number trimmed to `digits` decimals (dropping a trailing .0), or an em dash. */
export function num(v: number | null | undefined, digits = 1): string {
  return v == null ? '—' : Number(v).toFixed(digits).replace(/\.0$/, '');
}

/** A short, locale-aware date-time label, or an em dash. */
export function dateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
