/** Sheets serial dates represent calendar days, not local-time timestamps. */
export function normalizeNewsletterDate(value: string): string {
  const input = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(input)) {
    const serial = Number(input);
    if (serial < 1 || serial > 100000) throw new Error(`Invalid newsletter date: ${input}`);
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    return date.toISOString().slice(0, 10).replace(/-/g, "/");
  }
  const match = input.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) throw new Error(`Invalid newsletter date: ${input}`);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const normalized = `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
  if (date.toISOString().slice(0, 10).replace(/-/g, "/") !== normalized) {
    throw new Error(`Invalid newsletter date: ${input}`);
  }
  return normalized;
}
