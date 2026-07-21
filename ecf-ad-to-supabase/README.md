# ecf-ad-to-supabase

`BQ_ECF_広告集計` シート（BigQuery連携）の **A〜D列**（ad_url / ad_date / access_count / cv_order）を
Supabase に**蓄積**する日次パイプライン。

シートはBQ連携で都度上書きされ、表示期間（窓）が動くため履歴が残らない。
そこで毎日シートの現在値を読み、**シートに現れている日付ぶんだけ DELETE→INSERT**（冪等）。
窓から外れた過去日はDBに残り続け、履歴が貯まる。

## データ

- シート: `1gibjDJns9sIR5bnxDAKELz2a4ajWWpcdrvVetjnY0HM` の `BQ_ECF_広告集計`(gid=1814403765)
  - A: ad_url（広告コード）, B: ad_date, C: access_count の SUM, D: cv_order の SUM
- 取得は **CSVエクスポートURL**（認証不要）。
- 投入先: Supabase `ecf_ad_access_cv`（marketing-dashboard と同じプロジェクト）
  - 列: ad_url(text), ad_date(date), access_count(int), cv_count(int), synced_at(timestamptz)

## 使い方

```bash
python3 run.py            # シート現在値を取り込み（蓄積）
python3 run.py --dry-run  # 投入せず件数・サンプル確認
```

## テーブル作成（初回のみ・Supabase SQL Editor）

```sql
create table if not exists public.ecf_ad_access_cv (
  id bigint generated always as identity primary key,
  ad_url text not null,
  ad_date date not null,
  access_count integer not null default 0,
  cv_count integer not null default 0,
  synced_at timestamptz
);
create index if not exists idx_ecf_ad_access_cv_date on public.ecf_ad_access_cv (ad_date);
```

## cron（毎朝8:15）

```
15 8 * * * cd /Users/sicks/claude-work/marketing-dashboard/ecf-ad-to-supabase && /usr/bin/python3 run.py >> logs/cron.log 2>&1
```

## 蓄積の仕組み

- シートにある日付集合を DELETE → 現在値を INSERT。同じ日を再実行しても重複しない。
- シートから消えた過去日はDBで保持（accumulate）。
- 認証情報は config.yml（gitignore）。書き込みは Supabase service_role キー（RLSバイパス）。
