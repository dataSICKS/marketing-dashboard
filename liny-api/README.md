# liny-api

LINY（LINE CRM・O2O株式会社）のAPIを読むための調査用スクリプト。

## 何のためにあるか

LINE分析ページ（`/line`）の次の一手として、**工程別の配信⇒CV効果**を出したい。
分子（CV）はパラメURL経由で取れているが、**分母（その工程に到達した人数）が無い**。

LINY APIには配信実績（配信数・開封・クリック）のエンドポイントが**存在しない**ため、
唯一の分母候補が**タグの保有者数**。ステップ配信の各通にタグが付いていれば到達人数が分かる。
それを確かめるのがこのスクリプト。

## 仕様（2026-11時点・docs.lineml.jp v2.15.1）

- ベースURL `https://api.lineml.jp/v2/api`
- 認証 `Authorization: Bearer <token>`。管理画面 → API連携 → 認証タブ で発行
- レート制限 **10リクエスト/秒**。月間上限はプラン依存（仕様書に数値の記載なし）
- ページングはカーソル方式（`cursor` / `limit`、レスポンスに `next_cursor`）

### 取れるもの

| | エンドポイント | 使う項目 |
|---|---|---|
| 友だち | `GET /friends` | `is_blocked` `created_at` `display_status` `tags[].attached_at` |
| タグ | `GET /tags` / `GET /tags/{id}/friends` | 保有者一覧（`limit` は最大10000） |
| 流入経路 | `GET /touchpoints` / `GET /touchpoints/{id}/friends` | `passed_at` `query_params` |
| 回答フォーム | `GET /forms/{id}/answers` | `friend_id` `answered_at` `answers[].title/value` |

### 取れないもの（エンドポイントが無い）

- **配信数・開封数・クリック数**
- **ステップ配信の設定と各通の実績**
- **リッチメニューのタップ数**

→ 開封率・CTRはAPIでは自動化できない。管理画面からの手作業エクスポートのみ。

### 仕様書に無くて困っていること

- **回答フォームの一覧を返すエンドポイントが無い。** `form_id` は管理画面のURLから拾うしかない
- データ保持期間・遡れる期間の上限の記載が無い

## 使い方

```bash
/usr/bin/python3 liny-api/probe.py            # タグ・流入経路の一覧
/usr/bin/python3 liny-api/probe.py --counts   # 主要タグの保有者数も数える
```

`python3` ではなく `/usr/bin/python3`（Homebrew版にはyamlが無い）。

`config.yml` は gitignore 対象。トークンをここに置く。コミットしない。
サーバー側に繋ぐときは Replit Secrets の `LINY_API_TOKEN` に入れる（`.replit` には書かない）。
