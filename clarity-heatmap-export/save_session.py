"""Clarityに手動ログインし、永続プロファイルにセッションを保存する（合図ファイル方式）。

ブラウザは開いたまま待機する。ユーザーがログイン→プロジェクトを開いたら、
別途 `.login_done` ファイルが作られたタイミングで storage_state.json を保存して
グレースフルに終了する（自動URL検知も併用）。最大20分。
"""
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
PROFILE = HERE / "chrome_profile"
STATE = HERE / "storage_state.json"
SIGNAL = HERE / ".login_done"
START = "https://clarity.microsoft.com/projects"
TIMEOUT_SEC = 1200


def logged_in_url(url):
    u = (url or "").lower()
    return "clarity.microsoft.com" in u and (
        "/projects/view" in u or "/project/" in u or "/dashboard" in u
        or "/heatmaps" in u or "/recordings" in u)


def main():
    if SIGNAL.exists():
        SIGNAL.unlink()
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=False, accept_downloads=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(START)
        print("ログイン→プロジェクトを開いてください。完了の合図(.login_done)待ち...", flush=True)

        deadline = time.time() + TIMEOUT_SEC
        saved = False
        while time.time() < deadline:
            urls = []
            for pg in list(ctx.pages):
                try:
                    urls.append(pg.url)
                except Exception:
                    pass
            if SIGNAL.exists() or any(logged_in_url(u) for u in urls):
                time.sleep(2)
                ctx.storage_state(path=str(STATE))
                print(f"保存しました（profile + {STATE.name}）。URL: {' | '.join(urls)}",
                      flush=True)
                saved = True
                break
            time.sleep(2)

        ctx.close()
        if SIGNAL.exists():
            SIGNAL.unlink()
        if not saved:
            print("タイムアウト：保存できませんでした。", flush=True)
            sys.exit(1)


if __name__ == "__main__":
    main()
