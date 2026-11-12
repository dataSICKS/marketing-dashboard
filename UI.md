# UI — marketing-dashboard（ダッシュボード）

`artifacts/dashboard`（React + Vite + Tailwind v4 + shadcn/ui + Recharts + wouter + TanStack Query）。
デザインは **白ベース × 黒サイドバー**のミニマル。サイドバー `#0a0a0a`、メイン `#f8f8f8`/`#fff`。
API 呼び出しは `@workspace/api-client-react` の生成 React Query フック（`useGetNewsletterData` 等）。

## ナビゲーション（`components/Layout.tsx`）

折りたたみ可能な黒サイドバー。項目:

| ラベル | パス | 画面 |
|---|---|---|
| メルマガ分析 | `/` | dashboard.tsx |
| LTV分析 | `/ltv` | ltv.tsx |
| CVRレポート | `/efo` | efo.tsx |
| 施策カレンダー | `/campaigns` | campaigns.tsx |
| 設定 | `/settings` | settings.tsx |

ルーティングは wouter（`App.tsx`）。`base` は `import.meta.env.BASE_URL`。ダーク class は起動時に除去。

## 画面一覧

### 1. メルマガ分析（`/`, dashboard.tsx）

メルマガ配信の KPI とトレンドを表示。

- **タブ（集計軸）**: 日別 / 週別 / 月別 / シナリオ別 / テンプレート別 / **マトリクス**（`TabMode = GroupBy | "matrix"`）。
- **KPI カード**: 配信数 / 開封率 / クリック率 / CVR / CV 数 / **オプトアウト件数**（4枚、`sm:2列 / lg:4列`）。
  - オプトアウトは増加が悪化なので、差分バッジの色を反転する（`KpiCard invertDiff` → `DiffBadge invertColor`）。
- **トレンドチャート**: Recharts `ComposedChart`（配信数=棒＋各率=折れ線の重ね）。
- **オプトアウトは独立グラフを持たない**。元データが顧客番号＋解除日だけで**解除経路が無い**ため、
  シナリオ/テンプレート別に分解できない。この性質に合わせて扱いを2つに分けている。
  - **マトリクス**: 「指標」ではなく**行を足すか足さないか**で管理する（ボタン「オプトアウト行を足す／外す」→
    `includeOptout=true`）。`オプトアウト（全体）` という専用系列が1行だけ増え、**その行はオプトアウト数のみ**を持つ
    （`seriesMetrics()` で系列ごとに指標行を切り替えるので、他系列に空の「オプトアウト数」行は出ない）。
    指標のマルチセレクトからは `optoutCount` を除外している。
    シナリオ/テンプレ未選択でもこの行だけなら描画する（`hasSelections` / `hasMetrics` に OR）。
    「指標を列に表示」のときだけは行ごとに列を変えられないため、オプトアウト数の列が1本増える。
  - **日別/週別/月別タブ**: 期間ラベルが揃うので `CHART_METRICS` の1指標（`optoutCount` / 「オプトアウト数」/ `#EF4444`）
    として「表示指標」から選べる。シナリオ別・テンプレ別タブでは値が無いので**選択肢に出さない**
    （`optoutMetricAvailable`。選択済みだった場合は `activeChartMetric` で「標準」に戻す）。
- **明細テーブル**: 集計軸別行。件名(subject)は day/template で表示。
- **Before/After 比較**: 施策（campaign）の開始日を起点に前後比較。before=青系(`#EFF6FF`/`#1D4ED8`)、after=ピンク系(`#FDF2F8`/`#9D174D`)で行を色分け。
- **期間フィルタ**: `DateRangePicker`。セグメント絞り込み対応。
- **プリセット**: フィルタ条件を保存/復元（`localStorage` キー `nl_presets`）。
- 手動「スプレッドシートから更新」（`POST /newsletter/sync`）＋画面表示時に自動取得。

### 2. LTV分析（`/ltv`, ltv.tsx）

定期購入1件あたりの LTV を初回購入月別に見る。
**スプレッドシート「LTV集計-Sicks共有」の `LTVレポート` タブの表とグラフを画面化したもの**で、
数字の定義（平均・円・LTV95/180/365）はそちらに合わせている。

- **絞り込み**: 初回購入月（開始/終了の月セレクト）/ オファー / 初回商品 / サブスク状態 / 広告グループ
  （いずれも `MultiSelectCombobox`）/ **オプトアウト**（すべて・した顧客のみ・していない顧客のみ）。
- **内訳（`splitBy`）**: なし / **オプトアウト有無** / オファー / 初回商品 / サブスク状態 / 広告グループ。
- **KPI カード**: 定期件数（サブに顧客数）/ 平均LTV95 / 平均LTV180 / 平均LTV365。
- **チャート**: `ComposedChart`。
  - 内訳なし … LTV95(`#4285F4`) / LTV180(`#EA4335`) / LTV365(`#FBBC04`) の棒3本（シートと同じ配色）。
  - 内訳あり … 選んだ1指標を系列ごとの棒で並べる（「棒に出す指標」セレクト。既定 LTV180）。
  - 件数は**右軸**の折れ線（`#34A853`）。元シートは件数も金額と同じ軸だが、絞り込むと桁が離れて潰れるため分けている。
- **テーブル**: 初回購入月 ×（内訳）× 件数 / LTV95 / LTV180 / LTV365。シートの表と同じ並び。
- **注記（常時表示）**: ①LTVは売上でなく利益の定期1件あたり平均 ②365日経っていない月はLTV365が小さく出る
  ③オプトアウトのデータは2025/12/31以降しか無く、それ以前の月は「オプトアウトなし」に寄る。
- 手動「スプレッドシートから更新」（`POST /ltv/sync`）。**GET では取り込まない**
  （5万行超の取り込みが画面表示のたびに走るとタイムアウトし、「一部の月しか出ない」「絞り込み候補が空」という
  中途半端な表示になるため）。未取り込みのときは専用の案内を出す。
- 注記の先頭に**取り込み済み件数と初回購入月のレンジ**を出す。「取り込めていない」のか
  「絞り込みで消えた」のかを画面だけで切り分けられるようにするため。
- 絞り込みの候補が空のときは `MultiSelectCombobox` の `emptyMessage` で
  読み込み中 / 取得失敗 / 未取り込み を書き分ける（一律「見つかりません」にしない）。

### 3. CVRレポート（`/efo`, efo.tsx）

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

### 4. 施策カレンダー（`/campaigns`, campaigns.tsx）

- 施策（`campaigns` テーブル）の一覧・追加・編集・削除。
- フォーム: タイトル（必須）/ 開始日 / 終了日 / カテゴリ（トグル選択）/ メモ。
- カテゴリは `CAMPAIGN_CATEGORIES` に応じた色スタイル。

### 5. 設定（`/settings`, settings.tsx）

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
