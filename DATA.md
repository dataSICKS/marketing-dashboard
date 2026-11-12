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

### `ltv_subscriptions`（定期購入ごとの購入商品と LTV）

FB広告経由の定期購入1件＝1行。出典は Google Sheet `10wmBYd-oWJOMkKCtmu98SeHu5ulV6o02tYd_eqZsf_8`
（LTV集計-Sicks共有）の **`RAW_定期ID別購入商品_LTV95_180_365`** タブ。
同スプシの `定期ID別購入商品_LTV95_180_365`（BigQuery直結の Connected Sheet）は値取得APIで読めないため、
その値コピーであるこの RAW タブを正とする。**列はヘッダー名で引く**（位置ではない）。

ユニークキー: `subs_order_code`。顧客は複数の定期を持ちうるので**顧客単位ではない**。

| 列 | 型 | 説明 |
|---|---|---|
| subs_order_code | text | 定期購入番号（PK） |
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
| ltv_subscriptions | Google Sheet `10wmBYd...` `RAW_定期ID別購入商品_LTV95_180_365` | API（cache→Supabase→Sheets）+ 手動 `/ltv/sync` | Sheet 更新時に手動同期 |
| efo_access_cv / efo_exit_scenarios | Google Sheet `1gibjDJns9...` `raw_efo_*` | API `/efo/sync` ＋ 外部 ecforce-efo-to-supabase | ダッシュボード同期時 / 外部日次 |
| ecf_ad_access_cv | BQ_ECF 広告集計 Sheet（CSV export） | `ecf-ad-to-supabase/run.py`（DELETE→INSERT） | **日次 08:15**（cron） |
| clarity-heatmaps (Storage) | Microsoft Clarity（PROJECT_ID srj36555ho, 歯科衛生士LP） | `clarity-heatmap-export/export.py`（Playwright 永続プロファイル） | **日次 11:30**（cron、前日分。2026-10-14に07:30から変更） |
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
  subs_order_code   text        primary key,
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
  synced_at         timestamptz not null default now()
);
create index if not exists ltv_subscriptions_customer_idx
  on ltv_subscriptions (customer_code);
create index if not exists ltv_subscriptions_month_idx
  on ltv_subscriptions (first_order_month);
create index if not exists ltv_subscriptions_offer_idx
  on ltv_subscriptions (offer_name);

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
