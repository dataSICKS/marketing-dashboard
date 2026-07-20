# DESIGN — marketing-dashboard

## 目的

マーケ施策（メルマガ配信、広告 LP）の効果を 1 か所で可視化する社内ダッシュボード。3 系統のデータを扱う。

1. **メルマガ配信レポート** — Google スプレッドシート（集計済み `calc` タブ）を source of truth に、配信数/開封率/クリック率/CVR/CV 数を KPI・トレンド・マトリクス表示。
2. **CVR レポート（EFO）** — ECforce EFO（Smart Dialog）のアクセス/CV/離脱シナリオ集計を A/B の 2 軸で比較。同画面に **Microsoft Clarity のスクロール深度**を並べて表示。
3. **施策カレンダー** — キャンペーン（施策）の期間・カテゴリをカレンダー/一覧で管理。

これらに供給するため、外部ソースを日次で Supabase に取り込む Python ジョブ群を同居させている。

## アーキテクチャ

```
┌─────────────────────────── 日次収集ジョブ（Python / ローカル cron）───────────────────────────┐
│                                                                                              │
│  Microsoft Clarity ──[Playwright/永続プロファイル]──▶ clarity-heatmap-export/export.py        │
│    (歯科衛生士LP, PROJECT_ID=srj36555ho)                    │  scroll ヒートマップ CSV(+PNG)   │
│                                                            ▼                                  │
│                                        Supabase Storage バケット: clarity-heatmaps            │
│                                          {YYYY-MM-DD}/{adCode}_{device}_scroll_{date}.csv     │
│                                                                                              │
│  Google Sheet(BQ_ECF広告集計) ──[CSV export/requests]──▶ ecf-ad-to-supabase/run.py            │
│                                        DELETE→INSERT ▶ Supabase table: ecf_ad_access_cv       │
│                                                                                              │
│  Amazon Seller Central ──[Playwright セッション保存のみ]──▶ amazon-seller-to-supabase          │
│                                        （本取込は未実装：save_session.py のみ）                │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                             │
                                    Supabase (kqhckosphntfuhqrxcoj)
                        Postgres: newsletter_rows / efo_access_cv / efo_exit_scenarios /
                                  ecf_ad_access_cv / campaigns / efo_presets
                        Storage:  clarity-heatmaps / app-settings(config.json)
                                             ▲
                                             │ Service Role Key（RLS バイパス）
┌──────────────────────────── Web アプリ（pnpm ワークスペース / TS）────────────────────────────┐
│                                                                                              │
│  Google Sheet(calc / raw_efo_*) ──[@replit/connectors-sdk]──┐                                │
│                                                             ▼                                │
│  artifacts/api-server (Express 5)  ──in-memory cache──▶ /api/{newsletter,efo,clarity,        │
│    routes: newsletter/efo/clarity/campaigns/settings/health   campaigns,settings}            │
│                                                             ▲                                │
│                     ┌──── OpenAPI 契約: lib/api-spec/openapi.yaml (source of truth) ────┐     │
│                     │  orval codegen ▶ lib/api-zod（Zod）/ lib/api-client-react（RQ hooks）│    │
│  artifacts/dashboard (React + Vite + Tailwind v4 + Recharts + wouter) ◀── React Query ─┘     │
│    pages: dashboard(メルマガ) / efo(CVR+Clarity) / campaigns(施策) / settings                 │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### データフロー（メルマガ / EFO 読み出し）

優先順位は **インメモリキャッシュ → Supabase → Google Sheets（フォールバック＋upsert）**。

1. リクエスト時、API はまずプロセス内キャッシュを見る。
2. 空なら Supabase から読み込みキャッシュへ載せる。
3. Supabase も空なら Google Sheets を取得 → Supabase に upsert → キャッシュへ。
4. 手動「同期」エンドポイント（`POST /newsletter/sync`, `POST /efo/sync`）は常に Sheets を再取得し upsert + キャッシュ更新。

### データフロー（Clarity）

- 収集は Python ジョブが担い、成果物は **Supabase Storage の CSV**。DB テーブルは介さない。
- API（`/clarity/files`, `/clarity/scroll`）は Storage から CSV を list/download し、サーバー側で **CSV をパースして** スクロール深度ポイント（depth×visitors）と PV を返す。
- 画面に出す広告コードは **設定（`clarityTargetUrls`）でホワイトリスト絞り込み**。設定が空なら全 adCode を表示（後述）。

## 各サブプロジェクトの役割

| パス | 種別 | 役割 |
|---|---|---|
| `clarity-heatmap-export/` | Python/Playwright | Clarity スクロールヒートマップを日次で Storage `clarity-heatmaps` に保存。`export.py`(日次) / `backfill.py`(過去日一括) / `save_session.py`(初回ログイン) |
| `ecf-ad-to-supabase/` | Python/requests | Google Sheet(BQ_ECF 広告集計 A–D 列) を CSV 取得し `ecf_ad_access_cv` に DELETE→INSERT。**現状 `run.py` が working tree に欠落**（config.yml とログのみ存在） |
| `amazon-seller-to-supabase/` | Python/Playwright | Amazon Seller Central のログインセッション保存 `save_session.py` **のみ**。本取込は未実装 |
| `artifacts/api-server/` | Express 5 (TS) | REST API。newsletter / efo / clarity / campaigns / settings / health |
| `artifacts/dashboard/` | React + Vite (TS) | 配信/CVR/施策ダッシュボード UI |
| `artifacts/mockup-sandbox/` | — | モックアップ用サンドボックス（本番外） |
| `lib/api-spec/` | OpenAPI + orval | API 契約の source of truth と codegen 設定 |
| `lib/api-zod/`, `lib/api-client-react/` | 生成物 | Zod スキーマ / React Query フック（openapi.yaml から生成） |
| `lib/db/` | Drizzle 雛形 | 現状ほぼ空（テンプレートのみ、実テーブル定義なし。推定：将来用の足場） |
| `scripts/` | — | ワークスペーススクリプト（post-merge 等） |

## 技術スタック

- **モノレポ**: pnpm workspaces（`pnpm-workspace.yaml`、catalog 依存）、Node.js 24、TypeScript 5.9。`preinstall` で pnpm 以外を拒否。
- **API**: Express 5 / pino ロギング / `@supabase/supabase-js` / `@replit/connectors-sdk`（Google Sheets プロキシ）。esbuild + esbuild-plugin-pino でバンドル。
- **フロント**: React + Vite + Tailwind v4 + shadcn/ui + Recharts + wouter（ルータ）+ TanStack Query。
- **契約/codegen**: OpenAPI 3（`lib/api-spec/openapi.yaml`）→ orval で Zod（`zod/v4`）と React Query フックを生成。
- **Python ジョブ**: Playwright（永続プロファイル）、PyYAML、requests。（amazon 側は pyotp も）
- **データストア**: 共用 Supabase `kqhckosphntfuhqrxcoj`（Postgres + Storage）。
- **実行環境**: Replit（`.replit`：nodejs-24/python-3.11/postgresql-16、google-sheet/github integration、autoscale deploy）。日次 Python ジョブはローカル macOS の crontab で稼働。

## データモデル概要

Supabase `public` スキーマ（詳細は DATA.md）。

- `newsletter_rows` — メルマガ集計行（ユニークキー: delivery_date+scenario_name+segment+template_name）。
- `efo_access_cv` — EFO アクセス/CV（date+ad_code+profile_name）。
- `efo_exit_scenarios` — EFO 離脱シナリオ別セッション数。
- `ecf_ad_access_cv` — ECforce 広告 URL 別のアクセス/CV（DELETE→INSERT で冪等）。
- `campaigns` — 施策（タイトル/期間/カテゴリ/メモ）。
- `efo_presets` — CVR レポートのフィルタプリセット。
- Storage `clarity-heatmaps` — Clarity CSV。Storage `app-settings/config.json` — アプリ設定（`clarityTargetUrls`）。

## 設計判断（why）

- **Google Sheets が source of truth**：メルマガ/EFO の集計は既存の Sheets ワークフローで作られる。API は Sheets を取り込み、Supabase を読み出しキャッシュ層として使う（毎回 Sheets を叩かないため）。
- **3 段フォールバック（cache→Supabase→Sheets）**：Sheets API のレイテンシ/レート制約を避けつつ、初回や Supabase 空でも動くように。プロセス再起動でインメモリキャッシュはリセットされ、次回アクセスで Supabase から再ロード。
- **Service Role Key をサーバーサイドで使用**：全テーブル RLS 有効。Anon Key では書き込み不可のため、サーバー側書き込みには Service Role が必須。鍵はクライアントに出さない。
- **Clarity は Storage に CSV で保管、DB を介さない**：ヒートマップは日次スナップショットで良く、生 CSV を保持すればパース仕様変更にも追従できる。API 側で都度パース。
- **Clarity 収集を URL クエリ直組みで自動化**：Clarity 管理画面 UI 操作は不安定なため、フィルタ/デバイス/種別/日付を URL パラメータで指定して遷移する。認証は **永続プロファイル方式**（一度手動ログインすれば再ログイン不要）。
- **ecf-ad は DELETE→INSERT で冪等**：Sheet に出ている全期間分を毎回入れ替え、重複や部分更新の齟齬を避ける。
- **OpenAPI を契約の唯一の源**：Zod スキーマと React Query フックを生成し、サーバー/クライアント間の型を一致させる。
- **UI はミニマル（白ベース×黒サイドバー）**：サイドバー `#0a0a0a`、メイン `#f8f8f8`/`#fff`。Tailwind v4 のためテーマ変数は `:root` に直接設定（`@apply dark` は無効）。
