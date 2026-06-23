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

- Google Sheetsデータはインメモリキャッシュで保持。初回アクセス時に自動取得、手動更新ボタンで再取得
- DB不使用（スプシがsource of truth）。将来的なレポート種別追加を見据えたシンプルな設計
- ダッシュボードは常時ダークモード（コックピット感）。`:root`にダーク変数を直接設定
- 集計軸（日別/週別/月別/シナリオ別）はクライアント側のパラメータで切り替え

## Product

- メルマガ配信レポート：配信数・開封率・クリック率・CVR・CV数をKPIカードで表示
- 集計軸を日別/週別/月別/シナリオ別に切り替え可能
- Rechartsで配信数（棒）と各率（折れ線）を重ねたトレンドチャート
- 手動「スプレッドシートから更新」ボタン + 画面開時の自動取得

## User preferences

- 機能追加前に要件を1個ずつ確認してから開発する

## Gotchas

- Tailwind v4では `@apply dark` は無効。ダークモード強制はCSSのセレクタ（`:root`への直接設定）で対応
- Google Sheetsの認証は Replit Connectors SDK 経由。`@replit/connectors-sdk` を `artifacts/api-server` にインストール済み
- APIサーバーのワークフローを再起動するとキャッシュはリセットされる（インメモリのため）

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
