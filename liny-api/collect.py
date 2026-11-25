#!/usr/bin/env python3
"""全タグの保有者を友だちID単位で取得して out/tag_friends.json に保存する。

工程別CVRを出すのに必要なのは「タグAを持つ人の集合」と「購入完了タグを持つ人の集合」の
交差なので、人数だけでなく友だちIDを取る。レスポンスは id / uid / is_blocked /
display_status を返す。uid は個人の識別子なので保存しない（IDとブロック状態だけ使う）。
"""
import json, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
import yaml

BASE = "https://api.lineml.jp/v2/api"
HERE = Path(__file__).parent
OUT = HERE / "out"
INTERVAL = 0.17  # 10req/秒の上限に対して6req/秒

token = yaml.safe_load((HERE / "config.yml").read_text())["liny"]["token"].strip()


def get(path, params=None):
    url = f"{BASE}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}", "Accept": "application/json"})
    for attempt in range(4):
        time.sleep(INTERVAL)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            # 429はレート制限。待って1度だけ諦めずに繰り返す。
            if error.code == 429 and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            raise SystemExit(f"HTTP {error.code} {path}\n  {error.read().decode(errors='replace')[:300]}")


def paginate(path, params=None, cap=200):
    """cursor方式。limitは仕様書どおり1〜10000（/tags/{id}/friends）。"""
    rows, cursor, pages = [], None, 0
    while pages < cap:
        page = get(path, {**(params or {}), **({"cursor": cursor} if cursor else {})})
        rows += page.get("data") or []
        cursor = page.get("next_cursor")
        pages += 1
        if not cursor:
            break
    return rows


OUT.mkdir(exist_ok=True)
folders = {f["id"]: f["name"] for f in get("/tag-folders")["data"]}
tags = paginate("/tags", {"limit": 1000})
(OUT / "tag_folders.json").write_text(json.dumps(folders, ensure_ascii=False))
(OUT / "tags.json").write_text(json.dumps(tags, ensure_ascii=False))
print(f"タグ {len(tags)}件 の保有者を取得します", flush=True)

result = {}
for index, tag in enumerate(tags, 1):
    friends = paginate(f"/tags/{tag['id']}/friends", {"limit": 10000})
    result[str(tag["id"])] = {
        "name": tag["name"],
        "folder": folders.get(tag.get("folder_id"), "(フォルダなし)"),
        # uid は保存しない。is_blocked はブロック率に使う。
        "friends": [[f["id"], 1 if f.get("is_blocked") else 0, f.get("display_status")] for f in friends],
    }
    print(f"  [{index:>3}/{len(tags)}] {len(friends):>6}人  {tag['name']}", flush=True)

(OUT / "tag_friends.json").write_text(json.dumps(result, ensure_ascii=False))
print(f"\n保存: {OUT / 'tag_friends.json'}")
