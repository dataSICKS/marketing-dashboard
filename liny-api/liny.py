"""LINY APIとSupabaseの共通クライアント。"""
import json, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
import yaml

BASE = "https://api.lineml.jp/v2/api"
HERE = Path(__file__).parent
OUT = HERE / "out"
INTERVAL = 0.17  # 10req/秒の上限に対して約6req/秒
# include_tags[] は最大100個。これを超えるときは複数パスに分ける。
TAGS_PER_PASS = 100


def config():
    return yaml.safe_load((HERE / "config.yml").read_text())["liny"]


def token():
    value = (config().get("token") or "").strip()
    if not value or value.startswith("ここに"):
        raise SystemExit(f"{HERE / 'config.yml'} の token が空です。管理画面→API連携→認証タブ で発行してください。")
    return value


def get(path, params=None, bearer=None):
    url = f"{BASE}{path}" + ("?" + urllib.parse.urlencode(params or {}, doseq=True) if params else "")
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {bearer or token()}", "Accept": "application/json"})
    for attempt in range(4):
        time.sleep(INTERVAL)
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            # 429はレート制限。待って繰り返す。それ以外は本文を見せて止める。
            if error.code == 429 and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            raise SystemExit(f"HTTP {error.code} {path}\n  {error.read().decode(errors='replace')[:300]}")


def paginate(path, params=None, bearer=None, cap=500):
    """cursor方式。limit を渡せるのはページングを持つエンドポイントだけ（/tag-folders は422）。"""
    rows, cursor, pages = [], None, 0
    while pages < cap:
        page = get(path, {**(params or {}), **({"cursor": cursor} if cursor else {})}, bearer)
        rows += page.get("data") or []
        cursor = page.get("next_cursor")
        pages += 1
        if not cursor:
            return rows
    raise SystemExit(f"{path} のページングが {cap} ページを超えました。cap を見直してください。")


# ---- Supabase（間借り。liny_ 接頭辞のテーブルだけを触る） ----

def supabase():
    path = HERE.parent / "ecf-ad-to-supabase" / "config.yml"
    section = yaml.safe_load(path.read_text())["supabase"]
    return section["url"].rstrip("/"), section["service_role_key"]


def _request(method, path, body=None, extra_headers=None):
    url, key = supabase()
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
               **(extra_headers or {})}
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    request = urllib.request.Request(f"{url}/rest/v1/{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Supabase {method} {path} → HTTP {error.code}\n  {error.read().decode(errors='replace')[:500]}")


def upsert(table, rows, on_conflict, chunk=1000):
    for index in range(0, len(rows), chunk):
        _request("POST", f"{table}?on_conflict={on_conflict}", rows[index:index + chunk],
                 {"Prefer": "resolution=merge-duplicates,return=minimal"})


def delete_all(table, where):
    _request("DELETE", f"{table}?{where}", None, {"Prefer": "return=minimal"})


def insert(table, rows, chunk=1000):
    for index in range(0, len(rows), chunk):
        _request("POST", table, rows[index:index + chunk], {"Prefer": "return=minimal"})
