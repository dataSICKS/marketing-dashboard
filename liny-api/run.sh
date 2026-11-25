#!/bin/bash
# LINY APIから取得して out/ に保存する。
# 初回はトークンを聞く。2回目以降は config.yml にあるものを使う。
set -u
cd "$(dirname "$0")"

NEEDS_TOKEN=$(/usr/bin/python3 -c "
import yaml
t = (yaml.safe_load(open('config.yml').read())['liny'].get('token') or '').strip()
print('yes' if not t or t.startswith('ここに') else 'no')
")

if [ "$NEEDS_TOKEN" = "yes" ]; then
  printf 'LINYのアクセストークンを貼り付けて Enter（入力しても画面には出ません）\n> '
  IFS= read -rs TOKEN
  printf '\n'
  if [ -z "${TOKEN// }" ]; then
    echo "トークンが空です。管理画面 → API連携 → 認証タブ で発行してください。" >&2
    exit 1
  fi
  TOKEN="$TOKEN" /usr/bin/python3 - <<'PY'
import os, yaml, pathlib
path = pathlib.Path("config.yml")
config = yaml.safe_load(path.read_text())
config["liny"]["token"] = os.environ["TOKEN"].strip()
path.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
print("config.yml に書き込みました（このファイルはコミットされません）")
PY
  [ $? -ne 0 ] && exit 1
fi

mkdir -p out
echo "■ タグと保有者を取得します（137タグ・数分）"
/usr/bin/python3 collect.py || exit 1
echo
echo "■ 友だちを全件取得します（タグ付与日時つき・約52ページ）"
/usr/bin/python3 friends.py || exit 1
echo
echo "完了。out/ に保存しました。Claudeに「終わった」と伝えてください。"
