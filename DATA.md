# DATA — marketing-dashboard

## Supabase プロジェクト

- **ref**: `kqhckosphntfuhqrxcoj`
- **URL**: `https://kqhckosphntfuhqrxcoj.supabase.co`
- **スキーマ**: `public`（全テーブル **RLS 有効**。書き込みは Service Role Key）
- **Storage バケット**:
  - `clarity-heatmaps` — Clarity スクロールヒートマップ CSV（+ 現行コードでは PNG も）
  - `app-settings` — アプリ設定 `config.json`（`clarityTargetUrls`）

> 共用（間借り）Supabase。EFO 系（`efo_access_cv` / `efo_exit_scenarios` / `efo_presets`）は
> ecforce-efo-to-supabase プロジェクト由来のテーブルを本ダッシュボードが**読み出し**で利用している。

## テーブル定義

### `newsletter_rows`（メルマガ集計行）

ユニークキー: `delivery_date, scenario_name, segment, template_name`（upsert onConflict）。

| 列 | 型 | 説明 |
|---|---|---|
| id | bigint (identity) | PK |
| delivery_year_month | text | 配信年月 |
| delivery_week | text | 配信週 |
| delivery_date | text | 配信日 |
| scenario_name | text | シナリオ名 |
| segment | text | セグメント |
| delivery_method | text | 配信方法 |
| template_name | text | テンプレート名 |
| subject | text | 件名 |
| delivery_count | integer | 配信数 |
| open_count | integer | 開封数 |
| click_count | integer | クリック数 |
| cv_count | integer | CV 数 |
| synced_at | timestamptz | 同期時刻 |
| created_at | timestamptz | 作成時刻 |

出所: Google Sheet `1zITxm8hxMkjNYJb7CKqY1B7JzQWvv20N8afMBkZWVbU` の `calc!A2:L`（列 A–L が上記に対応）。

### `newsletter_optouts`（メルマガ オプトアウト）

メルマガ購読を**オン→オフに切り替えた顧客**の一覧。1行＝1顧客×1日。
出典は Google Sheet `1zITxm8...` の **`20260101以降のオプトアウトリスト`** タブ（A:オプトアウト日 / B:顧客番号）。
同スプシの `BQ_オプトアウト調査`（BigQuery直結の Connected Sheet）は値取得APIで読めないため使わない。

ユニークキー: `optout_date, customer_code`（upsert onConflict）。同じ顧客が別日に再度オフにした場合は別行。

| 列 | 型 | 説明 |
|---|---|---|
| optout_date | date | オプトアウト日 |
| customer_code | text | 顧客番号 |
| synced_at | timestamptz | 同期時刻 |

**解除経路（どのメルマガ/シナリオ経由か）の情報は無い**ため、シナリオ別・テンプレート別には分解できない。
ダッシュボードでは期間合計の KPI と期間別推移のみを出す。データは 2025/12/31 以降しか無い
（BQ 側のクエリが `imported_date >= 2026-01-01` 起点で、そこから1日引いた日付を採用しているため）。

### `ma_deliveries`（MA 配信実績・顧客別）

**1行＝1顧客×1ノードの配信実績。** `newsletter_rows` が日×シナリオ×テンプレートの
**合計**しか持たないのに対し、こちらは顧客番号が入っているため
**顧客ごとに何通届いたか**を数えられる。`newsletter_optouts` との突合キーも顧客番号。

出所は MA管理画面 → 各シナリオのレポート → 「配信対象者毎」CSV
（`scenario_message_target_users_*.csv`、シナリオ1本＝1ファイル）。
Drive フォルダ `1onjS6IBW75WHlTF7ThCOB-_1YNqsI3-M` に置いたものを
`ma-deliveries-to-supabase/run.py` で取り込む。**列はヘッダー名で引く**（位置ではない）。

ユニークキー: `node_id, customer_code, delivered_at`（upsert onConflict・後勝ち）。
同じ期間を再エクスポートしても二重計上しない。

| 列 | 型 | 説明 |
|---|---|---|
| id | bigint (identity) | PK |
| scenario_id / scenario_name / scenario_desc | text | シナリオ |
| segment | text | セグメント |
| node_id | text | シナリオ内の配信ノード（ユニークキーの一部） |
| delivered_at | timestamptz | 配信日時。CSVはJST表記なので `+09:00` を付けて格納 |
| delivery_date | date | `delivered_at` の日付（集計用） |
| delivery_method / template_name / subject | text | 配信方法・テンプレート名・件名 |
| customer_id | text | MAの顧客ID |
| customer_code | text | 顧客番号。`newsletter_optouts` / `ltv_subscriptions` との突合キー |
| delivery_status | text | `完了` / `配信不可` / `スキップ` |
| opened / clicked / auto_opened | boolean | 有→true、無→false、空→null |
| last_click_url | text | 最終クリックURL |
| ordered / order_id / order_code / order_amount / order_count / order_date / order_product_code | — | 受注の有無と内容 |
| source_file | text | 取り込み元CSVのファイル名 |
| synced_at | timestamptz | 同期時刻 |

**受信通数を数えるときは `delivery_status = '完了'` で絞る。**
`配信不可`・`スキップ` は届いていない。

⚠️ **MAの保持期間は約13ヶ月**。2026-11-16のエクスポートは **2025-10-01 以降**しか入っていない
（`newsletter_rows` は 2025-09-12 から始まるので1ヶ月ぶん足りない）。
顧客の最初の配信まで履歴が揃わない場合、「累計何通目でオプトアウトした」と断定しない。
⚠️ 開封には bot の自動開封が混ざる（`auto_opened`）。

**2026-11-26 に22/22ファイル・314,787行の投入が完了。** それまでは19ファイルしか入っておらず、
**10MB超の3ファイル（215,329行・全体の約70%）が欠けていた**（Driveコネクタの制限）。
取得は `ma-deliveries-to-supabase/fetch_drive.py`（Drive APIには10MB制限が無い）。

⚠️ **一斉配信とステップ配信を混ぜない。** 種別のフラグはこのテーブルにも元CSVにも無く、
**配信日の広がり**で判定する（`ma-scenario-kind.ts`・3日以内なら一斉配信）。
`me&re 単発配信` は2日で112,271人＝ほぼ全顧客に当たっているため、混ぜるとどのテンプレートにも
等しくオプトアウトがぶら下がり、通目も頻度も意味を失う。
**ノード数や「1人あたり通数」では判別できない**（ステップにも1ノード・1通/人のシナリオが多数ある）。

⚠️ **`newsletter_optouts` には配信と無関係な一括処理が混ざっている。**
2026-04-01（485件）・04-08（892件）・04-09（1,289件）。平常日は中央値10件で、
これらの日の配信は165〜255通しかない。**配信数の5〜8倍の解除**は配信への反応では起こり得ない。
3日で2,666件＝全体の31%。分析では除外する（`BULK_OPTOUT_DATES`）。**何の処理だったかは未確認。**

### `ltv_subscriptions`（定期購入ごとの購入商品と LTV）

FB広告経由の定期購入1件＝1行。出典は Google Sheet `10wmBYd-oWJOMkKCtmu98SeHu5ulV6o02tYd_eqZsf_8`
（LTV集計-Sicks共有）の **`RAW_定期ID別購入商品_LTV95_180_365`** タブ。
同スプシの `定期ID別購入商品_LTV95_180_365`（BigQuery直結の Connected Sheet）は値取得APIで読めないため、
その値コピーであるこの RAW タブを正とする。**列はヘッダー名で引く**（位置ではない）。

**2つのデータセットを持つ**（元のBigQueryクエリが対象範囲ごとに別タブになっているため）。

通常のLTV画面・既定の取得と更新は `all`（全経路）のみ。`fb` は保存済みデータとの互換性のため維持し、削除や全経路との合算はしない。

| `dataset` | タブ | 範囲 |
|---|---|---|
| `fb` | `RAW_定期ID別購入商品_LTV95_180_365` | FB広告経由のみ・2024-06-01以降 |
| `all` | `RAW_定期ID別購入商品_LTV95_180_365_全経路` | 全経路（広告グループ絞り込み無し）・**2026-01-01以降** |

2つは**重なる**（2026年以降のFB広告分は両方に出る）ので、ユニークキーは `dataset, subs_order_code`。
顧客は複数の定期を持ちうるので**顧客単位ではない**。
`all` のタブには `初回購入商品フラグ` と `オファー名` の列が無いため、**オファー名は空**になる。

**オプトアウトと掛け合わせるなら `all` を使う。** `newsletter_optouts` は 2025-12-31 以降しか無く、
`fb`（2024-06〜）だとそれ以前の月が必ず「オプトアウトなし」に寄るが、`all` は 2026-01 以降なので期間が揃う。

| 列 | 型 | 説明 |
|---|---|---|
| dataset | text | `fb` / `all`（PKの一部） |
| subs_order_code | text | 定期購入番号（PKの一部） |
| customer_code | text | 顧客番号。`newsletter_optouts.customer_code` と突き合わせる |
| first_order_month | date | 初回購入月（月初日に正規化） |
| first_product | text | 初回購入の商品ラベル |
| ad_group_name | text | 広告グループ名 |
| subs_status | text | サブスク状態 |
| product_2 / product_3 / product_4 | text | 2〜4回目の商品ラベル |
| ltv95 / ltv180 / ltv365 | numeric | 初回購入日から95/180/365日以内の利益合計 |
| selling_url | text | 販売URL |
| offer_name | text | オファー名（1〜4回目の組み合わせの呼び名） |
| synced_at | timestamptz | 同期時刻 |

元データは BigQuery `gcp-abema-ecf-oral` で、**`ad_url_group_name LIKE '%FB広告%'` かつ 2024-06-01 以降**の
`発送完了` 受注のみ。LTV は売上ではなく **`v_profit.total_profit`（利益）の合計**である点に注意。

### `efo_access_cv`（EFO アクセス/CV）

ユニークキー: `date, ad_code, profile_name`。

| 列 | 型 | 説明 |
|---|---|---|
| id | integer (seq) | PK |
| date | text | 日付 |
| ad_code | text | 広告コード |
| profile_name | text | プロファイル名 |
| access_count | integer | 起動数/アクセス数 |
| cv_count | integer | CV 数 |
| synced_at | text | 同期時刻 |

出所: Sheet `1gibjDJns9sIR5bnxDAKELz2a4ajWWpcdrvVetjnY0HM` の `raw_efo_access!R:U`（access）+ `raw_efo_cv!Y:AB`（cv）を key で結合。

### `efo_exit_scenarios`（EFO 離脱シナリオ）

| 列 | 型 | 説明 |
|---|---|---|
| id | integer (seq) | PK |
| date | text | 日付 |
| profile_name | text | プロファイル名 |
| ad_code | text | 広告コード |
| exit_scenario | text | 離脱シナリオ |
| session_count | integer | セッション数 |
| synced_at | text | 同期時刻 |

出所: `raw_efo_access!A2:O`（A=セッション, B=プロファイル名, F=離脱シナリオ, M=広告コード, O=日付）を `(date, profileName, adCode, exitScenario)` で集計。

### `ecf_ad_access_cv`（ECforce 広告集計）

| 列 | 型 | 説明 |
|---|---|---|
| id | bigint (identity) | PK |
| ad_url | text | 広告 URL（広告コード） |
| ad_date | date | 集計日 |
| access_count | integer | アクセス数 |
| cv_count | integer | CV(受注)数 |
| synced_at | timestamptz | 同期時刻 |

出所: `ecf-ad-to-supabase` が BQ_ECF 広告集計タブ（A:ad_url B:ad_date C:access_count D:cv_order）を CSV export し、**DELETE→INSERT（全期間入れ替え）で冪等**投入。

### `campaigns`（施策カレンダー）

| 列 | 型 | 説明 |
|---|---|---|
| id | uuid | PK（gen_random_uuid） |
| title | text | 施策タイトル |
| start_date | date | 開始日 |
| end_date | date | 終了日 |
| memo | text (null可) | メモ |
| category | text (null可) | カテゴリ |
| created_at / updated_at | timestamptz | 作成/更新時刻 |

出所: ダッシュボードの施策カレンダー画面から CRUD。

### `efo_presets`（CVR レポートのフィルタプリセット）

| 列 | 型 | 説明 |
|---|---|---|
| id | bigint (seq) | PK |
| name | text | プリセット名 |
| group_by | text | 集計軸 |
| segment_a | jsonb | A 側フィルタ条件 |
| segment_b | jsonb | B 側フィルタ条件 |
| created_at | timestamptz | 作成時刻 |

### `dashboard_users` / `dashboard_sessions`（ログイン認証）★置き場が違う

**この2つだけ Supabase ではなく Replit の Postgres（`DATABASE_URL`）側**。
集計データと運用データ（セッション・二要素のシークレット）を混ぜないため。
drizzle のスキーマ（`lib/db/src/schema/auth.ts`）が正で、
`scripts/post-merge.sh` の `pnpm --filter db push` が作る。**手でDDLを流さない。**

`dashboard_users`

| 列 | 型 | 備考 |
|---|---|---|
| `id` | text PK | ランダム16バイトhex |
| `email` | text UNIQUE | Google の確認済みメール（小文字） |
| `google_sub` | text | Google のユーザー識別子 |
| `name` / `picture_url` | text | 表示用 |
| `totp_secret` | text | **AES-256-GCM で暗号化済み**。平文は保存しない |
| `totp_enrolled_at` | timestamptz | null = 二要素が未完了 |
| `totp_last_used_step` | integer | 同じコードの使い回しを弾くため |
| `backup_code_hashes` | text[] | HMAC ハッシュ。使った分は配列から消える |
| `totp_failed_count` / `totp_locked_until` | integer / timestamptz | 総当たり対策 |
| `disabled` | boolean | 個別の利用停止 |
| `created_at` / `last_login_at` | timestamptz | |

`dashboard_sessions`

| 列 | 型 | 備考 |
|---|---|---|
| `id` | text PK | |
| `token_hash` | text UNIQUE | Cookie のトークンの **sha256 のみ**。トークン本体は保存しない |
| `user_id` | text | |
| `stage` | text | `totp_pending`（Googleのみ通過）/ `active`（二要素まで通過） |
| `created_at` / `expires_at` / `last_seen_at` / `revoked_at` | timestamptz | |
| `ip` / `user_agent` | text | |

> `stage` が2段階あるのが肝。`totp_pending` を「ログイン済み」として扱わない。

### `line_zone_daily` / `line_url_master` / `line_url_cv`（LINE実績レポート）

出所: Google Sheet `1ol--HUyOeodoFPEQIyleBsP3HyFhFBv7rCJfrxrx42g`
（`O2O×SICKS／LINE実績レポート`。GASがLiny APIから毎日取得して書いている）。
取り込みは手動 `POST /line/sync`。

**値は `UNFORMATTED_VALUE` で取る。** 表示形式のままだと友だち数が `50,920`（桁区切り）、
日付が `2月1日`（年が落ちる）で返ってくる。

**タブ名はメタデータから末尾一致で解決する。** GASが作るタブには `GAS_` の接頭辞が付き、
手作業のタブ（`SICKS作成用_パラメURL`）には付いていない。固定名で書くと片方が外れる。

#### `line_zone_daily`（日付 × 経路ゾーン）

`日実績` タブ（A〜DE／109列）を縦持ちにしたもの。ユニークキー: `report_date, zone`。

| 列 | 型 | 説明 |
|---|---|---|
| report_date | date | 日付 |
| zone | text | `overall` / `tagged` / `qrNew` / `qrOld` / `site` / `noah` / `cosfesOsaka` / `cosfesFukuoka` / `richMenu` / `other` |
| people | integer | 人数(累計)。**ブロックした人も含む**ので友だち数ではない |
| new_count | integer | 当日新規（created_atベース）。**翌朝確定**。空欄は未確定で0ではない |
| instant_block | integer | その日の新規のうち翌朝時点でブロックしていた人数 |
| block_delta | integer | ブロック累計の前日差（ブロック日時が無いための代理値。マイナスもあり得る） |
| block_total | integer | ブロック累計 |
| active | integer | 残存。`people − block_total`。**KPIの「友だち数」はこれ** |
| scenario_count | integer | シナリオ分類済み人数（新QR・旧QRのみ） |
| lp_access | integer | パラメURLへの到達数（ECforceのaccess_count）。友だち追加数でも開封数でもない |
| cv | integer | LINE経由のサブスク登録数（ECforce由来） |

率は保存しない。**合計してから割る**ため（日ごとの率の平均にしない）。
`richMenu` と `other` は経路を特定できないため残高を持たず、`lp_access` と `cv` だけ。

#### `line_url_master`（識別子 → 配信の属性）

`SICKS作成用_パラメURL` タブ。ユニークキー: `identifier`。

| 列 | 型 | 説明 |
|---|---|---|
| identifier | text PK | パラメURLの `?u=` 以降。**URLから取り出す**（識別子だけの列は見出しが無く位置がずれる） |
| route / segment_subscription / segment_child | text | 経路名 / サブスク経験 / 子ども有無 |
| message_pack | text | メッセージパック名（例 `ステップ配信⑥_クーポン`） |
| step_number | integer | ステップ配信の通数。列が使えないときは**パック名の丸数字**から拾う |
| ad_group / url | text | 広告G名 / パラメURL全文 |
| has_coupon | boolean | `あり`→true、`無`→false、空欄は **null**（「無し」と断定しない） |

#### `line_url_cv`（日付 × 識別子のCV）

`LINE_ECFCV（URL_日別）` タブ（横持ち）を縦持ちにしたもの。ユニークキー: `report_date, identifier`。
**0は保存しない。** そのため取り込みは **DELETE→INSERT**（upsertだと1→0に直ったCVが残る）。

**識別子ごとのLPアクセスは取り込めていない。** 用語タブには
`LINE_ECFアクセス（URL_日別）` を2026/10/08に追加したと書かれているが、**実ファイルにタブが存在しない**
（`新規獲得ログ_過去分` `ステップ復活検知` `【凍結】日次実績_手動` も同様に無い）。
そのため**配信別のCVRは出せない**（分母が無い）。経路別のLPアクセスは `line_zone_daily` にある。

**配信通数・開封数・クリック数はどのタブにも無い。** 開封率・CTRはこのデータでは出せない。

## Storage オブジェクト

### `clarity-heatmaps`

- パス: `{YYYY-MM-DD}/{adCode}_{device}_scroll_{date}.csv`（device ∈ {Desktop, Mobile}）。
- 現行 `export.py` は `.png` も同名で出力しうる（`image/png`）。API 側は `.csv` のみ参照。
- CSV 内容（Clarity 出力）: ヘッダに `"ページ ビュー","<PV>"` 行、`スクロールの奥行き` 見出し以降に
  `"<depth>","<visitors>",...` のデータ行。API `parseCsv()` が PV と depth×visitors を抽出。

### `app-settings/config.json`

```json
{ "clarityTargetUrls": ["kisekino_haburashi_fb_inst_top_1_a", "..."] }
```

- 旧フォーマット `clarityTargetUrl`（単数）は読み込み時に配列へ自動移行。

## 指標・集計定義

メルマガ（`newsletter-aggregate.ts`）:

- **openRate** = open_count / delivery_count（delivery_count>0、それ以外 0）
- **clickRate** = click_count / delivery_count
- **cvr** = cv_count / delivery_count
- 集計軸 `groupBy` = day / week / month / scenario / template。
  - day/week/month はラベル昇順、scenario/template は配信数降順ソート。
- 比較モード: 前期間の同ラベルを `prev*` にマージ（before/after 表示用）。
- マトリクス: (scenario|template) × 時間軸 × 指標(deliveryCount/openRate/clickRate/cvr/cvCount)。

EFO / ECforce:

- CVR 系はアクセス数と CV 数を key（date/adCode/profileName）で結合して算出。
- 離脱シナリオはシナリオ別セッション数の内訳。

Clarity スクロール深度:

- Desktop/Mobile 各 CSV を depth をキーに統合し、`{ depth, desktop, mobile }` 配列 + `pageViews{Desktop,Mobile}` を返す。
- 画面では Y 軸=スクロール深度(5%→100%)、X 軸=訪問者数の縦チャートで A/B 2 パネル比較。

## 各データソースと更新頻度

| データ | ソース | 経路 | 更新頻度 |
|---|---|---|---|
| newsletter_rows | Google Sheet `1zITxm8...` `calc` | API（cache→Supabase→Sheets）+ 手動 `/newsletter/sync` | Sheet 更新時に手動同期。読み出しはキャッシュ優先 |
| newsletter_optouts | Google Sheet `1zITxm8...` `20260101以降のオプトアウトリスト` | API（cache→Supabase→Sheets）+ 手動 `/newsletter/sync` | Sheet 更新時に手動同期 |
| ma_deliveries | MA「配信対象者毎」CSV（Drive `1onjS6IB...`） | `ma-deliveries-to-supabase/run.py`（upsert） | **定期実行なし**。CSVを再エクスポートしたら手動 |
| line_zone_daily / line_url_master / line_url_cv | Google Sheet `1ol--HU...`（`O2O×SICKS／LINE実績レポート`） | 手動 `POST /line/sync`（Replit Connectors経由） | **定期実行なし**。元シートはGASが毎日更新、取り込みは画面のボタン |
| ltv_subscriptions | Google Sheet `10wmBYd...` の `RAW_定期ID別購入商品_LTV95_180_365`（fb）と `..._全経路`（all） | 手動 `/ltv/sync` のみ（GETでは取り込まない） | Sheet 更新時に手動同期 |
| efo_access_cv / efo_exit_scenarios | Google Sheet `1gibjDJns9...` `raw_efo_*` | API `/efo/sync` ＋ 外部 ecforce-efo-to-supabase | ダッシュボード同期時 / 外部日次 |
| ecf_ad_access_cv | BQ_ECF 広告集計 Sheet（CSV export） | `ecf-ad-to-supabase/run.py`（DELETE→INSERT） | **日次 08:15**（cron） |
| clarity-heatmaps (Storage) | Microsoft Clarity（PROJECT_ID srj36555ho, 歯科衛生士LP） | `clarity-heatmap-export/export.py`（Playwright 永続プロファイル） | **日次 08:00**（launchd、前日分＋当日分。2026-11-18に cron 11:30 から変更） |
| campaigns / efo_presets | ダッシュボード操作 | API CRUD | 随時 |
| app-settings/config.json | 設定ページ | API `/settings` PUT | 随時 |

## 参考 SQL

```sql
-- メルマガ 日別 CVR（直近14日）
select delivery_date,
       sum(delivery_count) as delivery,
       sum(cv_count) as cv,
       case when sum(delivery_count)>0
            then round(sum(cv_count)::numeric/sum(delivery_count),4) end as cvr
from newsletter_rows
group by delivery_date
order by delivery_date desc
limit 14;

-- newsletter_optouts の作成（service_role キーでは DDL を実行できないため SQL Editor で手動実行）
create table if not exists newsletter_optouts (
  optout_date   date        not null,
  customer_code text        not null,
  synced_at     timestamptz not null default now(),
  primary key (optout_date, customer_code)
);
create index if not exists newsletter_optouts_date_idx
  on newsletter_optouts (optout_date);

-- メルマガ 月別オプトアウト件数
select to_char(optout_date, 'YYYY/MM') as ym, count(*) as optouts
from newsletter_optouts
group by 1
order by 1 desc;

-- ltv_subscriptions の作成（service_role キーでは DDL を実行できないため SQL Editor で手動実行）
create table if not exists ltv_subscriptions (
  dataset           text        not null default 'fb',
  subs_order_code   text        not null,
  customer_code     text        not null,
  first_order_month date,
  first_product     text,
  ad_group_name     text,
  subs_status       text,
  product_2         text,
  product_3         text,
  product_4         text,
  ltv95             numeric     not null default 0,
  ltv180            numeric     not null default 0,
  ltv365            numeric     not null default 0,
  selling_url       text,
  offer_name        text,
  synced_at         timestamptz not null default now(),
  primary key (dataset, subs_order_code)
);

-- すでに素の ltv_subscriptions を作ってある場合はこちら（2026-11-20の変更）
alter table ltv_subscriptions add column if not exists dataset text not null default 'fb';
alter table ltv_subscriptions drop constraint if exists ltv_subscriptions_pkey;
alter table ltv_subscriptions add primary key (dataset, subs_order_code);
create index if not exists ltv_subscriptions_customer_idx
  on ltv_subscriptions (customer_code);
create index if not exists ltv_subscriptions_month_idx
  on ltv_subscriptions (first_order_month);
create index if not exists ltv_subscriptions_offer_idx
  on ltv_subscriptions (offer_name);

-- ma_deliveries の作成（service_role キーでは DDL を実行できないため SQL Editor で手動実行）
create table if not exists public.ma_deliveries (
  id                 bigint generated always as identity primary key,
  scenario_id        text,
  scenario_name      text,
  scenario_desc      text,
  segment            text,
  node_id            text        not null,
  delivered_at       timestamptz not null,
  delivery_date      date        not null,
  delivery_method    text,
  template_name      text,
  subject            text,
  customer_id        text,
  customer_code      text        not null,
  delivery_status    text,
  opened             boolean,
  clicked            boolean,
  last_click_url     text,
  ordered            boolean,
  order_id           text,
  order_code         text,
  order_amount       integer     not null default 0,
  order_count        integer     not null default 0,
  auto_opened        boolean,
  order_date         date,
  order_product_code text,
  source_file        text,
  synced_at          timestamptz not null default now(),
  unique (node_id, customer_code, delivered_at)
);
alter table public.ma_deliveries enable row level security;
create index if not exists ma_deliveries_customer_idx
  on public.ma_deliveries (customer_code, delivered_at);
create index if not exists ma_deliveries_date_idx
  on public.ma_deliveries (delivery_date);
create index if not exists ma_deliveries_template_idx
  on public.ma_deliveries (template_name, delivery_date);

-- 顧客ごとの受信通数（届いた分のみ）×オプトアウト有無
select d.cnt, count(*) as customers,
       count(o.customer_code) as opted_out
from (select customer_code, count(*) as cnt
      from ma_deliveries
      where delivery_status = '完了'
      group by customer_code) as d
left join (select distinct customer_code from newsletter_optouts) as o
       using (customer_code)
group by d.cnt
order by d.cnt;

-- 初回購入月 × オプトアウト有無 の平均LTV180
select to_char(l.first_order_month, 'YYYY/MM') as ym,
       (o.customer_code is not null)           as opted_out,
       count(*)                                as subs,
       round(avg(l.ltv180), 0)                 as avg_ltv180
from ltv_subscriptions l
left join (select distinct customer_code from newsletter_optouts) o
  on o.customer_code = l.customer_code
group by 1, 2
order by 1 desc, 2;

-- ECforce 広告 URL 別の直近アクセス/CV
select ad_url, ad_date, access_count, cv_count
from ecf_ad_access_cv
order by ad_date desc, cv_count desc
limit 50;

-- EFO 広告コード別 CVR（プロファイル横断）
select ad_code,
       sum(access_count) as access,
       sum(cv_count) as cv,
       case when sum(access_count)>0
            then round(sum(cv_count)::numeric/sum(access_count),4) end as cvr
from efo_access_cv
group by ad_code
order by cv desc;
```

### LINE実績レポートの3テーブル（SQL Editor で手動実行）

```sql
create table if not exists public.line_zone_daily (
  report_date    date    not null,
  zone           text    not null,
  people         integer,
  new_count      integer,
  instant_block  integer,
  block_delta    integer,
  block_total    integer,
  active         integer,
  scenario_count integer,
  lp_access      integer,
  cv             integer,
  synced_at      timestamptz not null default now(),
  primary key (report_date, zone)
);
alter table public.line_zone_daily enable row level security;
create index if not exists line_zone_daily_zone_idx on public.line_zone_daily (zone, report_date);

create table if not exists public.line_url_master (
  identifier           text primary key,
  route                text,
  segment_subscription text,
  segment_child        text,
  message_pack         text,
  step_number          integer,
  ad_group             text,
  has_coupon           boolean,
  url                  text,
  synced_at            timestamptz not null default now()
);
alter table public.line_url_master enable row level security;
create index if not exists line_url_master_pack_idx on public.line_url_master (message_pack);

-- 0は保存しない運用。取り込みは DELETE→INSERT。
create table if not exists public.line_url_cv (
  report_date date    not null,
  identifier  text    not null,
  cv          integer not null,
  synced_at   timestamptz not null default now(),
  primary key (report_date, identifier)
);
alter table public.line_url_cv enable row level security;
create index if not exists line_url_cv_identifier_idx on public.line_url_cv (identifier, report_date);
```
