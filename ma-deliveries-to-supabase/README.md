# ma-deliveries-to-supabase

ECforce MA の「**配信対象者毎**」CSV（`scenario_message_target_users_*.csv`）を
Supabase `ma_deliveries` に蓄積する。

**1行＝1顧客×1ノードの配信実績。** 集計済みの `calc` シート（= `newsletter_rows`）では
日×シナリオ×テンプレートの合計しか分からないが、こちらは顧客番号が入っているため
**顧客ごとに何通届いたか**を数えられる。オプトアウト（`newsletter_optouts`）との
突合キーも顧客番号。

## データ

- 出所: MA管理画面 → 各シナリオのレポート → 「配信対象者毎」でCSVダウンロード
  - シナリオ1本につき1ファイル。期間はシナリオ開始〜前日で指定する
  - 置き場: Google Drive フォルダ `1onjS6IBW75WHlTF7ThCOB-_1YNqsI3-M`
- 列（CSVヘッダ名で引く。位置依存にしない）

  | CSV | DB | 備考 |
  |---|---|---|
  | シナリオID / シナリオ名 / シナリオ説明 | `scenario_id` / `scenario_name` / `scenario_desc` | |
  | セグメント | `segment` | |
  | ノードID | `node_id` | シナリオ内の配信ノード |
  | 配信日時 | `delivered_at` | JST表記 → `+09:00` を付けて timestamptz |
  | 配信方法 / テンプレート名 / 件名 | `delivery_method` / `template_name` / `subject` | |
  | 顧客ID / 顧客番号 | `customer_id` / `customer_code` | 突合は**顧客番号** |
  | 配信ステータス | `delivery_status` | `完了` / `配信不可` / `スキップ` |
  | 開封有無 / クリック有無 / 自動開封有無 | `opened` / `clicked` / `auto_opened` | 有→true, 無→false, 空→null |
  | 最終クリックURL | `last_click_url` | |
  | 受注有無 / 受注ID / 受注番号 / 受注金額 / 受注数 / 受注日 / 受注商品コード | `ordered` / `order_id` / `order_code` / `order_amount` / `order_count` / `order_date` / `order_product_code` | |

- ユニークキー: `(node_id, customer_code, delivered_at)`。同じ期間を再エクスポートしても
  二重計上しない（upsert・後勝ち）。

## 使い方

```bash
python3 run.py                      # config.yml の csv_dir を取り込み
python3 run.py --csv-dir ./some/dir # ディレクトリを指定
python3 run.py --dry-run            # 投入せず件数・内訳のみ
```

## テーブル作成（初回のみ・Supabase SQL Editor）

`service_role` キーでは DDL を実行できないため手動。

```sql
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
```

## 定期実行はしない

CSVのエクスポートがMA管理画面の手作業なので、cronには載せない。
新しくエクスポートしたらCSVを置いて `run.py` を回す。

## 注意

- **MAの保持期間は約13ヶ月**。2026-11時点のエクスポートは 2025-10 より前が入っていない。
  顧客の最初の配信まで履歴が揃わない場合、「累計何通目」を断定しない。
- `配信不可` `スキップ` は**届いていない**。受信通数に数えるときは
  `delivery_status = '完了'` で絞る。
- `開封有無` にはbotによる自動開封が混ざる。`auto_opened` を併せて見る。
- Drive経由でダウンロードできるのは1ファイル10MBまで（コネクタの制限）。
  超えるものは期間を分けて再エクスポートする。
