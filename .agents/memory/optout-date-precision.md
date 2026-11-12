---
name: Opt-out date precision
description: External Connected Sheets query reveals inferred opt-out dates rather than event timestamps.
---

元シートの「オプトアウト日」は実操作ログの日時ではない。顧客の取り込み履歴で日ごとの最後の購読状態を取り、前回がオン・今回がオフになった取り込み日の前日を日付としている。

**Why:** Google SheetsのConnected Sheetsに設定された元クエリを確認したところ、`LAG`で購読状態の変化を検出し、`DATE_SUB(imported_date, INTERVAL 1 DAY)`を出力していた。アプリ側のデータ型や列名だけでは、この推定方法は分からない。

**How to apply:** 経過日数やオプトアウト時点の定期回数の分析では推定日基準であることを明示する。同日内の受注と解除の順序を断定しない。実操作日時の精度が必要なら別のイベントログを確認する。日次取り込みに欠落がある場合も考慮し、誤差を常に1日以内と断定しない。
