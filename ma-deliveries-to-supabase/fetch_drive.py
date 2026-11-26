#!/usr/bin/env python3
"""Driveの「配信対象者毎」CSVフォルダから未取得のファイルを落とす。

Driveコネクタ経由では**1ファイル10MBまで**しか取れず、10MBを超える3ファイル
（2026-11-16エクスポート時点で全体の約70%）が取り込まれていなかった。
Drive APIにはその制限が無いので、こちらで落とす。

    /usr/bin/python3 fetch_drive.py            # csv/ に無いものを全部
    /usr/bin/python3 fetch_drive.py --min-mb 10  # 10MB超だけ（未取得分の指定に使う）

認証は既存のサービスアカウント（meta-ads-to-sheets/credentials.json）。
このフォルダには閲覧権限が既に付いている。
"""
import argparse, io, sys
from pathlib import Path

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

FOLDER = "1onjS6IBW75WHlTF7ThCOB-_1YNqsI3-M"
HERE = Path(__file__).parent
CREDENTIALS = HERE.parent.parent / "meta-ads-to-sheets" / "credentials.json"
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv-dir", default=str(HERE / "csv"))
    parser.add_argument("--min-mb", type=float, default=0.0, help="このサイズ超のファイルだけ落とす")
    args = parser.parse_args()
    out = Path(args.csv_dir)
    out.mkdir(parents=True, exist_ok=True)

    if not CREDENTIALS.exists():
        sys.exit(f"認証情報がありません: {CREDENTIALS}")
    drive = build("drive", "v3", cache_discovery=False,
                  credentials=Credentials.from_service_account_file(str(CREDENTIALS), scopes=SCOPES))

    files, token = [], None
    while True:
        page = drive.files().list(q=f"'{FOLDER}' in parents and trashed=false",
                                  fields="nextPageToken, files(id,name,size)",
                                  pageSize=200, pageToken=token).execute()
        files += page.get("files", [])
        token = page.get("nextPageToken")
        if not token:
            break
    files.sort(key=lambda f: int(f.get("size") or 0), reverse=True)
    print(f"フォルダ内 {len(files)}ファイル")

    threshold = args.min_mb * 1024 * 1024
    taken = 0
    for meta in files:
        size = int(meta.get("size") or 0)
        target = out / meta["name"]
        if size <= threshold:
            continue
        if target.exists() and target.stat().st_size == size:
            print(f"  既にある  {size/1024/1024:>7.1f}MB  {meta['name']}")
            continue
        request = drive.files().get_media(fileId=meta["id"])
        with io.FileIO(target, "wb") as handle:
            downloader = MediaIoBaseDownload(handle, request, chunksize=8 * 1024 * 1024)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        got = target.stat().st_size
        ok = "OK" if got == size else f"⚠️ サイズ不一致 {got}"
        print(f"  取得 {ok}  {size/1024/1024:>7.1f}MB  {meta['name']}")
        taken += 1
    print(f"\n{taken}ファイルを {out} に取得しました")


if __name__ == "__main__":
    main()
