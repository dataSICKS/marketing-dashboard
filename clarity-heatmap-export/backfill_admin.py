"""管理画面(app-settings/config.json)の clarityTargetUrls を対象に、
指定期間の欠損分（Storageに未保存の adCode×device）だけを取得・保存するバックフィル。

- 対象URLは config.yml の pages ではなく **管理画面の設定**(Supabase Storage
  バケット app-settings / config.json の clarityTargetUrls)を正とする。
- Storage の各日付フォルダを走査し、{adCode}_{device}_scroll_*.csv が
  既に存在する組み合わせはスキップ（ファイル名サフィックスは無視して prefix 判定）。
- 欠損分のみ export.download_one で取得し Supabase Storage へアップロード。
- スクロールデータ自体が無い(低トラフィック)組み合わせは export 側で skip される。

使い方:
  python3 backfill_admin.py 2026-07-22 2026-07-26   # 期間指定
  python3 backfill_admin.py --dry-run 2026-07-22 2026-07-26
"""
import re
import sys
import time
from datetime import date, timedelta

import requests
from playwright.sync_api import sync_playwright

from export import CL, SB, download_one, upload_to_supabase

SETTINGS_BUCKET = "app-settings"
SETTINGS_FILE = "config.json"
DEVICES = CL.get("devices", ["Desktop", "Mobile"])
FNAME_RE = re.compile(r"^(.+?)_(Desktop|Mobile)_scroll_.*\.csv$")


def _headers():
    key = SB["service_role_key"]
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def admin_target_urls() -> list[str]:
    """管理画面の設定 clarityTargetUrls を取得。"""
    base = SB["url"].rstrip("/")
    r = requests.get(
        f"{base}/storage/v1/object/{SETTINGS_BUCKET}/{SETTINGS_FILE}",
        headers=_headers(), timeout=30)
    r.raise_for_status()
    return list(r.json().get("clarityTargetUrls", []))


def existing_combos(date_str: str) -> set[tuple[str, str]]:
    """指定日フォルダに存在する (adCode, device) の集合を返す（サフィックス無視）。"""
    base = SB["url"].rstrip("/")
    bucket = SB["storage_bucket"]
    r = requests.post(
        f"{base}/storage/v1/object/list/{bucket}",
        headers={**_headers(), "Content-Type": "application/json"},
        json={"prefix": f"{date_str}/", "limit": 1000}, timeout=30)
    r.raise_for_status()
    combos = set()
    for item in r.json():
        name = item.get("name", "") if isinstance(item, dict) else ""
        m = FNAME_RE.match(name)
        if m:
            combos.add((m.group(1), m.group(2)))
    return combos


def main():
    dry_run = "--dry-run" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if len(args) < 2:
        print("使い方: python3 backfill_admin.py [--dry-run] <開始日> <終了日>", flush=True)
        sys.exit(1)
    start = date.fromisoformat(args[0])
    end = date.fromisoformat(args[1])

    urls = admin_target_urls()
    print(f"管理画面の対象URL({len(urls)}件): {urls}", flush=True)
    print(f"対象device: {DEVICES}", flush=True)
    print(f"期間: {start} 〜 {end}（{'dry-run' if dry_run else '実行'}）\n", flush=True)

    # 欠損マップを先に算出
    plan = {}  # date_str -> [(adcode, device), ...]
    d = start
    while d <= end:
        ds = d.strftime("%Y-%m-%d")
        have = existing_combos(ds)
        missing = [(a, dev) for a in urls for dev in DEVICES if (a, dev) not in have]
        plan[ds] = missing
        print(f"━━━ {ds} ━━━ 欠損 {len(missing)}/{len(urls)*len(DEVICES)}", flush=True)
        for a, dev in missing:
            print(f"    欠損: {a} / {dev}", flush=True)
        d += timedelta(days=1)

    total_missing = sum(len(v) for v in plan.values())
    print(f"\n欠損合計: {total_missing} 組み合わせ", flush=True)
    if dry_run or total_missing == 0:
        return

    from pathlib import Path
    HERE = Path(__file__).parent
    n_files, n_up, n_nodata = 0, 0, 0
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(HERE / "chrome_profile"), headless=True,
            accept_downloads=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        for ds, missing in plan.items():
            if not missing:
                continue
            print(f"\n━━━ 取得 {ds} ━━━", flush=True)
            for adcode, device in missing:
                try:
                    files = download_one(page, adcode, device, ds)
                except Exception as e:
                    print(f"    [{adcode}/{device}] エラー: {e}", flush=True)
                    files = []
                if not files:
                    n_nodata += 1
                for fp in files:
                    n_files += 1
                    if upload_to_supabase(fp, ds):
                        n_up += 1
                time.sleep(1)
        ctx.close()
    print(f"\n完了: 取得 {n_files} ファイル / アップロード {n_up} / "
          f"データ無し・失敗 {n_nodata} 組み合わせ", flush=True)


if __name__ == "__main__":
    main()
