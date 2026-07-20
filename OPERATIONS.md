# OPERATIONS — marketing-dashboard

## セットアップ

### Web アプリ（pnpm ワークスペース）

```bash
pnpm install                                        # pnpm 必須（npm/yarn は preinstall で拒否）
pnpm --filter @workspace/api-spec run codegen       # openapi.yaml → Zod / React Query 生成
pnpm run typecheck                                  # 全パッケージ型チェック
pnpm run build                                      # typecheck + 各パッケージ build
```

### Python 日次ジョブ

```bash
# 各サブディレクトリで
pip3 install -r requirements.txt
python3 -m playwright install chromium   # clarity / amazon（Playwright 使用のもの）
```

Clarity / Amazon は初回のみ手動ログインでセッションを作る（後述）。

## 環境変数

### API サーバー（`artifacts/api-server`）

| 変数 | 必須 | 用途 |
|---|---|---|
| `PORT` | ✅ | listen ポート（未設定/不正だと起動時 throw） |
| `SUPABASE_URL` | ✅ | Supabase プロジェクト URL（`https://kqhckosphntfuhqrxcoj.supabase.co`） |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | RLS バイパス書き込み用。**クライアントに出さない** |
| `NODE_ENV` | 任意 | `development`/`production` |
| `LOG_LEVEL` | 任意 | pino ログレベル |

Google Sheets 認証は env ではなく **Replit Connectors（`@replit/connectors-sdk`, `google-sheet` integration）** 経由。

### Python ジョブ（値は各 `config.yml`。★秘匿・gitignore）

| ジョブ | config.yml のキー |
|---|---|
| clarity-heatmap-export | `clarity.{pages, devices, exclude_keywords, heatmap_type, storage_state}` / `supabase.{url, service_role_key, storage_bucket}` |
| ecf-ad-to-supabase | `sheet.csv_url` / `supabase.{url, service_role_key, table}` |

`config.yml` にサービスロールキーが平文で入るため **コミット禁止**（各ディレクトリの `.gitignore` 対象）。

## 実行

```bash
# API / フロント（開発）
pnpm --filter @workspace/api-server run dev     # build → start
pnpm --filter @workspace/dashboard run dev      # vite --host 0.0.0.0

# Clarity ヒートマップ
cd clarity-heatmap-export
python3 save_session.py            # 初回のみ：ブラウザで手動ログイン→プロジェクトを開く
python3 export.py                  # 前日分（JST）
python3 export.py 2026-07-19       # 指定日
python3 backfill.py 2026-07-01 2026-07-10          # 期間一括
python3 backfill.py --dry-run                       # 対象日表示のみ

# ECforce 広告集計
cd ecf-ad-to-supabase
python3 run.py                     # ※run.py が現在欠落中（下記 既知の問題）

# Amazon（セッション保存のみ）
cd amazon-seller-to-supabase
python3 save_session.py
```

### 初回ログイン（永続プロファイル方式）

`save_session.py` はヘッド付きブラウザを起動し待機する。手動でログイン（OAuth/MFA/OTP）→ 対象画面を開く。
別プロセスから同ディレクトリに `.login_done` ファイルを作ると `storage_state.json` + 永続プロファイル `chrome_profile/` を保存して終了（最大 20 分）。以降のジョブはヘッドレスでこのプロファイルを再利用する。セッション失効時は再実行。

## crontab（稼働中・実 `crontab -l` より）

本リポジトリ関連の日次ジョブ（ローカル macOS、時刻は端末ローカル＝JST 想定）:

```cron
# Clarity スクロールヒートマップ → Supabase Storage（毎朝 7:30 / 前日分）
30 7 * * * cd /Users/sicks/claude-work/marketing-dashboard/clarity-heatmap-export && /usr/bin/python3 export.py >> /Users/sicks/claude-work/marketing-dashboard/clarity-heatmap-export/logs/cron.log 2>&1

# ECforce 広告集計 → ecf_ad_access_cv（毎朝 8:15）
15 8 * * * cd /Users/sicks/claude-work/marketing-dashboard/ecf-ad-to-supabase && /usr/bin/python3 run.py >> /Users/sicks/claude-work/marketing-dashboard/ecf-ad-to-supabase/logs/cron.log 2>&1
```

| ジョブ | 時刻 | 対象 |
|---|---|---|
| clarity-heatmap-export | **07:30** 毎日 | 前日分ヒートマップ |
| ecf-ad-to-supabase | **08:15** 毎日 | 広告集計全期間 DELETE→INSERT |

> amazon-seller-to-supabase は cron 登録なし（セッション保存のみで本取込未実装）。

## 運用手順

- **メルマガ/EFO データ更新**：Sheets が更新されたら、ダッシュボードの「スプレッドシートから更新」ボタン（`POST /newsletter/sync` / `/efo/sync`）で即時取り込み。画面初回表示時も自動取得。
- **Clarity 対象の変更**：収集対象 adCode は `config.yml` の `clarity.pages`、画面表示の絞り込みは設定ページの `clarityTargetUrls`（Storage `app-settings/config.json`）。
- **過去日補完**：欠損日は `backfill.py [start] [end]` で埋める（取得済みはスキップ）。
- **キャッシュ**：API 再起動でインメモリキャッシュはリセット。次回アクセスで Supabase から再ロードされる（手動操作不要）。

## 動作確認チェックリスト

- [ ] `pnpm install` が pnpm で成功する（npm/yarn だと preinstall で失敗するのが正）
- [ ] `pnpm --filter @workspace/api-spec run codegen` 後に `pnpm run typecheck` が通る
- [ ] API 起動時に `PORT`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` が設定済み
- [ ] `GET /api/healthz` が 200
- [ ] `POST /api/newsletter/sync` で `newsletter_rows` が更新される
- [ ] `GET /api/clarity/files`（date なし）が日付一覧を返す
- [ ] ダッシュボード /efo の Clarity パネルにスクロール深度チャートが表示される
- [ ] `clarity-heatmap-export/logs/cron.log` に「完了: 取得 N ファイル / アップロード N ファイル」が出ている
- [ ] `ecf-ad-to-supabase/logs/cron.log` に「投入完了: N 行」が出ている（run.py 欠落問題が解消済みであること）
- [ ] Supabase Storage `clarity-heatmaps` に前日フォルダ `{YYYY-MM-DD}/` が生成されている

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| **ecf-ad の cron が失敗（run.py がない）** | working tree に `ecf-ad-to-supabase/run.py` が欠落（別環境 force-push で消失した可能性） | 収集ロジックを `run.py` として復元（CODE.md の DELETE→INSERT 雛形参照）。config.yml とログは残存 |
| Clarity で全ページ「スクロールデータ無し→skip」 | 低トラフィック日/adCode、または対象日にデータ無し | 正常。翌日再取得。`backfill.py` で後日補完 |
| Clarity ダウンロードがタイムアウト/メニュー項目なし | Clarity UI の DOM 変化、セッション失効 | `save_session.py` を再実行してセッション再取得。セレクタ（menuitem/button, `[aria-label=ダウンロード]`）を確認 |
| API 起動時 `PORT environment variable is required` | `PORT` 未設定 | env に `PORT` を設定 |
| Supabase 書き込みが 401/403（RLS） | Anon Key を使用 | `SUPABASE_SERVICE_ROLE_KEY` を使う（全テーブル RLS 有効） |
| `pnpm install` が「Use pnpm instead」で停止 | npm/yarn で実行 | pnpm を使う（preinstall で強制） |
| Sheets 取得が失敗 | Replit Connectors（google-sheet）未接続 | Replit の integration 設定を確認 |
| Tailwind の dark 指定が効かない | Tailwind v4 は `@apply dark` 無効 | テーマ変数を `:root` に直接設定 |
| インメモリキャッシュが古い | プロセス長時間稼働 | `/*/sync` エンドポイントで強制再取得、または再起動 |
