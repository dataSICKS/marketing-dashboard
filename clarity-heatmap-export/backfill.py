"""指定期間の Clarity スクロールヒートマップを一括バックフィル。

- Supabase Storage にファイルが既に存在する日付×デバイスはスキップ
- export.py の main() を日付ごとに呼び出す

使い方:
  python3 backfill.py                          # 2026-07-01 〜 昨日
  python3 backfill.py 2026-07-01 2026-07-10   # 期間指定
  python3 backfill.py --dry-run               # 実際には取得せず対象日を表示のみ
"""
import sys
import time
from pathlib import Path
from datetime import date, timedelta

import yaml
import requests

HERE = Path(__file__).parent
CFG = yaml.safe_load(open(HERE / "config.yml"))
CL = CFG["clarity"]
SB = CFG["supabase"]

DEFAULT_START = date(2026, 7, 1)


def list_storage_files(date_str: str) -> set[str]:
    """Supabase Storage の指定日付フォルダにあるファイル名セットを返す。"""
    base = SB["url"].rstrip("/")
    bucket = SB["storage_bucket"]
    key = SB["service_role_key"]
    r = requests.post(
        f"{base}/storage/v1/object/list/{bucket}",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"},
        json={"prefix": f"{date_str}/", "limit": 1000},
        timeout=30,
    )
    if r.status_code not in (200, 201):
        print(f"  [Storage一覧取得失敗] {date_str}: {r.status_code}", flush=True)
        return set()
    items = r.json()
    return {item["name"] for item in items if isinstance(item, dict) and "name" in item}


def is_complete(date_str: str) -> bool:
    """全adCode×device の CSV が揃っていれば True（スキップ判定）。"""
    existing = list_storage_files(date_str)
    for adcode in CL["pages"]:
        for device in CL["devices"]:
            fname = f"{adcode}_{device}_scroll_{date_str}.csv"
            if fname not in existing:
                return False
    return True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dry_run = "--dry-run" in sys.argv

    today = date.today()
    yesterday = today - timedelta(days=1)

    start = date.fromisoformat(args[0]) if len(args) >= 1 else DEFAULT_START
    end = date.fromisoformat(args[1]) if len(args) >= 2 else yesterday

    if start > end:
        print(f"開始日 {start} が終了日 {end} より後です。", flush=True)
        sys.exit(1)

    print(f"バックフィル期間: {start} 〜 {end}（{'dry-run' if dry_run else '実行'}）", flush=True)
    print(f"対象adCode: {CL['pages']}", flush=True)
    print(f"対象device: {CL['devices']}", flush=True)
    print("", flush=True)

    if dry_run:
        current = start
        while current <= end:
            print(f"  {current} — 取得予定", flush=True)
            current += timedelta(days=1)
        return

    from export import main as export_main

    skipped, done, failed = [], [], []
    current = start
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        print(f"━━━ {date_str} ━━━", flush=True)

        if is_complete(date_str):
            print(f"  全ファイル取得済み → スキップ", flush=True)
            skipped.append(date_str)
        else:
            try:
                sys.argv = ["export.py", date_str]
                export_main()
                done.append(date_str)
            except Exception as e:
                print(f"  エラー: {e}", flush=True)
                failed.append(date_str)
            time.sleep(3)

        current += timedelta(days=1)

    print("", flush=True)
    print(f"完了: 取得 {len(done)} 日 / スキップ {len(skipped)} 日 / 失敗 {len(failed)} 日", flush=True)
    if failed:
        print(f"失敗日: {failed}", flush=True)


if __name__ == "__main__":
    main()
