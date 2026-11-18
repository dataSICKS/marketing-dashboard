type StorageFile = { name: string };
type ListPage = (prefix: string, options: { limit: number; offset: number; sortBy: { column: "name"; order: "asc" } }) =>
  PromiseLike<{ data: StorageFile[] | null; error: unknown }>;

export function parseClarityFilename(name: string) {
  const match = name.match(/^(.+)_(Desktop|Mobile)_scroll_.+\.csv$/);
  return match ? { adCode: match[1], device: match[2] as "Desktop" | "Mobile" } : null;
}

/**
 * 同じ (adCode, device) のCSVが複数あるとき1つだけ残す。
 *
 * 取得経路が違うと `_scroll_yesterday.csv` と `_scroll_2026-07-20.csv` のように
 * **中身が同じファイルが2つ残る**ことがあり、そのまま合算するとPVが二重計上になる
 * （実際 2026-07-20 の mid_1_a/mid_1_b Mobile で発生していた）。
 * 取り込み側では保存名を `_scroll_{日付}` に固定して再発を止めているが、
 * 過去に残った分と、今後の想定外の重複に備えて読み取り側でも1つに畳む。
 *
 * 優先順位は「日付サフィックス付き（取り込み側の正式名）」→ 名前順で先頭。
 */
export function dedupeClarityFiles<T extends { name: string }>(files: T[], date: string): T[] {
  const picked = new Map<string, T>();
  const canonical = (name: string) => name.includes(`_scroll_${date}.`);
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const parsed = parseClarityFilename(file.name);
    if (!parsed) continue;
    const key = `${parsed.adCode}|${parsed.device}`;
    const current = picked.get(key);
    if (!current || (!canonical(current.name) && canonical(file.name))) picked.set(key, file);
  }
  return [...picked.values()];
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
