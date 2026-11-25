#!/usr/bin/env python3
"""LINY API に何が入っているかを調べる読み取り専用スクリプト。

目的は1つ: **ステップ配信の各通に対応するタグが付いているか**を確かめること。
付いていれば「その工程に到達した人数」を分母にできて、工程別のCVRが出せる。

書き込みは一切しない（GETのみ）。レート制限は10リクエスト/秒なので間隔を空けて叩く。

    /usr/bin/python3 liny-api/probe.py            # タグ・流入経路の一覧
    /usr/bin/python3 liny-api/probe.py --counts   # 主要タグの保有者数も数える（リクエストが増える）
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

BASE = "https://api.lineml.jp/v2/api"
CONFIG = Path(__file__).with_name("config.yml")
# 秒間10リクエストが上限。余裕を持って6リクエスト/秒に落とす。
INTERVAL = 0.17


def load_config():
    if not CONFIG.exists():
        sys.exit(f"{CONFIG} がありません")
    config = yaml.safe_load(CONFIG.read_text())["liny"]
    token = (config.get("token") or "").strip()
    if not token or token.startswith("ここに"):
        sys.exit(f"{CONFIG} の token がまだ空です。管理画面→API連携→認証タブ で発行して貼ってください。")
    return token, [str(x) for x in (config.get("form_ids") or [])]


def get(token, path, params=None):
    url = f"{BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    })
    time.sleep(INTERVAL)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        body = error.read().decode(errors="replace")[:300]
        # 401はトークン、429はレート制限。どちらか分かるように原文を出す。
        raise SystemExit(f"HTTP {error.code} {path}\n  {body}")


def paginate(token, path, params=None, limit=1000, cap=50):
    """カーソル方式のページングを辿る。cap で上限を切って暴走を防ぐ。"""
    rows, cursor, pages = [], None, 0
    while pages < cap:
        page = get(token, path, {**(params or {}), "limit": limit, **({"cursor": cursor} if cursor else {})})
        rows += page.get("data") or []
        cursor = page.get("next_cursor")
        pages += 1
        if not cursor:
            break
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--counts", action="store_true", help="主要タグの保有者数も数える")
    args = parser.parse_args()
    token, form_ids = load_config()

    print("■ タグフォルダ")
    folders = {}
    for folder in paginate(token, "/tag-folders"):
        folders[folder.get("id")] = folder.get("name")
        print(f"   {folder.get('id'):>6}  {folder.get('name')}")

    tags = paginate(token, "/tags")
    print(f"\n■ タグ {len(tags)} 件（フォルダ別）")
    by_folder = {}
    for tag in tags:
        by_folder.setdefault(tag.get("folder_id"), []).append(tag)
    for folder_id, items in by_folder.items():
        print(f"\n   [{folders.get(folder_id, '(フォルダなし)')}] {len(items)}件")
        for tag in items:
            print(f"      {tag.get('id'):>7}  {tag.get('name')}")

    if args.counts:
        # ステップ・Day・診断に関係しそうなタグだけ数える。全部やるとリクエストが膨らむ。
        keywords = ("ステップ", "Day", "day", "診断", "回答", "配信")
        targets = [t for t in tags if any(k in str(t.get("name")) for k in keywords)]
        print(f"\n■ 保有者数（キーワード該当 {len(targets)}件 / 全{len(tags)}件）")
        for tag in targets:
            friends = paginate(token, f"/tags/{tag['id']}/friends", limit=10000, cap=20)
            blocked = sum(1 for f in friends if f.get("is_blocked"))
            print(f"   {len(friends):>7}人（ブロック{blocked:>5}）  {tag.get('name')}")

    print("\n■ 流入経路")
    for touchpoint in paginate(token, "/touchpoints"):
        print(f"   {touchpoint.get('id'):>7}  {touchpoint.get('name')}")

    for form_id in form_ids:
        answers = paginate(token, f"/forms/{form_id}/answers", limit=1000, cap=10)
        print(f"\n■ 回答フォーム {form_id}：回答 {len(answers)} 件")
        if not answers:
            continue
        first = answers[0]
        print(f"   項目: {sorted(first.keys())}")
        print(f"   friend_id が null の回答: {sum(1 for a in answers if a.get('friend_id') is None)} 件")
        print("   設問（1件目の回答から）")
        for block in first.get("answers") or []:
            print(f"      {block.get('id')}  type={block.get('type')}  {block.get('title')}")
            print(f"         answered={block.get('answered')}  value={json.dumps(block.get('value'), ensure_ascii=False)[:80]}")

    if not form_ids:
        print("\n■ 回答フォーム: form_ids が空なので調べていません。"
              "\n   仕様書にフォーム一覧のエンドポイントが無いため、管理画面で診断フォームを開いたURLの数字を"
              f"\n   {CONFIG} の form_ids に入れてください。")


if __name__ == "__main__":
    main()
