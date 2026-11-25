#!/usr/bin/env python3
"""LINY API → Supabase（liny_tag / liny_friend / liny_friend_tag）。日次で回す。

    /usr/bin/python3 sync.py            # 取得してSupabaseへ
    /usr/bin/python3 sync.py --dry-run  # 取得してout/に保存するだけ

タグは**全件**対象にする。include_tags[] の上限100個を超えるぶんは複数パスに分けて
友だちを取り直す（診断タグが増えても設計を変えずに済むようにするため）。
"""
import argparse, datetime as dt, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import liny


def fetch():
    bearer = liny.token()
    folders = {f["id"]: f["name"] for f in liny.get("/tag-folders", bearer=bearer)["data"]}
    tags = liny.paginate("/tags", {"limit": 1000}, bearer)
    print(f"タグ {len(tags)}件 / フォルダ {len(folders)}件", flush=True)

    ids = [t["id"] for t in tags]
    passes = [ids[i:i + liny.TAGS_PER_PASS] for i in range(0, len(ids), liny.TAGS_PER_PASS)] or [[]]
    print(f"友だちを {len(passes)}パスで取得します（include_tags は1回に{liny.TAGS_PER_PASS}個まで）", flush=True)

    merged = {}
    for number, chunk in enumerate(passes, 1):
        cursor, pages = None, 0
        while True:
            params = {"limit": 1000, **({"include_tags[]": chunk} if chunk else {}),
                      **({"cursor": cursor} if cursor else {})}
            page = liny.get("/friends", params, bearer)
            for friend in page.get("data") or []:
                record = merged.setdefault(friend["id"], {
                    "friend_id": friend["id"],
                    "created_at": friend.get("created_at"),
                    "is_blocked": bool(friend.get("is_blocked")),
                    "display_status": friend.get("display_status"),
                    "tags": {},
                })
                # 後のパスの方が新しいので、ブロック状態は上書きする
                record["is_blocked"] = bool(friend.get("is_blocked"))
                record["display_status"] = friend.get("display_status")
                for tag in friend.get("tags") or []:
                    record["tags"][tag["id"]] = tag.get("attached_at")
            cursor = page.get("next_cursor")
            pages += 1
            if not cursor:
                break
        print(f"  パス{number}/{len(passes)} 完了（{pages}ページ・累計 {len(merged):,}人）", flush=True)

    return folders, tags, list(merged.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Supabaseへ入れずout/に保存するだけ")
    args = parser.parse_args()

    folders, tags, friends = fetch()
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat()

    tag_rows = [{"tag_id": t["id"], "name": t["name"],
                 "folder": folders.get(t.get("folder_id")), "synced_at": synced_at} for t in tags]
    friend_rows, link_rows = [], []
    for f in friends:
        if not f["created_at"]:
            continue  # 追加日時が無い行は Day の起点が決まらないので捨てる
        friend_rows.append({k: f[k] for k in ("friend_id", "created_at", "is_blocked", "display_status")}
                           | {"synced_at": synced_at})
        for tag_id, attached_at in f["tags"].items():
            link_rows.append({"friend_id": f["friend_id"], "tag_id": tag_id, "attached_at": attached_at})

    liny.OUT.mkdir(exist_ok=True)
    (liny.OUT / "tags.json").write_text(json.dumps(tags, ensure_ascii=False))
    (liny.OUT / "tag_folders.json").write_text(json.dumps({str(k): v for k, v in folders.items()}, ensure_ascii=False))
    (liny.OUT / "friends.json").write_text(json.dumps(
        [{k: v for k, v in f.items() if k != "tags"} | {"tags": [[i, a] for i, a in f["tags"].items()]}
         for f in friends], ensure_ascii=False))

    dropped = len(friends) - len(friend_rows)
    print(f"\nタグ {len(tag_rows):,} / 友だち {len(friend_rows):,}"
          f"{f'（追加日時なしを{dropped}件除外）' if dropped else ''} / 紐づけ {len(link_rows):,}")

    if args.dry_run:
        print("--dry-run なのでSupabaseへは入れていません。")
        return

    liny.upsert("liny_tag", tag_rows, "tag_id")
    liny.upsert("liny_friend", friend_rows, "friend_id")
    # タグは外されることがある。残骸を残さないため全消し→全入れ（line_url_cv と同じ作法）
    liny.delete_all("liny_friend_tag", "friend_id=gte.0")
    liny.insert("liny_friend_tag", link_rows)
    print("Supabaseへ投入しました。")


if __name__ == "__main__":
    main()
