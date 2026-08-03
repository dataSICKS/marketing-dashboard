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
```

## 取得対象の広告コード（管理画面設定が単一の正）

`export.py` の `target_adcodes()` が **管理画面設定のみ**を対象にする。

- 正: Supabase Storage `app-settings/config.json` の `clarityTargetUrls`
- **対象を増やす/減らすのは管理画面での登録操作だけ**。翌朝7:30の実行から反映される
- `config.yml` の `clarity.pages` は対象判定に**使わない**（管理画面に無いコードは
  「対象外」としてログに出るだけ）
- 設定が空/取得失敗のときは0件実行せず**エラー終了**する（無音の取得漏れを防ぐため）

> 経緯: 2026-08-03まで日次cronは `config.yml` の `pages` のみを見ていたため、
> 管理画面にだけ登録された `ch_1_a` / `ch_1_b` が7/27以降ずっと取得されていなかった。
> 二重管理を廃止し管理画面を正に一本化した（欠損分は `backfill_admin.py` で復旧済み）。

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

## cron（毎朝・前日分）

```
30 7 * * * cd /Users/sicks/claude-work/clarity-heatmap-export && /usr/bin/python3 export.py >> logs/cron.log 2>&1
```
