"""ECforce MA の「配信対象者毎」CSV（scenario_message_target_users_*.csv）を
Supabase の ma_deliveries に蓄積する。

1行＝1顧客×1ノードの配信実績。集計済みの calc シートと違い、
**顧客ごとに何通届いたか**を数えられるのがこのデータの価値。

CSVはMAの管理画面からシナリオ単位でエクスポートする（Drive等に置いたものを
ローカルへ落としてから使う）。同じ期間を再エクスポートしても
(ノードID, 顧客番号, 配信日時) で upsert するので二重計上しない。

使い方:
  python3 run.py                      # config.yml の csv_dir を取り込み
  python3 run.py --csv-dir ./some/dir  # ディレクトリを指定
  python3 run.py --dry-run             # 投入せず件数・内訳のみ
"""
import argparse
import csv
import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests
import yaml

HERE = Path(__file__).parent
CFG = yaml.safe_load(open(HERE / "config.yml"))
SB = CFG["supabase"]
TABLE = SB.get("table", "ma_deliveries")

BATCH = 250
# 1バッチあたりの再試行。10万行規模だと接続が切れることがあるため
RETRIES = 5

# CSVのヘッダ名 → DBの列名。位置ではなく名前で引く（列が増えてもずれない）
COLUMNS = {
    "シナリオID": "scenario_id",
    "シナリオ名": "scenario_name",
    "シナリオ説明": "scenario_desc",
    "セグメント": "segment",
    "ノードID": "node_id",
    "配信日時": "delivered_at",
    "配信方法": "delivery_method",
    "テンプレート名": "template_name",
    "件名": "subject",
    "顧客ID": "customer_id",
    "顧客番号": "customer_code",
    "配信ステータス": "delivery_status",
    "開封有無": "opened",
    "クリック有無": "clicked",
    "最終クリックURL": "last_click_url",
    "受注有無": "ordered",
    "受注ID": "order_id",
    "受注番号": "order_code",
    "受注金額": "order_amount",
    "受注数": "order_count",
    "自動開封有無": "auto_opened",
    "受注日": "order_date",
    "受注商品コード": "order_product_code",
}
BOOL_COLS = ("opened", "clicked", "ordered", "auto_opened")
INT_COLS = ("order_amount", "order_count")

REQUIRED_HEADERS = ("ノードID", "顧客番号", "配信日時")


def parse_bool(v):
    """有/無 → True/False。空欄やそれ以外は None（不明を False と断定しない）。"""
    v = (v or "").strip()
    if v == "有":
        return True
    if v == "無":
        return False
    return None


def parse_int(v):
    v = (v or "").strip().replace(",", "")
    if not v:
        return 0
    try:
        return int(float(v))
    except ValueError:
        return 0


# MAの画面・CSVの日時はJST表記。timestamptz に入れるので明示的にオフセットを付ける
JST = "+09:00"


def parse_datetime(v):
    """`2025/10/09 12:06` / `2025-10-09 12:06:05` → `2025-10-09T12:06:00+09:00`。"""
    v = (v or "").strip()
    if not v:
        return None
    v = v.replace("/", "-")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%dT%H:%M:%S") + JST
        except ValueError:
            continue
    return None


def parse_date(v):
    dt = parse_datetime(v)
    return dt[:10] if dt else None


def read_csv(path):
    """1ファイルを読み、DB列名のdictリストと、読み飛ばした行数を返す。"""
    rows, skipped = [], 0
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        missing = [h for h in REQUIRED_HEADERS if h not in header]
        if missing:
            raise SystemExit(
                f"{path.name}: 必須列が見つかりません {missing}\n見つかった列: {header}"
            )
        for raw in reader:
            rec = {}
            for jp, col in COLUMNS.items():
                rec[col] = (raw.get(jp) or "").strip()
            # 一意キーが欠けている行は入れない（部分的に壊れた行を混ぜない）
            if not rec["node_id"] or not rec["customer_code"]:
                skipped += 1
                continue
            rec["delivered_at"] = parse_datetime(rec["delivered_at"])
            if not rec["delivered_at"]:
                skipped += 1
                continue
            rec["delivery_date"] = rec["delivered_at"][:10]
            rec["order_date"] = parse_date(rec["order_date"]) or None
            for c in BOOL_COLS:
                rec[c] = parse_bool(rec[c])
            for c in INT_COLS:
                rec[c] = parse_int(rec[c])
            rec["source_file"] = path.name
            rows.append(rec)
    return rows, skipped


def upsert(rows, synced_at):
    url = f"{SB['url']}/rest/v1/{TABLE}?on_conflict=node_id,customer_code,delivered_at"
    headers = {
        "apikey": SB["service_role_key"],
        "Authorization": f"Bearer {SB['service_role_key']}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        for r in batch:
            r["synced_at"] = synced_at
        body = json.dumps(batch)
        for attempt in range(1, RETRIES + 1):
            try:
                res = requests.post(url, headers=headers, data=body, timeout=180)
            except requests.exceptions.RequestException as err:
                if attempt == RETRIES:
                    raise SystemExit(f"upsert失敗（接続） {i}行目〜: {err}")
                wait = 2 ** attempt
                print(f"  {i:,}行目〜 接続エラー（{attempt}/{RETRIES}）{wait}秒待って再試行")
                time.sleep(wait)
                continue
            if res.status_code < 300:
                break
            # 5xx は一時的なことがあるので再試行、4xx は直らないので即止める
            if res.status_code < 500 or attempt == RETRIES:
                raise SystemExit(f"upsert失敗 ({res.status_code}) {i}行目〜: {res.text[:500]}")
            wait = 2 ** attempt
            print(f"  {i:,}行目〜 {res.status_code}（{attempt}/{RETRIES}）{wait}秒待って再試行")
            time.sleep(wait)
        if (i // BATCH) % 20 == 0 or i + BATCH >= len(rows):
            print(f"  {min(i + BATCH, len(rows)):,}/{len(rows):,}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-dir", default=CFG.get("csv_dir", "./csv"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    csv_dir = Path(args.csv_dir)
    if not csv_dir.is_absolute():
        csv_dir = (HERE / csv_dir).resolve()
    files = sorted(csv_dir.glob("*.csv"))
    if not files:
        raise SystemExit(f"CSVが見つかりません: {csv_dir}")

    all_rows, skipped_total = [], 0
    for p in files:
        rows, skipped = read_csv(p)
        skipped_total += skipped
        all_rows.extend(rows)
        print(f"{p.name}: {len(rows):,}行 (読み飛ばし {skipped})")

    # 同一キーの重複を除去（後勝ち）。再エクスポート分が混ざっても一度だけ入れる
    seen = {}
    for r in all_rows:
        seen[(r["node_id"], r["customer_code"], r["delivered_at"])] = r
    rows = list(seen.values())

    status = Counter(r["delivery_status"] for r in rows)
    dates = sorted(r["delivery_date"] for r in rows)
    print(
        f"\nファイル {len(files)}本 / 読み込み {len(all_rows):,}行 "
        f"→ 一意 {len(rows):,}行 (読み飛ばし {skipped_total})"
    )
    print(f"期間: {dates[0]} 〜 {dates[-1]}")
    print(f"ユニーク顧客: {len({r['customer_code'] for r in rows}):,}")
    print("配信ステータス: " + " / ".join(f"{k}={v:,}" for k, v in status.most_common()))

    if args.dry_run:
        print("\n--dry-run なので投入しません")
        return

    synced_at = datetime.now(timezone.utc).isoformat()
    print(f"\n{TABLE} へ upsert します")
    upsert(rows, synced_at)
    print("完了")


if __name__ == "__main__":
    main()
