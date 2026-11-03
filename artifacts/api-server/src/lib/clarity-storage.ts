type StorageFile = { name: string };
type ListPage = (prefix: string, options: { limit: number; offset: number; sortBy: { column: "name"; order: "asc" } }) =>
  PromiseLike<{ data: StorageFile[] | null; error: unknown }>;

export function parseClarityFilename(name: string) {
  const match = name.match(/^(.+)_(Desktop|Mobile)_scroll_.+\.csv$/);
  return match ? { adCode: match[1], device: match[2] as "Desktop" | "Mobile" } : null;
}

export async function listAllClarityFiles(list: ListPage, prefix: string) {
  const files: StorageFile[] = [];
  const limit = 200;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data) throw new Error("Storage returned no file listing");
    files.push(...data);
    if (data.length < limit) return files;
  }
}

export type ClarityInventoryDay = { date: string; files: StorageFile[] };

export function buildClarityCoverage(inventory: ClarityInventoryDay[], registeredCodes: string[]) {
  const dates = inventory.map((day) => day.date).sort().reverse();
  const codes = new Map<string, Map<string, Set<string>>>();
  for (const code of registeredCodes) codes.set(code, new Map());
  for (const day of inventory) {
    for (const file of day.files) {
      const parsed = parseClarityFilename(file.name);
      if (!parsed || (registeredCodes.length > 0 && !codes.has(parsed.adCode))) continue;
      const days = codes.get(parsed.adCode) ?? new Map<string, Set<string>>();
      const devices = days.get(day.date) ?? new Set<string>();
      devices.add(parsed.device);
      days.set(day.date, devices);
      codes.set(parsed.adCode, days);
    }
  }
  return {
    dates, latestDate: dates[0] ?? null,
    adCodes: [...codes].map(([adCode, days]) => {
      const availableDates = [...days.keys()].sort().reverse();
      return {
        adCode, availableDates, daysWithExports: availableDates.length,
        firstDate: availableDates.at(-1) ?? null, lastDate: availableDates[0] ?? null,
        desktopDays: [...days.values()].filter((devices) => devices.has("Desktop")).length,
        mobileDays: [...days.values()].filter((devices) => devices.has("Mobile")).length,
      };
    }),
  };
}
