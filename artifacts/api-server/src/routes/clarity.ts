import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { aggregateClarityScrollDays, isEmptyClarityExport, parseClarityCsv } from "../lib/clarity-scroll.js";

const router: IRouter = Router();

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseFilename(name: string): { adCode: string; device: string } | null {
  const match = name.match(/^(.+?)_(Desktop|Mobile)_scroll_/);
  if (!match) return null;
  return { adCode: match[1], device: match[2] };
}

router.get("/clarity/files", async (req, res): Promise<void> => {
  try {
    const date = req.query.date as string | undefined;
    const supabase = getSupabaseClient();

    if (!date) {
      // 日付フォルダは日々増える（既に100件超）。既定sort(name昇順)＋limit100だと
      // 古い100件だけ返り最新日が欠落するため、limitを大きく取り新しい順で返す。
      const { data, error } = await supabase.storage
        .from("clarity-heatmaps")
        .list("", { limit: 10000, sortBy: { column: "name", order: "desc" } });
      if (error) throw error;
      const dates = (data ?? []).map((f) => f.name).filter(Boolean).sort().reverse();
      res.json({ dates, adCodes: [] });
      return;
    }

    const { data, error } = await supabase.storage.from("clarity-heatmaps").list(date, { limit: 200 });
    if (error) throw error;

    const adCodeMap = new Map<string, string[]>();
    for (const file of data ?? []) {
      if (!file.name.endsWith(".csv")) continue;
      const parsed = parseFilename(file.name);
      if (!parsed) continue;
      const devices = adCodeMap.get(parsed.adCode) ?? [];
      if (!devices.includes(parsed.device)) devices.push(parsed.device);
      adCodeMap.set(parsed.adCode, devices);
    }

    const adCodes = Array.from(adCodeMap.entries()).map(([adCode, devices]) => ({ adCode, devices }));
    res.json({ dates: [date], adCodes });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch clarity files");
    res.status(500).json({ error: "Clarityファイル一覧の取得に失敗しました" });
  }
});

/** 1日分のスクロールCSVを取得して集計する共通処理 */
async function fetchScrollForDate(
  supabase: ReturnType<typeof getSupabaseClient>,
  date: string,
  adCode: string,
): Promise<{ device: string; pageViews: number | null; points: { depth: number; visitors: number }[]; emptyExport?: boolean }[]> {
  const { data: files, error } = await supabase.storage.from("clarity-heatmaps").list(date, { limit: 200 });
  if (error) throw error;

  const deviceFiles = (files ?? [])
    .filter((f) => f.name.startsWith(adCode + "_") && f.name.endsWith(".csv"))
    .map((f) => {
      const parsed = parseFilename(f.name);
      return parsed ? { ...parsed, filename: f.name } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return Promise.all(
    deviceFiles.map(async ({ device, filename }) => {
      const { data, error: dlError } = await supabase.storage
        .from("clarity-heatmaps")
        .download(`${date}/${filename}`);
      if (dlError) throw dlError;
      const text = await (data as Blob).text();
      return { device, ...parseClarityCsv(text) };
    })
  );
}

router.get("/clarity/scroll", async (req, res): Promise<void> => {
  try {
    const date = req.query.date as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const adCode = req.query.adCode as string | undefined;
    if (!adCode) {
      res.status(400).json({ error: "adCode は必須です" });
      return;
    }
    if (!date && (!dateFrom || !dateTo)) {
      res.status(400).json({ error: "date または dateFrom + dateTo が必要です" });
      return;
    }

    const supabase = getSupabaseClient();

    // 集計対象日付リストを決定
    let targetDates: string[];
    if (dateFrom && dateTo) {
      // 利用可能な日付フォルダ一覧を取得して期間内のものだけ使う
      const { data: allFolders, error: fErr } = await supabase.storage
        .from("clarity-heatmaps")
        .list("", { limit: 10000, sortBy: { column: "name", order: "asc" } });
      if (fErr) throw fErr;
      targetDates = (allFolders ?? [])
        .map((f) => f.name)
        .filter((n) => n >= dateFrom && n <= dateTo);
    } else {
      targetDates = [date!];
    }

    if (targetDates.length === 0) {
      res.json({ adCode, date: date ?? dateFrom, points: [], pageViews: {}, excludedEmptyExports: [] });
      return;
    }

    // 全日付のデータを並列取得。失敗時に一部だけ集計するとPV分母が不正確になるため、
    // 日付単位の取得エラーも通常のAPIエラーとして扱う。
    const allDayData = await Promise.all(
      targetDates.map((d) => fetchScrollForDate(supabase, d, adCode))
    );

    const { points, pageViews } = aggregateClarityScrollDays(allDayData);
    const excludedEmptyExports = allDayData.flatMap((dayData, index) =>
      dayData.filter(isEmptyClarityExport)
        .map((entry) => ({ date: targetDates[index], device: entry.device })),
    );

    res.json({ adCode, date: date ?? dateFrom, points, pageViews, excludedEmptyExports });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch clarity scroll data");
    res.status(500).json({ error: "Clarityスクロールデータの取得に失敗しました" });
  }
});

export default router;
