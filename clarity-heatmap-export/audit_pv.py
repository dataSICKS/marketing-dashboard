"""保存済み Clarity スクロールCSVの部分取得ミス(PV過少)を監査・自動修復。

各 date×adCode×device について:
  1. Storage の保存済みCSVから PV を読む（present のみ対象）
  2. Clarity から再取得して PV を読む
  3. 再取得PV > 保存PV（＝保存側が部分取得ミス）の場合のみ、再取得CSV/PNGで差し替え

対象adCodeは管理画面設定(app-settings/config.json)の clarityTargetUrls。

使い方:
  python3 audit_pv.py 2026-07-22 2026-07-26
  python3 audit_pv.py 2026-07-22 2026-07-26 --dry-run   # 差し替えせず比較のみ
"""
from __future__ import annotations

import re
import sys
from datetime import date, timedelta

import requests
from playwright.sync_api import sync_playwright

from export import CL, SB, HERE, download_one, upload_to_supabase
from backfill_admin import admin_target_urls, _headers, FNAME_RE

DEVICES = CL.get("devices", ["Desktop", "Mobile"])
PV_RE = re.compile(r'ビュー"?,"?(\d+)')


def parse_pv(b: bytes) -> int | None:
    for enc in ("utf-8-sig", "utf-16", "cp932", "utf-8"):
        try:
            m = PV_RE.search(b.decode(enc))
            if m:
                return int(m.group(1))
        except Exception:
            pass
    return None


def stored_present(date_str: str) -> dict:
    """{(adcode,device): (filename, pv)} を返す（保存済みのみ）。"""
    base = SB["url"].rstrip("/")
    bucket = SB["storage_bucket"]
    r = requests.post(f"{base}/storage/v1/object/list/{bucket}",
                      headers={**_headers(), "Content-Type": "application/json"},
                      json={"prefix": f"{date_str}/", "limit": 1000}, timeout=30)
    r.raise_for_status()
    out = {}
    for it in r.json():
        m = FNAME_RE.match(it.get("name", "") if isinstance(it, dict) else "")
        if m:
            out[(m.group(1), m.group(2))] = it["name"]
    result = {}
    for (adc, dev), fn in out.items():
        cr = requests.get(f"{base}/storage/v1/object/{bucket}/{date_str}/{fn}",
                          headers=_headers(), timeout=30)
        result[(adc, dev)] = (fn, parse_pv(cr.content))
    return result


def fresh_pv(page, adcode, device, date_str):
    """再取得して (pv, saved_files) を返す。データ無しなら (None, [])。"""
    files = download_one(page, adcode, device, date_str)
    for fp in files:
        if fp.suffix == ".csv":
            return parse_pv(fp.read_bytes()), files
    return None, files


def main():
    dry_run = "--dry-run" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    start, end = date.fromisoformat(args[0]), date.fromisoformat(args[1])
    urls = set(admin_target_urls())
    print(f"監査対象URL: {sorted(urls)}\n期間 {start}〜{end}（{'dry-run' if dry_run else '実行'}）\n", flush=True)

    fixed, ok, nodata = [], [], []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(HERE / "chrome_profile"), headless=True, accept_downloads=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        d = start
        while d <= end:
            ds = d.strftime("%Y-%m-%d")
            present = stored_present(ds)
            targets = [(a, dev) for (a, dev) in present if a in urls]
            print(f"━━━ {ds} （保存済み {len(targets)} 組を検査）━━━", flush=True)
            for adc, dev in sorted(targets):
                fn, spv = present[(adc, dev)]
                fpv, files = fresh_pv(page, adc, dev, ds)
                short = adc.replace("kisekino_haburashi_fb_inst_", "")
                if fpv is None:
                    print(f"    {short}/{dev}: 保存PV={spv} 再取得=データ無し → 保存維持", flush=True)
                    ok.append((ds, short, dev, spv, None))
                    continue
                if spv is None or fpv > spv:
                    tag = "差し替え" if not dry_run else "要差し替え(dry)"
                    print(f"    ⚠ {short}/{dev}: 保存PV={spv} < 再取得PV={fpv} → {tag}", flush=True)
                    if not dry_run:
                        for fp in files:
                            upload_to_supabase(fp, ds)
                    fixed.append((ds, short, dev, spv, fpv))
                else:
                    print(f"    {short}/{dev}: 保存PV={spv} 再取得PV={fpv} → OK", flush=True)
                    ok.append((ds, short, dev, spv, fpv))
            d += timedelta(days=1)
        ctx.close()

    print(f"\n===== 監査結果 =====", flush=True)
    print(f"差し替え {len(fixed)} 件 / 問題なし {len(ok)} 件", flush=True)
    for ds, s, dev, spv, fpv in fixed:
        print(f"  FIXED {ds} {s}/{dev}: {spv} → {fpv}", flush=True)


if __name__ == "__main__":
    main()
