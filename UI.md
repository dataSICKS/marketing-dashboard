# UI — marketing-dashboard（ダッシュボード）

`artifacts/dashboard`（React + Vite + Tailwind v4 + shadcn/ui + Recharts + wouter + TanStack Query）。
デザインは **白ベース × 黒サイドバー**のミニマル。サイドバー `#0a0a0a`、メイン `#f8f8f8`/`#fff`。
API 呼び出しは `@workspace/api-client-react` の生成 React Query フック（`useGetNewsletterData` 等）。

## ナビゲーション（`components/Layout.tsx`）

折りたたみ可能な黒サイドバー。項目:

| ラベル | パス | 画面 |
|---|---|---|
| メルマガ分析 | `/` | dashboard.tsx |
| CVRレポート | `/efo` | efo.tsx |
| 施策カレンダー | `/campaigns` | campaigns.tsx |
| 設定 | `/settings` | settings.tsx |

ルーティングは wouter（`App.tsx`）。`base` は `import.meta.env.BASE_URL`。ダーク class は起動時に除去。

## 画面一覧

### 1. メルマガ分析（`/`, dashboard.tsx）

メルマガ配信の KPI とトレンドを表示。

- **タブ（集計軸）**: 日別 / 週別 / 月別 / シナリオ別 / テンプレート別 / **マトリクス**（`TabMode = GroupBy | "matrix"`）。
- **KPI カード**: 配信数 / 開封率 / クリック率 / CVR / CV 数。
- **トレンドチャート**: Recharts `ComposedChart`（配信数=棒＋各率=折れ線の重ね）。
- **明細テーブル**: 集計軸別行。件名(subject)は day/template で表示。
- **Before/After 比較**: 施策（campaign）の開始日を起点に前後比較。before=青系(`#EFF6FF`/`#1D4ED8`)、after=ピンク系(`#FDF2F8`/`#9D174D`)で行を色分け。
- **期間フィルタ**: `DateRangePicker`。セグメント絞り込み対応。
- **プリセット**: フィルタ条件を保存/復元（`localStorage` キー `nl_presets`）。
- 手動「スプレッドシートから更新」（`POST /newsletter/sync`）＋画面表示時に自動取得。

### 2. CVRレポート（`/efo`, efo.tsx）

EFO（ECforce Smart Dialog）の A/B 2 軸比較 + Clarity スクロール深度。

- **KPI**: LP アクセス数 / 起動数（起動率）/ CV 数 / チャット CVR /（LP がある場合）LP CVR。
- **CVR 推移チャート**: CVR・起動率・起動数の折れ線/複合チャート。
- **明細テーブル**: LP アクセス / 起動数 / 起動率 / チャット CVR / LP CVR をソート可能。
- **セグメント A/B 比較**: フィルタ（profileName, adCode 等）を A/B で独立設定。
- **プリセット**: A/B のフィルタ条件を Supabase `efo_presets`（segment_a/segment_b jsonb）に保存。
- **スクロール深度分析セクション**（`ClarityScrollSection` → `ClarityPanel` ×2, A=黄 / B=青）:
  - 期間ピッカー（`EfoDateRangePicker`）で Storage の取得済み日付から選択。
  - 広告コード select（`GET /clarity/files?date=`）。**設定の `clarityTargetUrls` でホワイトリスト絞り込み**（空なら全 adCode 表示）。
  - デバイスタブ: 合計 / Desktop / Mobile。
  - Recharts 縦チャート（Y 軸=スクロール深度 5%→100%、X 軸=訪問者数）。Desktop=`CLARITY_DESKTOP`、Mobile=`CLARITY_MOBILE` の 2 線。
  - PV サマリ（Desktop PV / Mobile PV）をチャート上部に表示。データ無し日は「データなし」表示。

### 3. 施策カレンダー（`/campaigns`, campaigns.tsx）

- 施策（`campaigns` テーブル）の一覧・追加・編集・削除。
- フォーム: タイトル（必須）/ 開始日 / 終了日 / カテゴリ（トグル選択）/ メモ。
- カテゴリは `CAMPAIGN_CATEGORIES` に応じた色スタイル。

### 4. 設定（`/settings`, settings.tsx）

- **Clarity 対象 URL（`clarityTargetUrls`）** の複数入力（追加/削除、`Plus`/`X` アイコン）。保存で `PUT /settings`。
  - これが CVR レポートの Clarity パネルで表示する広告コードのホワイトリストになる。
- **Clarity — 取得済みデータ**: Storage に保存済みの日付一覧を表示（`GET /clarity/files`）。

## 共通コンポーネント

- `components/ui/*` — shadcn/ui 一式（button, card, table, tabs, popover, calendar, chart, sidebar, toast/sonner 等）。
- `components/Layout.tsx` — サイドバー＋メイン枠。
- `components/DateRangePicker.tsx` / `EfoDateRangePicker.tsx` — 期間選択。
- `components/MultiSelectCombobox.tsx` — 複数選択フィルタ。
- `hooks/use-mobile.tsx`, `hooks/use-toast.ts`。
- `lib/format.ts` — `formatNumber` / `formatPercent` 等。

## UX メモ

- 率は `formatPercent`、件数は `formatNumber` で整形。
- チャートはローディング中 `Skeleton`、空データは明示メッセージ。
- Before/After と A/B は配色で視覚的に区別（青/ピンク、黄/青）。
- Tailwind v4 のためテーマ変数は `:root` 直書き（`@apply dark` は無効）。
