#!/bin/bash
# LINY APIの調査を1コマンドで走らせる。
# トークンはこの中で入力する（画面に出ない・履歴にも残らない）。config.yml はgitignore対象。
set -u
cd "$(dirname "$0")"

printf 'LINYのアクセストークンを貼り付けて Enter（入力しても画面には出ません）\n> '
IFS= read -rs TOKEN
printf '\n'

if [ -z "${TOKEN// }" ]; then
  echo "トークンが空です。管理画面 → API連携 → 認証タブ で発行してください。" >&2
  exit 1
fi

printf '診断フォームのID（管理画面でフォームを開いたURLの数字）。不要なら空のまま Enter\n> '
IFS= read -r FORM_ID
printf '\n'

TOKEN="$TOKEN" FORM_ID="$FORM_ID" /usr/bin/python3 - <<'PY'
import os, yaml, pathlib
path = pathlib.Path("config.yml")
config = yaml.safe_load(path.read_text())
config["liny"]["token"] = os.environ["TOKEN"].strip()
form_id = os.environ.get("FORM_ID", "").strip()
config["liny"]["form_ids"] = [form_id] if form_id else []
# コメントは消えるが、中身は壊さない。allow_unicode で日本語をそのまま書く。
path.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
print("config.yml に書き込みました（このファイルはコミットされません）")
PY
[ $? -ne 0 ] && exit 1

mkdir -p out
echo "調査を開始します。タグが多いと数分かかります…"
/usr/bin/python3 probe.py --counts 2>&1 | tee out/probe.log
echo
echo "結果を out/probe.log に保存しました。Claudeに「終わった」と伝えてください。"
