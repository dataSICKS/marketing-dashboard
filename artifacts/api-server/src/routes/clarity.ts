import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";

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

function parseCsv(text: string): { pageViews: number; points: { depth: number; visitors: number }[] } {
  const lines = text.split("\n");
  let pageViews = 0;
  let dataStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("ページ ビュー")) {
      const match = line.match(/"ページ ビュー","(\d+)"/);
      if (match) pageViews = parseInt(match[1], 10);
    }
    if (line.includes("スクロールの奥行き")) {
      dataStart = i + 1;
      break;
    }
  }

  if (dataStart === -1) return { pageViews, points: [] };

  const points: { depth: number; visitors: number }[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const match = line.match(/"(\d+)","(\d+)","(\d+)"/);
    if (!match) continue;
    points.push({ depth: parseInt(match[1], 10), visitors: parseInt(match[2], 10) });
  }

  return { pageViews, points };
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

router.get("/clarity/scroll", async (req, res): Promise<void> => {
  try {
    const date = req.query.date as string | undefined;
    const adCode = req.query.adCode as string | undefined;
    if (!date || !adCode) {
      res.status(400).json({ error: "date と adCode は必須です" });
      return;
    }

    const supabase = getSupabaseClient();
    const { data: files, error: listError } = await supabase.storage.from("clarity-heatmaps").list(date, { limit: 200 });
    if (listError) throw listError;

    const deviceFiles = (files ?? [])
      .filter((f) => f.name.startsWith(adCode + "_") && f.name.endsWith(".csv"))
      .map((f) => {
        const parsed = parseFilename(f.name);
        return parsed ? { ...parsed, filename: f.name } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (deviceFiles.length === 0) {
      res.json({ adCode, date, points: [], pageViews: {} });
      return;
    }

    const deviceData = await Promise.all(
      deviceFiles.map(async ({ device, filename }) => {
        const { data, error } = await supabase.storage
          .from("clarity-heatmaps")
          .download(`${date}/${filename}`);
        if (error) throw error;
        const text = await (data as Blob).text();
        const parsed = parseCsv(text);
        return { device, ...parsed };
      })
    );

    const depthMap = new Map<number, { desktop: number | null; mobile: number | null }>();
    const pageViews: Record<string, number> = {};

    for (const { device, pageViews: pv, points } of deviceData) {
      pageViews[device] = pv;
      for (const { depth, visitors } of points) {
        const existing = depthMap.get(depth) ?? { desktop: null, mobile: null };
        if (device === "Desktop") existing.desktop = visitors;
        if (device === "Mobile") existing.mobile = visitors;
        depthMap.set(depth, existing);
      }
    }

    const points = Array.from(depthMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([depth, { desktop, mobile }]) => ({ depth, desktop, mobile }));

    res.json({ adCode, date, points, pageViews });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch clarity scroll data");
    res.status(500).json({ error: "Clarityスクロールデータの取得に失敗しました" });
  }
});

export default router;
