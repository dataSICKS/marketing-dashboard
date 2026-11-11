"""Amazon Seller Central に手動ログインし、永続プロファイルにセッション保存（合図ファイル方式）。

OTP/CAPTCHA/2FA はこのウィンドウで人手で通す。ログイン完了後 `.login_done` を
作成したタイミングで storage_state.json を保存しグレースフルに終了する。最大20分。

使い方:
  python3 save_session.py
  → 開いたブラウザでSeller Centralにログイン（OTPも）→ 出品管理トップが見える状態に
  → 別途このディレクトリに `.login_done` が作られると保存（呼び出し側が作成）
"""
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
PROFILE = HERE / "chrome_profile"
STATE = HERE / "storage_state.json"
SIGNAL = HERE / ".login_done"
START = "https://sellercentral.amazon.co.jp/"
TIMEOUT_SEC = 1200


AUTH_COOKIES = {"at-main", "sess-at-main", "x-main"}


def main():
    if SIGNAL.exists():
        SIGNAL.unlink()
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=False, accept_downloads=True,
            locale="ja-JP")
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(START)
        print("Seller Centralにログイン（OTPも）してください。完了の合図(.login_done)待ち...",
              flush=True)

        # 合図ファイル(.login_done)が作られるまで待つ（URL自動検知は誤発火するため使わない）
        deadline = time.time() + TIMEOUT_SEC
        saved = False
        while time.time() < deadline:
            if SIGNAL.exists():
                time.sleep(2)
                state = ctx.storage_state(path=str(STATE))
                names = {c["name"] for c in state.get("cookies", [])}
                has_auth = bool(AUTH_COOKIES & names)
                print(f"保存しました（profile + {STATE.name}）。"
                      f"認証Cookie: {'あり✓' if has_auth else 'なし⚠（ログイン未完了の可能性）'}",
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
