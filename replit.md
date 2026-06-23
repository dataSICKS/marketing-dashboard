# マーケティングダッシュボード

マーケ施策（メルマガ等）の結果をスプレッドシートから自動連携してレポートするダッシュボード。

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — APIサーバー起動
- `pnpm --filter @workspace/dashboard run dev` — フロントエンド起動
- `pnpm run typecheck` — 全パッケージのタイプチェック
- `pnpm run build` — タイプチェック + ビルド
- `pnpm --filter @workspace/api-spec run codegen` — OpenAPI specからコード生成

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server`)
- Frontend: React + Vite + Tailwind v4 (`artifacts/dashboard`)
- Google Sheets連携: `@replit/connectors-sdk`（Replit Integrations経由）
- Validation: Zod (`zod/v4`)、API codegen: Orval

## Where things live

- `lib/api-spec/openapi.yaml` — APIコントラクト（source of truth）
- `lib/api-client-react/src/generated/` — 生成されたReact Queryフック
- `lib/api-zod/src/generated/` — 生成されたZodスキーマ
- `artifacts/api-server/src/routes/newsletter.ts` — メルマガAPIルート
- `artifacts/api-server/src/lib/newsletter-sheets.ts` — Google Sheets取得
- `artifacts/api-server/src/lib/newsletter-aggregate.ts` — 集計ロジック
- `artifacts/api-server/src/lib/newsletter-cache.ts` — インメモリキャッシュ
- `artifacts/dashboard/src/pages/dashboard.tsx` — ダッシュボードページ

## Architecture decisions

- Google Sheetsがsource of truth。sync時にSheets→Supabaseへupsert、読み出しはSupabase（またはインメモリキャッシュ）から
- データ取得優先順位：インメモリキャッシュ → Supabase → Google Sheets（フォールバック）
- ダッシュボードは白ベース×黒サイドバーのミニマルデザイン。サイドバー `#0a0a0a`、メインエリア `#f8f8f8`/`#fff`
- 集計軸（日別/週別/月別/シナリオ別）はクライアント側のパラメータで切り替え
- SupabaseにはService Role Keyを使用（RLSをバイパスするサーバーサイド書き込みのため）

## Product

- メルマガ配信レポート：配信数・開封率・クリック率・CVR・CV数をKPIカードで表示
- 集計軸を日別/週別/月別/シナリオ別に切り替え可能
- Rechartsで配信数（棒）と各率（折れ線）を重ねたトレンドチャート
- 手動「スプレッドシートから更新」ボタン + 画面開時の自動取得

## User preferences

- 機能追加前に要件を1個ずつ確認してから開発する

## Gotchas

- Tailwind v4では `@apply dark` は無効。テーマ変数は `:root` に直接設定する
- Google Sheetsの認証は Replit Connectors SDK 経由。`@replit/connectors-sdk` を `artifacts/api-server` にインストール済み
- APIサーバーのワークフローを再起動するとインメモリキャッシュはリセットされる（次回アクセス時にSupabaseから再ロード）
- SupabaseのRLSはデフォルト有効。Anon Keyでは書き込み不可。サーバーサイドにはService Role Keyが必須
- Google Sheetsのデータに同一ユニークキー（delivery_date + scenario_name + segment + template_name）の重複行がある場合があるため、upsert前にMapで重複排除している

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
