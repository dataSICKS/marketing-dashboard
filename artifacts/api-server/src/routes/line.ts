import { Router, type IRouter } from "express";
import {
  SyncLineResponse, GetLineDataQueryParams, GetLineDataResponse,
  GetLineDeliveriesQueryParams, GetLineDeliveriesResponse,
} from "@workspace/api-zod";
import { fetchLineSheet } from "../lib/line-sheets.js";
import { saveLineSnapshot, fetchLineFromSupabase } from "../lib/line-supabase.js";
import { LINE_ZONES, aggregateDeliveries, verifyLineRow } from "../lib/line-sheet-parse.js";
import { aggregateLineRows, summarizeLineZone, type LineGrain } from "../lib/line-aggregate.js";

const router: IRouter = Router();

const GRAINS: LineGrain[] = ["day", "week", "month"];

/** 画面に常時出す読み方の注意。数字の意味を取り違えると結論が変わるものだけに絞る。 */
const DATA_NOTES = [
  "友だち数は「残存(active)」＝人数(累計) − ブロック数(累計) です。人数(累計)はブロックした人も含むので、友だち数としては使えません。",
  "残高（人数・ブロック累計・残存・シナリオ分類数）は期間の**最終日の値**です。週・月で足していません。足すと友だち数が日数倍になります。",
  "新規・即ブロック・LPアクセス・CVは期間の合計です。率は合計してから割っています（日ごとの率の平均ではありません）。",
  "LPアクセスはパラメURLに到達した数（ECforceのaccess_count）です。友だち追加数でもメッセージ開封数でもありません。",
  "当日新規と即ブロック数は翌朝に確定します。最新日が空欄なのは未確定のためで、0ではありません。",
  "サブスク転換率の分母はその期間の新規です。同一コホートの転換率ではありません（CVには過去に友だち追加した人も含まれます）。",
  "タグ計は経路別の合計です。全体との差は、タグが付いていない人（プラス）と流入タグを2本持つ人の二重計上（マイナス）が混ざります。タグ網羅率は約半分です。",
  "リッチメニューと他経路は友だちの残高を持ちません（経路を特定できないため）。LPアクセスとCVだけです。",
];

const DELIVERY_NOTES = [
  "配信別はパラメURLの識別子から集計しています。CVはECforce由来です。",
  "**配信通数・開封数・クリック数はこのデータに含まれていません。** 元シートにLiny側のメッセージ単位の数字が入っていないため、開封率やCTRは出せません。",
  "識別子ごとのLPアクセスも取得できていないため、配信別のCVRは出せません（分母がありません）。経路別のLPアクセスは経路の表にあります。",
  "1つのメッセージパックに、セグメント（サブスク経験×子ども有無）ごとの識別子が複数あります。「枝」はそのうちCVが立った識別子の数です。",
  "パラメURLの一覧に無い識別子でCVが立っていた場合は「未登録の識別子」として別に出します。合計を合わせるために捨てていません。",
  "ステップ配信番号は、列の値が使えないときはメッセージパック名の丸数字（①②③…）から拾っています。",
];

const ZONE_OPTIONS = LINE_ZONES.map((zone) => ({
  key: zone.key,
  label: zone.label,
  hasBalance: zone.kind !== "cvOnly",
  hasCv: zone.kind !== "base",
  hasScenario: zone.kind === "qr",
}));

const TTL_MS = 5 * 60 * 1000;
let cache: { value: Awaited<ReturnType<typeof fetchLineFromSupabase>>; expires: number } | null = null;
let inFlight: Promise<Awaited<ReturnType<typeof fetchLineFromSupabase>>> | null = null;

/** 読み込みが同時に走らないようにする。1回の取得で数千行を読むため。 */
async function loadLine(force = false) {
  if (!force && cache && cache.expires > Date.now()) return cache.value;
  if (inFlight) return inFlight;
  const request = fetchLineFromSupabase();
  inFlight = request;
  try {
    const value = await request;
    cache = { value, expires: Date.now() + TTL_MS };
    return value;
  } finally {
    inFlight = null;
  }
}

const splitList = (value: string | undefined): string[] =>
  value ? value.split("|").map((item) => item.trim()).filter(Boolean) : [];

const isDate = (value: string | undefined): boolean => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);

router.post("/line/sync", async (req, res): Promise<void> => {
  try {
    const snapshot = await fetchLineSheet();
    const syncedAt = new Date().toISOString();
    const saved = await saveLineSnapshot(snapshot.daily, snapshot.master, snapshot.cv, syncedAt);
    cache = null;
    res.json(SyncLineResponse.parse({
      dailyRows: snapshot.daily.length,
      zoneRows: saved.zoneRows,
      masterRows: saved.masterRows,
      cvRows: saved.cvRows,
      issues: snapshot.issues,
      masterSkipped: snapshot.masterSkipped,
      masterDuplicates: snapshot.masterDuplicates,
      cvIdentifiers: snapshot.cvIdentifiers,
      syncedAt,
      columnCountWarning: snapshot.columnCountWarning,
      tabs: snapshot.tabs,
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to sync the LINE report sheet");
    const message = err instanceof Error ? err.message : "原因不明のエラー";
    res.status(503).json({ error: `LINE実績レポートの取り込みに失敗しました: ${message}` });
  }
});

router.get("/line/data", async (req, res): Promise<void> => {
  const parsed = GetLineDataQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "表示単位の指定が不正です" });
    return;
  }
  const query = req.query as Record<string, string | undefined>;
  if (!isDate(query.dateFrom) || !isDate(query.dateTo)) {
    res.status(400).json({ error: "期間はYYYY-MM-DDで指定してください" });
    return;
  }
  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
    res.status(400).json({ error: "期間の開始が終了より後です" });
    return;
  }
  try {
    const grain = (GRAINS as string[]).includes(parsed.data.grain ?? "") ? (parsed.data.grain as LineGrain) : "day";
    const zones = splitList(query.zones);
    const { daily, syncedAt } = await loadLine();
    const filters = { dateFrom: query.dateFrom, dateTo: query.dateTo, zones };
    const dates = daily.map((row) => row.date);
    // 読み取りの検算はDBから戻した行に対しても回す（保存のときに崩れていないかを見るため）。
    const issues = daily.flatMap((row) => verifyLineRow(row));
    res.json(GetLineDataResponse.parse({
      grain,
      zones: ZONE_OPTIONS,
      items: aggregateLineRows(daily, grain, filters),
      summary: summarizeLineZone(daily, zones.length === 1 ? zones[0] : "overall", filters),
      issues: issues.slice(0, 50),
      columnCountWarning: null,
      dateMin: dates[0] ?? null,
      dateMax: dates.at(-1) ?? null,
      lastSyncedAt: syncedAt,
      notes: DATA_NOTES,
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch LINE zone data");
    res.status(503).json({ error: "LINEの経路別データを取得できませんでした。取り込みを実行してください。" });
  }
});

router.get("/line/deliveries", async (req, res): Promise<void> => {
  const parsed = GetLineDeliveriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "期間の指定が不正です" });
    return;
  }
  const query = req.query as Record<string, string | undefined>;
  if (!isDate(query.dateFrom) || !isDate(query.dateTo)) {
    res.status(400).json({ error: "期間はYYYY-MM-DDで指定してください" });
    return;
  }
  try {
    const { master, cv, syncedAt } = await loadLine();
    const result = aggregateDeliveries(master, cv, { dateFrom: query.dateFrom, dateTo: query.dateTo });
    const dates = cv.map((row) => row.date).sort();
    const unmatchedCv = result.unmatched.reduce((total, item) => total + item.cv, 0);
    res.json(GetLineDeliveriesResponse.parse({
      items: result.items,
      unmatched: result.unmatched,
      bySubscription: result.bySubscription,
      byChild: result.byChild,
      byRoute: result.byRoute,
      totalCv: result.totalCv,
      matchedCv: result.totalCv - unmatchedCv,
      identifierCount: master.length,
      dateMin: dates[0] ?? null,
      dateMax: dates.at(-1) ?? null,
      lastSyncedAt: syncedAt,
      notes: DELIVERY_NOTES,
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch LINE deliveries");
    res.status(503).json({ error: "配信別のデータを取得できませんでした。取り込みを実行してください。" });
  }
});

export default router;
