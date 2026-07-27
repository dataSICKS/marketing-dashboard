# marketing-dashboard

マーケ施策の結果を **Web ダッシュボード**で可視化し、外部データ（Microsoft Clarity ヒートマップ、ECforce 広告集計、EFO/メルマガ集計スプレッドシート）を **日次ジョブ**で Supabase へ蓄積するモノレポ。

pnpm ワークスペースの TypeScript アプリ（Express API + React/Vite ダッシュボード）と、日次データ収集を担う Python ジョブ群（Playwright / requests）が 1 リポジトリに同居する。データストアは共用 Supabase プロジェクト `kqhckosphntfuhqrxcoj`。

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [DESIGN.md](DESIGN.md) | 目的・アーキテクチャ図・データフロー・各サブプロジェクトの役割・技術スタック・設計判断(why) |
| [CODE.md](CODE.md) | ディレクトリ構成・各ジョブ/モジュール解説・拡張手順・コピペ雛形 |
| [OPERATIONS.md](OPERATIONS.md) | セットアップ・env 表・crontab（実時刻）・運用手順・動作確認・トラブルシューティング |
| [DATA.md](DATA.md) | Supabase テーブル/列定義・SQL・指標定義・各データソースと更新頻度・Storage バケット |
| [UI.md](UI.md) | ダッシュボードの画面一覧・コンポーネント・UX |

## クイックスタート

```bash
# 依存（pnpm 必須。npm/yarn は preinstall で拒否される）
pnpm install

# OpenAPI から型/フック生成 → 型チェック
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck

# API サーバー / フロントを個別起動
pnpm --filter @workspace/api-server run dev   # 要 env: PORT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
pnpm --filter @workspace/dashboard run dev

# Python 日次ジョブ（各サブディレクトリで）
cd clarity-heatmap-export && python3 export.py     # 前日分の Clarity ヒートマップ
cd ecf-ad-to-supabase && python3 run.py            # ※ run.py は現在欠落中（OPERATIONS.md 参照）
```

詳細な env・cron・既知の問題は [OPERATIONS.md](OPERATIONS.md) を参照。
