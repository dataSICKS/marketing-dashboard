type Coverage = { availableDates: string[] };
type Range = { from: string; to: string } | null;

/** No range: use this code's latest export, never another code's latest date.
 * Explicit range: never silently substitute a date outside the user's filter. */
export function resolveClarityDate(coverage: Coverage | undefined, range: Range): string {
  if (!coverage) return "";
  if (!range) return coverage.availableDates[0] ?? "";
  const from = range.from.replace(/\//g, "-");
  const to = range.to.replace(/\//g, "-");
  return coverage.availableDates.find((date) => date >= from && date <= to) ?? "";
}
