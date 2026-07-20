"""BQ_ECF_広告集計シート(A:ad_url B:ad_date C:access_count D:cv_order) を
Supabase に蓄積する日次パイプライン。

シートはBQ連携で都度上書きされるため、シートに現れている日付分だけを
DELETE→INSERT（冪等）。シートの窓から外れた過去日はDBに残り続け、履歴が蓄積される。

使い方:
  python3 run.py            # シート現在値を取り込み
  python3 run.py --dry-run  # 投入せず件数・サンプルのみ
"""
import sys
import csv
import io
import json
from datetime import datetime, timezone

import yaml
import requests

from pathlib import Path

HERE = Path(__file__).parent
CFG = yaml.safe_load(open(HERE / "config.yml"))
SHEET = CFG["sheet"]
SB = CFG["supabase"]


def fetch_rows():
    """シートCSVを取得し A-D を正規化した行dictのリストにする。"""
    r = requests.get(SHEET["csv_url"], timeout=60)
    r.raise_for_status()
    reader = csv.reader(io.StringIO(r.content.decode("utf-8")))
    rows = list(reader)
    out = []
    for raw in rows[1:]:                       # 1行目はヘッダ
        if len(raw) < 4:
            continue
        ad_url = (raw[0] or "").strip()
        ad_date = (raw[1] or "").strip().replace("/", "-")   # 2026/05/15 -> 2026-05-15
        if not ad_url or len(ad_date) != 10:
            continue
        def num(v):
            v = (v or "").strip().replace(",", "")
            try:
                return int(float(v))
            except ValueError:
                return 0
        out.append({
            "ad_url": ad_url,
            "ad_date": ad_date,
            "access_count": num(raw[2]),
            "cv_count": num(raw[3]),
        })
    return out


def _headers():
    key = SB["service_role_key"]
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def upsert(rows):
    """シートに含まれる ad_date を DELETE してから INSERT（冪等・蓄積）。"""
    base = SB["url"].rstrip("/")
    table = SB["table"]
    dates = sorted({r["ad_date"] for r in rows})
    synced = datetime.now(timezone.utc).isoformat()

    # 当該日付の既存行を削除
    inlist = ",".join(f'"{d}"' for d in dates)
    rd = requests.delete(f"{base}/rest/v1/{table}?ad_date=in.({inlist})",
                         headers={**_headers(), "Prefer": "return=minimal"}, timeout=120)
    if rd.status_code not in (200, 204):
        raise RuntimeError(f"DELETE失敗: {rd.status_code} {rd.text[:200]}")

    # 挿入（synced_at付与・チャンク）
    payload = [{**r, "synced_at": synced} for r in rows]
    n = 0
    for i in range(0, len(payload), 1000):
        chunk = payload[i:i + 1000]
        ri = requests.post(f"{base}/rest/v1/{table}",
                           headers={**_headers(), "Prefer": "return=minimal"},
                           data=json.dumps(chunk), timeout=120)
        if ri.status_code not in (200, 201, 204):
            raise RuntimeError(f"INSERT失敗: {ri.status_code} {ri.text[:300]}")
        n += len(chunk)
    return n, len(dates)


def main():
    dry = "--dry-run" in sys.argv
    rows = fetch_rows()
    print(f"シート取得: {len(rows)} 行 / 日付 {len({r['ad_date'] for r in rows})} 種 / "
          f"ad_url {len({r['ad_url'] for r in rows})} 種", flush=True)
    if dry:
        for r in rows[:5]:
            print("  ", r, flush=True)
        print("※ --dry-run のため投入していません。", flush=True)
        return
    n, nd = upsert(rows)
    print(f"投入完了: {n} 行（{nd} 日付分を更新／それ以外の過去日は保持）", flush=True)


if __name__ == "__main__":
    main()
