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
| `DATABASE_URL` | ✅ | **ログイン認証用**の Postgres（Replit の postgresql-16 モジュール）。未設定だと全画面が 503 |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth クライアント ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | 同シークレット。**クライアントに出さない** |
| `GOOGLE_REDIRECT_URI` | ✅ | `https://<本番ドメイン>/api/auth/google/callback`。Google Cloud 側の登録と**完全一致**必須 |
| `AUTH_ENCRYPTION_KEY` | ✅ | TOTP シークレットの暗号化とバックアップコードの HMAC に使う。**32文字以上**のランダム文字列 |
| `AUTH_COOKIE_SECRET` | ✅ | Cookie 署名用のランダム文字列 |
| `AUTH_ALLOWED_DOMAINS` | 任意 | 許可ドメインの上書き（カンマ区切り）。既定は `sicks.co.jp,cyberagent.co.jp,abema.tv` |
| `APP_BASE_URL` | 任意 | ログイン後の戻り先。既定は `GOOGLE_REDIRECT_URI` からコールバックのパスを削ったもの |
| `AUTH_COOKIE_INSECURE` | 任意 | `true` で Cookie の Secure 属性を外す。**ローカル http 検証専用** |

Google Sheets 認証は env ではなく **Replit Connectors（`@replit/connectors-sdk`, `google-sheet` integration）** 経由。

### Python ジョブ（値は各 `config.yml`。★秘匿・gitignore）

| ジョブ | config.yml のキー |
|---|---|
| clarity-heatmap-export | `clarity.{pages, devices, exclude_keywords, heatmap_type, storage_state}` / `supabase.{url, service_role_key, storage_bucket}` |
| ecf-ad-to-supabase | `sheet.csv_url` / `supabase.{url, service_role_key, table}` |

`config.yml` にサービスロールキーが平文で入るため **コミット禁止**（各ディレクトリの `.gitignore` 対象）。

## ログイン認証（Google OAuth + 認証アプリ）

ダッシュボードは **Google ログイン + 認証アプリの6桁コード** を全利用者に必須とする。
Google アカウント側の2段階認証に任せるのではなく、**このアプリが独自に6桁コードを要求する**。

許可は**アカウント単位ではなくドメイン単位**。既定は `sicks.co.jp` / `cyberagent.co.jp` / `abema.tv` の3つで、
**完全一致**でのみ通る（`sub.abema.tv` や `abema.tv.example.com` は通らない）。
許可ドメインの初回ログイン時に利用者が自動登録され、そのまま認証アプリの登録に進む。

### 設定が足りないときの挙動

**開かない。** 必要な環境変数が1つでも欠けていると、API は全て `503` を返し、
画面には「認証が未設定です」と**不足している変数名**が出る。
未設定のまま誰でも見られる状態にはならない。

### Google Cloud Console での準備（初回のみ）

1. プロジェクトを選び「APIとサービス」→「OAuth 同意画面」を作る（内部/外部はアカウント構成に合わせる）
2. 「認証情報」→「OAuth クライアント ID を作成」→ 種類は **ウェブアプリケーション**
3. 「承認済みのリダイレクト URI」に `https://<本番ドメイン>/api/auth/google/callback` を登録
   - ここが `GOOGLE_REDIRECT_URI` と**1文字でも違うと Google 側で弾かれる**
4. 発行された クライアント ID / シークレットを Replit の Secrets に入れる
5. `AUTH_ENCRYPTION_KEY` / `AUTH_COOKIE_SECRET` を生成して Secrets に入れる

```bash
# 鍵の生成（それぞれ別の値を使う）
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> `AUTH_ENCRYPTION_KEY` を**変えると既存の TOTP 登録が全て読めなくなる**（復号できない）。
> 変更したら全利用者が再登録になる。

### テーブル

`dashboard_users` / `dashboard_sessions` は **Replit の Postgres**（`DATABASE_URL`）側。
分析データの Supabase とは分けている（DATA.md 参照）。
`scripts/post-merge.sh` の `pnpm --filter db push` で自動作成されるため、手でDDLを流す必要はない。

### 運用（SQLで行う作業）

```sql
-- 利用者を止める（ドメインが許可内でもログインできなくなる）
update dashboard_users set disabled = true where email = 'someone@abema.tv';

-- 認証アプリを作り直させる（スマホを買い替えてバックアップコードも無い場合）
update dashboard_users
   set totp_secret = null, totp_enrolled_at = null, totp_last_used_step = null,
       backup_code_hashes = null, totp_failed_count = 0, totp_locked_until = null
 where email = 'someone@abema.tv';
-- 次のログインで登録画面から始まる。既存セッションも切る：
update dashboard_sessions set revoked_at = now()
 where user_id = (select id from dashboard_users where email = 'someone@abema.tv');

-- 連続失敗のロックを手で解除する
update dashboard_users set totp_failed_count = 0, totp_locked_until = null
 where email = 'someone@abema.tv';
```

### 寿命・ロックの既定値

| 項目 | 値 | 場所 |
|---|---|---|
| Google 通過後〜6桁コード入力までの猶予 | 10分 | `auth-session.ts` |
| ログイン済みセッション | 12時間（操作で延長） | 同 |
| 操作し続けた場合の絶対上限 | 30日 | 同 |
| 6桁コードの連続失敗 | 5回でロック | 同 |
| ロック時間 | 15分 | 同 |
| バックアップコード | 10本・使い捨て | 同 |

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

## GitHub ↔ Replit 同期（先祖返り防止・重要）

このダッシュボード（web/api-server）は **Replit で稼働**し、Replit と ローカル(Mac) の両方から同じ GitHub リポ（`dataSICKS/marketing-dashboard`）を触る。過去に **Replit からの force-push で origin の履歴が上書きされ、ローカル側のコミット（機能別ドキュメント・`ecf-ad-to-supabase/run.py` 等）が消失**した事故がある。以下を厳守する。

**共通ルール（両環境）**
1. **編集を始める前に必ず `git pull`**（基本 `git pull --rebase`）で最新を取り込む。古いローカルの上に作業を積まない。
2. **push 前に `git fetch`** し、`git rev-list --count HEAD..origin/main` が 0 でない（＝origin が新しい）なら push せず、先に `git pull --rebase` で取り込む。
3. **`git push --force` / `-f` は使わない**（＝先祖返りの主因）。通常の `git push` は non-fast-forward を自動拒否するのでそのまま使う。
4. 履歴が分岐して素直に ff できない時は強制解決せず、docブランチ＋PR 等の非破壊手段で対応する。

**コード修正の本番反映（Replit側）**
- ローカルで修正 → commit → push した後、**Replit で `git pull` → api-server 再起動**（`pnpm --filter @workspace/api-server run dev` 等）で反映される。ローカルから Replit 実行環境へは直接反映されない。

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
| ローカルのコミットが消えた/origin が巻き戻った | 別環境（Replit）からの **force-push** で履歴上書き | reflog から復元（`git checkout <古いhash> -- <path>`）。以後は「GitHub ↔ Replit 同期」ルール厳守（pull-first・force禁止） |
| 最新日が Clarity パネルに出ない | `/clarity/files` の list 上限（旧: limit100・古い順） | 修正済み（limit拡大＋name降順）。未反映なら Replit で pull→再起動 |
