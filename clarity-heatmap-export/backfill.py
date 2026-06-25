"""ClarityスクロールヒートマップCSVの過去バックフィル（1年分・1日ずつ）。

- 前日(JST)から指定日数ぶん遡って、各日 × 各ページ × 各デバイスのCSVを取得しSupabase Storageへ。
- **resumable**: 既にStorageに上がっている {date}/{file} はスキップ。途中で止めても再実行で続きから。
- date=Custom&start&end（エポックms）でURL直生成するためカレンダー操作は不要。

使い方:
  python3 backfill.py            # 前日から365日ぶん遡る
  python3 backfill.py 90         # 前日から90日ぶん
  python3 backfill.py 365 30     # 365日ぶんのうち、まず最近30日を優先（=30日前まで）
"""
import sys
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone

import yaml
import requests
from playwright.sync_api import sync_playwright

import export  # heatmap_url / download_one / upload_to_supabase / vis を再利用

HERE = Path(__file__).parent
CFG = yaml.safe_load(open(HERE / "config.yml"))
CL = CFG["clarity"]
SB = CFG["supabase"]
JST = timezone(timedelta(hours=9))


def existing_objects(date_str):
    """その日付フォルダに既にあるファイル名の集合（resume用）。"""
    base = SB["url"].rstrip("/"); key = SB["service_role_key"]; bkt = SB["storage_bucket"]
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        r = requests.post(f"{base}/storage/v1/object/list/{bkt}",
                          headers=h, data=json.dumps({"prefix": date_str, "limit": 1000}), timeout=30)
        return {o["name"] for o in r.json()}
    except Exception:
        return set()


def main():
    days_back = int(sys.argv[1]) if len(sys.argv) > 1 else 365
    yesterday = (datetime.now(JST) - timedelta(days=1)).date()

    total_dl, total_skip_exist, total_nodata = 0, 0, 0
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(HERE / "chrome_profile"), headless=True, accept_downloads=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        for i in range(days_back):
            day = yesterday - timedelta(days=i)
            ds = day.isoformat()
            have = existing_objects(ds)
            day_dl = 0
            for adcode in CL["pages"]:
                for device in CL["devices"]:
                    fn = f"{adcode}_{device}_scroll_{ds}.csv"
                    if f"{ds}/{fn}" in have:
                        total_skip_exist += 1
                        continue
                    try:
                        files = export.download_one(page, adcode, device, ds)
                    except Exception as e:
                        print(f"  [{ds} {adcode}/{device}] err: {str(e)[:80]}", flush=True)
                        files = []
                    if not files:
                        total_nodata += 1
                        continue
                    for fp in files:
                        if export.upload_to_supabase(fp, ds):
                            total_dl += 1; day_dl += 1
            print(f"{ds}: 取得{day_dl}件 (累計DL{total_dl}/既存skip{total_skip_exist}/データ無し{total_nodata})", flush=True)
        ctx.close()
    print(f"\n=== backfill完了: DL {total_dl} / 既存skip {total_skip_exist} / データ無し {total_nodata} ===", flush=True)


if __name__ == "__main__":
    main()
