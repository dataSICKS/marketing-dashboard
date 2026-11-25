#!/usr/bin/env python3
"""友だちを全件1パスで取り、追加日・ブロック状態・指定タグの付与日時を保存する。

GET /friends は include_tags[] に最大100個のタグIDを渡せて、応答の tags に
attached_at（付与日時）が入る。これがあると「いつその工程に到達したか」が分かり、
期間を合わせた工程別の分母が作れる。

氏名・uid・memo は保存しない（分析に使わない個人情報なので持ち回らない）。
"""
import json, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
import yaml

BASE = "https://api.lineml.jp/v2/api"
HERE = Path(__file__).parent
OUT = HERE / "out"
INTERVAL = 0.17

token = yaml.safe_load((HERE / "config.yml").read_text())["liny"]["token"].strip()


def get(path, params):
    url = f"{BASE}{path}?" + urllib.parse.urlencode(params, doseq=True)
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}", "Accept": "application/json"})
    for attempt in range(4):
        time.sleep(INTERVAL)
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            raise SystemExit(f"HTTP {error.code} {path}\n  {error.read().decode(errors='replace')[:300]}")


tags = json.load(open(OUT / "tags.json"))
folders = json.load(open(OUT / "tag_folders.json"))
# 分析に使うフォルダだけ。include_tags は最大100個。
WANT = {"ステップ配信", "SICKS施策", "新QR", "旧QR", "ブランドサイト", "リッチメニュー", "属性判定", "イベント"}
held = json.load(open(OUT / "tag_friends.json"))
# 保有者0人のタグを渡しても応答に出てこないので除く（include_tags の上限100個を節約する）
picked = [t for t in tags
          if folders.get(str(t.get("folder_id"))) in WANT
          and held.get(str(t["id"]), {}).get("friends")]
if len(picked) > 100:
    sys.exit(f"include_tags の上限100個を超えます（{len(picked)}個）。フォルダを絞ってください。")
print(f"タグ {len(picked)}個を付けて友だちを全件取得します", flush=True)

rows, cursor, pages = [], None, 0
while True:
    page = get("/friends", {"limit": 1000, "include_tags[]": [t["id"] for t in picked],
                            **({"cursor": cursor} if cursor else {})})
    for f in page.get("data") or []:
        rows.append({
            "id": f["id"],
            "created_at": f.get("created_at"),
            "is_blocked": bool(f.get("is_blocked")),
            "display_status": f.get("display_status"),
            # [タグID, 付与日時] だけ持つ。タグ名は tags.json 側にある。
            "tags": [[t["id"], t.get("attached_at")] for t in (f.get("tags") or [])],
        })
    cursor = page.get("next_cursor")
    pages += 1
    print(f"  {pages:>3}ページ目 累計 {len(rows):,}人", flush=True)
    if not cursor:
        break

(OUT / "friends.json").write_text(json.dumps(rows, ensure_ascii=False))
print(f"\n友だち {len(rows):,}人 を保存: {OUT / 'friends.json'}")
