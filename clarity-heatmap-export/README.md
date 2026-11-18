# clarity-heatmap-export

Microsoft Clarity（ecforce efo連携プロジェクト「歯科衛生士LP」）の**スクロールヒートマップ**を
CSV・PNGでダウンロードし、Supabase Storage に日次保存するパイプライン。

## 仕組み

```
[初回のみ] save_session.py → ヘッド付きブラウザで手動ログイン(OAuth/MFA)
           → 永続プロファイル chrome_profile/ にセッション保存（再ログイン不要）
   ↓ （以降ヘッドレスで自動）
export.py:
  各ページ(lp?u=<広告コード>) × デバイス(Desktop/Mobile) について
    ヒートマップ画面URLを直接組み立てて遷移
      /projects/view/<PROJECT_ID>/heatmaps?date=Yesterday&heatmapType=0&URL=2;2;lp?u=<code>
      （URL=<field=2;match=2(を含む);値>）
    スクロール種別を選択 → デバイスを選択
    「CSV をダウンロード」「PNG をダウンロード」を取得（PNG実体はJPEG）
  ローカル downloads/ に保存 → Supabase Storage バケット clarity-heatmaps へ
      {YYYY-MM-DD}/{広告コード}_{device}_scroll_{date}.csv|png
```

## 使い方

```bash
python3 save_session.py          # 初回のみ：手動ログイン（合図ファイル方式）
python3 export.py                # 前日分（JST, date=Yesterday）
python3 export.py 2026-06-23     # 指定日（Custom）

# 過去分の取り直し（Storageに無い adCode×device だけ取得）
python3 backfill_admin.py --dry-run 2026-11-03 2026-11-09   # 欠損一覧の確認だけ
python3 backfill_admin.py 2026-11-03 2026-11-09             # 実行
python3 backfill_admin.py --only=<広告コード> 2026-11-03 2026-11-09
    # 1コードだけ。管理画面に新しいLPを足した後の過去分取得に使う
    # （登録日より前の日付は日次cronでは永久に埋まらないため）

# 保存済みCSVのPV過少（部分取得glitch）を監査して差し替え
python3 audit_pv.py --dry-run 2026-11-03 2026-11-09
python3 audit_pv.py 2026-11-03 2026-11-09
```

> **新しいLPを追加したときの手順**: ①管理画面で広告コードを登録 →
> ②`backfill_admin.py --only=<コード> <登録日の数日前> <前日>` で過去分を取得。
> ①だけだと翌日08:00の実行から先しか貯まらない。

## 取得対象の広告コード（管理画面設定が単一の正）

`export.py` の `target_adcodes()` が **管理画面設定のみ**を対象にする。

- 正: Supabase Storage `app-settings/config.json` の `adCodes`
- 旧 `clarityTargetUrls` / `clarityTargetUrl` は移行前の設定として読める。
  `adCodes` が存在する場合は必ずそちらを優先し、空ならエラー終了する。
- 管理画面は保存時に `clarityTargetUrls` にも同じ一覧を書き出す。これは
  別PCで動く旧収集スクリプトへの互換用で、独立した設定として編集しない。
- **対象を増やす/減らすのは管理画面での登録操作だけ**。翌日08:00の実行から反映される
- `config.yml` の `clarity.pages` は対象判定に**使わない**（管理画面に無いコードは
  「対象外」としてログに出るだけ）
- 設定が空/取得失敗のときは0件実行せず**エラー終了**する（無音の取得漏れを防ぐため）

> 経緯: 2026-08-03まで日次cronは `config.yml` の `pages` のみを見ていたため、
> 管理画面にだけ登録された `ch_1_a` / `ch_1_b` が7/27以降ずっと取得されていなかった。
> 二重管理を廃止し管理画面を正に一本化した（欠損分は `backfill_admin.py` で復旧済み）。

> **経緯2（2026-11-03・キー名の不一致でジョブが7日間停止）**: ダッシュボード側の
> 設定キーが `clarityTargetUrls` → `adCodes` に変わり、旧キーだけを見る収集処理が
> 対象0件として10/27〜11/02にエラー終了していた（欠損は復旧済み）。
> 現在は共有の `parse_admin_codes()` が現行キーを優先し、旧キーしかない設定にも対応する。
> 旧キーとの和集合にはせず、管理画面で削除したコードを復活させない。

## 保存状況と欠損の再取得

管理画面の「Clarity — 広告コード別の保存状況」で各コードの保存日数・
Desktop/Mobile別の日数・最終保存日を確認できる。CSVがないことだけでは
アクセスなしと取得漏れは区別できない。取得エラーを0PVや空データとして扱わない。

収集環境のログイン済み `chrome_profile/` と `config.yml` を使用して、
指定期間の未保存コード×デバイスだけを再取得する（このReplitにセッションは含まれない）:

```bash
python3 backfill_admin.py --dry-run 2026-10-01 2026-10-29
python3 backfill_admin.py 2026-10-01 2026-10-29
```

期間はClarityで実データを確認できる範囲を指定する。保存済みCSVは上書きしない。
日次・再取得処理は現在の `adCodes` を共通して読み、取得・保存失敗時は非ゼロ終了する。

## 設定（config.yml / gitignore）

- `clarity.pages` … **対象判定には未使用**（管理画面設定との差分表示のみ。上記参照）
- `clarity.devices` … [Desktop, Mobile]
- `clarity.heatmap_type` … scroll
- `supabase.url` / `service_role_key` / `storage_bucket`（clarity-heatmaps）

## ポイント / 落とし穴

- ログインは Microsoft/Google OAuth(MFA可)。**永続プロファイル方式**で一度ログインすれば再利用。
  セッション失効時は `save_session.py` を再実行。
- ヒートマップ画面はURLクエリで filter/device/type を指定可能。
  URL filter エンコード：`<field>;<matchtype>;<value>`（field=2:閲覧済みURL, matchtype=2:を含む, 6:正規表現）。
- ダウンロードメニュー：CSV は `[role=menuitem]`、**PNG は `[role=button]`**（DIV）。
  ダウンロード後のメニュー再オープンが不安定なため、ダウンロードボタン再クリックをリトライ。
- 対象日にスクロールデータが無いページ×デバイスは「スクロール情報が見つかりませんでした」を検知して即スキップ
  （空CSVの保存・PNG生成タイムアウトを回避）。低トラフィックの広告コードは取得されない日がある。
- CSVは取れてもPNG（ヒートマップ画像／実体JPEG）はデータがある場合のみ生成可能。
- **空CSVガード（2026-10-14追加）**: Clarity側の応答によっては、PV欄が空で
  深度行が0行の「空CSV」が落ちてくることがある（2026-08〜10の60日で4件：9/21・9/26・
  10/2・10/13）。`csv_has_data()` で検知し、30秒待って最大2回まで再取得する。
  それでも空ならアップロードせずスキップするため、Storageに空ファイルは残らない。
  スクロールデータ自体が無い組み合わせは正常なのでリトライ対象外。
  PNGだけ失敗した場合はダッシュボードが参照しないので警告のみでアップロードする。
  ※`backfill_admin.py` と `audit_pv.py` もこのガードを通る（2026-11-03に統一）。

## 定期実行（毎日08:00・前日分＋当日分）

**launchd** で動かす（`~/Library/LaunchAgents/com.sicks.clarity-heatmap-export.plist`）。

```
launchctl list | grep clarity                                  # 稼働確認
launchctl bootout   gui/$(id -u)/com.sicks.clarity-heatmap-export   # 止める
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sicks.clarity-heatmap-export.plist
```

1回の実行で**前日分と当日分の2日分**を取る。
当日分は**実行時点までの途中経過**で、翌日の「前日」取得で同じ名前に上書きされて確定する。
当日分が不要なときは `python3 export.py --no-today`。

### 時刻の経緯

- もともと 7:30。2026-10-14に **11:30** へ変更（空CSVを掴む事象が約2週に1回あり、Clarity側の猶予を増やす目的）。
  ただし**時刻が原因と確定したわけではない**（10/13は同じ実行内で他URLが正常に取得できており、
  全実行が7:30固定だったので時刻依存かはログから判定できなかった）。根本対策は下記の空CSVガード。
- 2026-11-18に **08:00** へ変更（朝9時前に見たいため）。
  7:30に近い時刻へ戻すことになるが、**空CSVガード（再取得2回）が入った後**なので、
  空CSVを掴んでもその場でリトライされる。再発するようなら時刻を戻すより先にログを見ること。

> ⚠️ **cron から launchd に移した**（2026-11-18）。このMacでは `crontab <file>` の書き込みが
> 許可ダイアログ待ちで固まるため（[[env-crontab-write-blocked]]）。
> **旧 cron の行（`30 11 * * *`）が残っている場合は消すこと。** 消すまでは8:00と11:30の
> 2回走るが、保存名を固定したので上書きされるだけで二重計上にはならない。

## Storage の保存名

`{YYYY-MM-DD}/{adCode}_{device}_scroll.csv`（PNGも同じ）。

**取得経路（前日・当日・指定日・backfill・audit）によらず同じ名前**にしている。
ダッシュボードは `{adCode}_*` の CSV を全部足すので、同じ日・同じデバイスのファイルが
2つ残ると**PVが二重計上**になる。過去に `audit_pv.py` だけ `_scroll_<日付>.csv` で保存して
cron の `_scroll_yesterday.csv` と重複した事故があったため、
アップロード後に `prune_old_objects()` で旧命名のファイルを削除している。
