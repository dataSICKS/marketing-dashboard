# CODE — marketing-dashboard

## ディレクトリ構成（モノレポ）

```
marketing-dashboard/
├── package.json                # ルート。pnpm 強制(preinstall)、build/typecheck スクリプト
├── pnpm-workspace.yaml         # ワークスペース定義 + catalog 依存
├── tsconfig.base.json / tsconfig.json
├── .replit                     # Replit 実行環境（nodejs-24/python-3.11/postgresql-16）
│
├── clarity-heatmap-export/     # [Python] Clarity ヒートマップ日次収集
│   ├── export.py               # 前日/指定日のスクロールヒートマップ取得 → Storage
│   ├── backfill.py             # 期間一括（--dry-run 対応、取得済みはスキップ）
│   ├── save_session.py         # 初回：手動ログイン → 永続プロファイル/storage_state.json
│   ├── config.yml              # ★秘匿（gitignore）: pages/devices/exclude_keywords/supabase
│   ├── requirements.txt        # playwright, PyYAML, requests
│   ├── chrome_profile/         # ★Playwright 永続プロファイル（gitignore）
│   ├── downloads/ logs/        # 成果物・cron ログ（gitignore）
│   └── README.md
│
├── ecf-ad-to-supabase/         # [Python] ECforce 広告集計 → ecf_ad_access_cv
│   ├── config.yml              # ★秘匿: sheet.csv_url / supabase.{url,service_role_key,table}
│   ├── logs/                   # cron ログ
│   └── (run.py) ※現在 working tree に欠落。cron は run.py を呼ぶ → OPERATIONS.md 参照
│
├── amazon-seller-to-supabase/  # [Python] セッション保存のみ（本取込未実装）
│   ├── save_session.py         # Amazon Seller Central 手動ログイン → 永続プロファイル
│   ├── requirements.txt        # playwright, pyotp, PyYAML, requests
│   └── storage_state.json / chrome_profile/ / logs/
│
├── artifacts/
│   ├── api-server/             # [TS] Express 5 API
│   │   ├── build.mjs           # esbuild バンドル → dist/index.mjs
│   │   └── src/
│   │       ├── index.ts        # PORT 検証 → listen
│   │       ├── app.ts          # express + cors + pino-http、router を /api にマウント
│   │       ├── routes/         # health / newsletter / efo / clarity / campaigns / settings
│   │       └── lib/            # *-sheets(Sheets取得) / *-supabase(DB) / *-aggregate(集計)
│   │                           # newsletter-cache(インメモリ) / settings-storage / logger
│   ├── dashboard/              # [TS] React + Vite フロント
│   │   └── src/
│   │       ├── App.tsx         # wouter ルート定義（/ /efo /campaigns /settings）
│   │       ├── pages/          # dashboard / efo / campaigns / settings / not-found
│   │       └── components/     # Layout(サイドバー) / DateRangePicker / ui(shadcn) 他
│   └── mockup-sandbox/         # モック（本番外）
│
├── lib/
│   ├── api-spec/               # openapi.yaml（契約 source of truth）+ orval.config
│   ├── api-zod/                # 生成: Zod スキーマ
│   ├── api-client-react/       # 生成: React Query フック + custom-fetch
│   └── db/                     # Drizzle 雛形（現状ほぼ空）
│
└── scripts/                    # ワークスペーススクリプト（post-merge 等）
```

## API サーバー モジュール解説

- `src/index.ts` — `PORT` 環境変数必須（未設定/不正なら throw）。`app.listen`。
- `src/app.ts` — `cors()` 全許可、`express.json()`、`pino-http`。全ルータを `/api` プレフィックスにマウント。
- `src/routes/index.ts` — health/newsletter/efo/clarity/campaigns/settings を束ねる。

### routes（すべて `/api` 配下）

| ルート | メソッド | 概要 |
|---|---|---|
| `/healthz` | GET | ヘルスチェック |
| `/newsletter/sync` | POST | Google Sheets `calc` を再取得 → Supabase upsert → キャッシュ更新 |
| `/newsletter/data` | GET | 集計データ（groupBy, dateFrom/To, segment, compareFrom/To） |
| `/newsletter/change-events` | GET | テンプレ/件名の変更イベント |
| `/newsletter/segments` | GET | 利用可能セグメント一覧 |
| `/efo/sync` | POST | EFO 集計 Sheets を Supabase へ |
| `/efo/filters` | GET | EFO フィルタ候補 |
| `/efo/data` | GET | EFO CVR レポート（groupBy, profileName, adCode） |
| `/efo/presets` | GET/POST | フィルタプリセット（`efo_presets`） |
| `/clarity/files` | GET | Storage の日付フォルダ/adCode 一覧（`date` 省略時は日付一覧） |
| `/clarity/scroll` | GET | `date`+`adCode` の CSV をパースし depth×visitors と PV を返す |
| `/campaigns` | GET/POST | 施策一覧/作成 |
| `/campaigns/{id}` | PUT/DELETE | 施策更新/削除 |
| `/settings` | GET/PUT | `clarityTargetUrls` の取得/更新（Storage `app-settings/config.json`） |

### lib（サーバー）

- `newsletter-sheets.ts` — Replit Connectors 経由で Sheet `1zITxm8...` の `calc!A2:L` を取得しパース。
- `newsletter-supabase.ts` — `newsletter_rows` へ 500 件バッチ upsert（ユニークキーで重複除去・後勝ち）/ 全件 fetch。
- `newsletter-aggregate.ts` — day/week/month/scenario/template 集計、比較(before/after)マージ、マトリクス生成。
- `newsletter-cache.ts` — プロセス内キャッシュ（get/set）。
- `efo-sheets.ts` / `efo-supabase.ts` / `efo-aggregate.ts` / `efo-preset-supabase.ts` — EFO 版の Sheets/DB/集計/プリセット。Sheet `1gibjDJns9...` の `raw_efo_access` / `raw_efo_cv` を読む。
- `campaigns-supabase.ts` — `campaigns` の CRUD。
- `settings-storage.ts` — Storage バケット `app-settings` の `config.json` を読み書き。バケット無ければ作成。旧フォーマット `clarityTargetUrl`(単数)→`clarityTargetUrls`(複数) を移行。
- `logger.ts` — pino ロガー（`LOG_LEVEL`）。

## Clarity 収集ジョブ（`clarity-heatmap-export/export.py`）解説

- `PROJECT_ID = "srj36555ho"`（歯科衛生士 LP の Clarity プロジェクト）。
- `heatmap_url(adcode, date)` — フィルタを URL クエリで直組み。
  - `URL=` に `field;matchtype;value` をカンマ結合してエンコード。
    - **`2;2;<adcode>`** = field=2(閲覧済み URL)・matchtype=2(**を含む**)・広告コード。
    - **`exclude_keywords` の各 kw を `2;3;<kw>`** = matchtype=3(**を含まない**)で除外。
  - 日付: 未指定/`Yesterday` は `date=Yesterday`、指定日は `date=Custom&start=<ms>&end=<ms>`（JST エポック ms）。
  - `heatmapType=1`（スクロール。0 は誤り）。
- `download_one()` — 遷移 → スクロール種別クリック → デバイス選択。「スクロール情報が見つかりませんでした」検知で即スキップ。ダウンロードメニューは **CSV=`[role=menuitem]` / PNG=`[role=button]`**。メニュー再オープンが不安定なためリトライ。
- **現行コードは CSV と PNG の両方をダウンロードする**（`for kind, label in [("csv", ...), ("png", ...)]`）。
  過去 commit 57da8fe で一度 CSV のみに絞ったが、その後 HEAD(cd493ad) で PNG 行が復活している。CSV のみに戻したい場合は下記手順参照。
- `upload_to_supabase()` — `POST /storage/v1/object/{bucket}/{date}/{filename}`、`x-upsert: true`。CSV→`text/csv`、PNG→`image/png`。
- `main()` — `config.yml` の `pages × devices` を総当り。前日(JST)分がデフォルト、`sys.argv[1]` で指定日。

### `backfill.py`

- `python3 backfill.py [start] [end] [--dry-run]`。デフォルト `2026-07-01`〜昨日。
- `is_complete(date)` — Storage の `{date}/` を list し、全 `adCode×device` の CSV が揃っていればスキップ。
- 日付ごとに `export.main()` を `sys.argv=["export.py", date]` で呼ぶ。`--dry-run` は対象日表示のみ。

## 拡張・変更手順

### 1. 新しい API エンドポイントを追加する

1. `lib/api-spec/openapi.yaml` に path/operation/schema を追記（契約が source of truth）。
2. `pnpm --filter @workspace/api-spec run codegen` で `lib/api-zod` と `lib/api-client-react` を再生成。
3. `artifacts/api-server/src/routes/<name>.ts` にハンドラを実装し、`routes/index.ts` に `router.use()` で登録。
4. DB アクセスが要るなら `src/lib/<name>-supabase.ts` を追加（`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`）。
5. フロントで生成フック（例 `useGetXxx`）を import して利用。
6. `pnpm run typecheck` で型検証。

### 2. Clarity の対象広告コード / 除外キーワードを変える

1. `clarity-heatmap-export/config.yml` の `clarity.pages`（対象 adCode）を編集。
2. URL に「を含まない」除外を足すなら `clarity.exclude_keywords` に追記（`matchtype=3` で生成される）。
3. 画面に出す adCode の絞り込みは別系統：ダッシュボードの **設定ページ**で `clarityTargetUrls` を保存（Storage `app-settings`）。
4. 手動確認：`python3 export.py 2026-07-19` などで単日実行しログを確認。

### 3. Clarity を CSV のみに戻す（PNG 廃止）

1. `clarity-heatmap-export/export.py` の `download_one()` 内のループを 1 行変更：

```python
    for kind, label in [("csv", "CSV をダウンロード")]:   # CSVのみ（PNGは保存しない）
```

2. 単日実行で PNG が生成されないことを確認。

### 4. 新しい Supabase テーブルへ日次取込ジョブを足す（雛形）

`ecf-ad-to-supabase` を範として、サブディレクトリ + `config.yml` + `run.py`（DELETE→INSERT）+ crontab 行を用意する。

## コピペ雛形

### Supabase Storage への日次アップロード（Python・秘匿値なし）

```python
import yaml, requests
from pathlib import Path

HERE = Path(__file__).parent
CFG = yaml.safe_load(open(HERE / "config.yml"))
SB = CFG["supabase"]  # url / service_role_key / storage_bucket は config.yml から

def upload(path: Path, date_str: str) -> bool:
    base = SB["url"].rstrip("/")
    obj = f"{date_str}/{path.name}"
    ct = "text/csv" if path.suffix == ".csv" else "application/octet-stream"
    r = requests.post(
        f"{base}/storage/v1/object/{SB['storage_bucket']}/{obj}",
        headers={"apikey": SB["service_role_key"],
                 "Authorization": f"Bearer {SB['service_role_key']}",
                 "Content-Type": ct, "x-upsert": "true"},
        data=path.read_bytes(), timeout=120)
    return r.status_code in (200, 201)
```

### DELETE→INSERT 冪等取込（Python・REST・秘匿値なし）

```python
import requests

def replace_rows(sb, table, rows):
    """sb = {'url','service_role_key'} を config.yml から読む想定。
    Sheet に出ている全期間を毎回入れ替える（冪等）。"""
    base = sb["url"].rstrip("/")
    h = {"apikey": sb["service_role_key"],
         "Authorization": f"Bearer {sb['service_role_key']}",
         "Content-Type": "application/json"}
    # DELETE 全件（id>0 等の条件を付ける）
    requests.delete(f"{base}/rest/v1/{table}?id=gt.0", headers=h, timeout=60)
    # INSERT（バッチ）
    for i in range(0, len(rows), 500):
        requests.post(f"{base}/rest/v1/{table}",
                      headers={**h, "Prefer": "return=minimal"},
                      json=rows[i:i+500], timeout=120)
```

### Express + Supabase ルート（TS・Service Role）

```ts
import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";

const router: IRouter = Router();

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

router.get("/example", async (req, res): Promise<void> => {
  try {
    const { data, error } = await supa().from("some_table").select("*");
    if (error) throw error;
    res.json({ rows: data });
  } catch (err) {
    req.log.error({ err }, "Failed");
    res.status(500).json({ error: "取得に失敗しました" });
  }
});

export default router;
```
