"""Clarity スクロールヒートマップを CSV/PNG でダウンロードし Supabase Storage へ保存。

- 永続プロファイル(chrome_profile/)のセッションを再利用（再ログイン不要）
- 対象: config.yml の pages（広告コード）× devices（Desktop/Mobile）
- 各ヒートマップ画面URLを直接組み立てて遷移 → スクロール選択 → デバイス選択
  → 「CSV をダウンロード」「PNG をダウンロード」を取得
- ローカル downloads/ に保存し、Supabase Storage バケットへアップロード

URL フィルター（config.yml）:
  pages に指定した広告コードを「を含む」で絞り込む（matchtype=2）
  exclude_keywords に指定したキーワードを「を含まない」で除外する（matchtype=3）
  ※ matchtype=3 が Clarity で「を含まない」に対応しない場合は、
    Clarity 管理画面で「を含まない」フィルター適用後のURLのmatchtype値に合わせて修正する

使い方:
  python3 export.py            # 前日分（JST, date=Yesterday）
  python3 export.py 2026-06-23 # 指定日（Custom）※未指定時はYesterday
"""
import sys
import time
from pathlib import Path
from urllib.parse import quote
from datetime import datetime, timedelta, timezone

import yaml
import requests
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError

HERE = Path(__file__).parent
CFG = yaml.safe_load(open(HERE / "config.yml"))
CL = CFG["clarity"]
SB = CFG["supabase"]
DL = HERE / "downloads"
DL.mkdir(exist_ok=True)
JST = timezone(timedelta(hours=9))

PROJECT_ID = "srj36555ho"           # 歯科衛生士LP
DEVICE_BTN = {"Desktop": "#button_deviceType_Desktop",
              "Mobile": "#button_deviceType_Mobile",
              "Tablet": "#button_deviceType_Tablet"}


def vis(page, sel):
    for e in page.query_selector_all(sel):
        try:
            if e.is_visible():
                return e
        except Exception:
            pass
    return None


def settle(page, t=20000):
    page.wait_for_load_state("domcontentloaded", timeout=t)
    try:
        page.wait_for_load_state("networkidle", timeout=t)
    except PWTimeoutError:
        pass


def heatmap_url(adcode, date_param):
    # field=2: 閲覧済みURL, matchtype=2: を含む, matchtype=3: を含まない
    filters = [f"2;2;{adcode}"]
    for kw in CL.get("exclude_keywords", []):
        filters.append(f"2;3;{kw}")
    url_params = "&".join(f"URL={quote(f, safe='')}" for f in filters)
    return (f"https://clarity.microsoft.com/projects/view/{PROJECT_ID}/heatmaps"
            f"?date={quote(date_param)}&heatmapType=0&{url_params}")


def download_one(page, adcode, device, date_str):
    """1ページ×1デバイスのスクロールヒートマップ CSV/PNG を取得。保存パスのリストを返す。"""
    saved = []
    page.goto(heatmap_url(adcode, "Yesterday" if date_str is None else date_str),
              wait_until="networkidle")
    page.wait_for_timeout(8000)

    sc = vis(page, "#button_heatmapType_Scroll")
    if sc:
        sc.click(); page.wait_for_timeout(4000)
    dev = vis(page, DEVICE_BTN[device])
    if dev:
        dev.click(); page.wait_for_timeout(5000)

    # スクロールデータ無しページは即スキップ（空CSV/PNGタイムアウトを回避）
    try:
        body = page.inner_text("body")
    except Exception:
        body = ""
    if "スクロール情報が見つかりませんでした" in body:
        print(f"    [{adcode}/{device}] スクロールデータ無し→skip", flush=True)
        return saved

    if not vis(page, "[aria-label=ダウンロード]"):
        print(f"    [{adcode}/{device}] ダウンロードボタンなし（データ無し?）", flush=True)
        return saved

    for kind, label in [("csv", "CSV をダウンロード"), ("png", "PNG をダウンロード")]:
        # ダウンロードボタンを押してメニュー項目（CSV=menuitem / PNG=role=button）を出す。
        # ダウンロード後はメニュー再オープンが不安定なので、ボタン再クリックをリトライ。
        item = None
        for _ in range(6):
            db = vis(page, "[aria-label=ダウンロード]")
            if db:
                db.click()
            page.wait_for_timeout(1200)
            for it in page.query_selector_all('[role=menuitem], [role=button]'):
                try:
                    if it.is_visible() and label in (it.inner_text() or ""):
                        item = it; break
                except Exception:
                    pass
            if item:
                break
        if not item:
            print(f"    [{adcode}/{device}] メニュー項目なし: {label}", flush=True)
            page.keyboard.press("Escape")
            continue
        try:
            with page.expect_download(timeout=60000) as di:
                item.click()
            d = di.value
            fn = f"{adcode}_{device}_scroll_{date_str or 'yesterday'}.{kind}"
            fp = DL / fn
            d.save_as(str(fp))
            saved.append(fp)
            print(f"    取得: {fn}", flush=True)
            page.wait_for_timeout(2000)
        except PWTimeoutError:
            print(f"    [{adcode}/{device}] {kind} ダウンロードタイムアウト", flush=True)
    return saved


def upload_to_supabase(path, date_str):
    """Supabase Storage バケットへアップロード（{date}/{filename}）。"""
    base = SB["url"].rstrip("/")
    bucket = SB["storage_bucket"]
    key = SB["service_role_key"]
    obj = f"{date_str}/{path.name}"
    ct = "text/csv" if path.suffix == ".csv" else "image/png"
    r = requests.post(
        f"{base}/storage/v1/object/{bucket}/{obj}",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": ct, "x-upsert": "true"},
        data=path.read_bytes(), timeout=120)
    if r.status_code not in (200, 201):
        print(f"    アップロード失敗 {obj}: {r.status_code} {r.text[:150]}", flush=True)
        return False
    return True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    date_str = args[0] if args else None
    label_date = date_str or (datetime.now(JST) - timedelta(days=1)).strftime("%Y-%m-%d")
    print(f"対象日: {label_date}（{'指定' if date_str else '前日/Yesterday'}）", flush=True)

    n_files, n_up = 0, 0
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(HERE / "chrome_profile"), headless=True,
            accept_downloads=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        for adcode in CL["pages"]:
            for device in CL["devices"]:
                try:
                    files = download_one(page, adcode, device, date_str)
                except Exception as e:
                    print(f"    [{adcode}/{device}] エラー: {e}", flush=True)
                    files = []
                for fp in files:
                    n_files += 1
                    if upload_to_supabase(fp, label_date):
                        n_up += 1
        ctx.close()
    print(f"\n完了: 取得 {n_files} ファイル / アップロード {n_up} ファイル", flush=True)


if __name__ == "__main__":
    main()
