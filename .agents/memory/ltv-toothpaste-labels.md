---
name: LTV toothpaste labels
description: User intent for per-purchase toothpaste labels and LTV segmentation.
---

歯磨き剤の有無は、初回〜4回目の各購入回ごとに個別に判定する。

**Why:** ユーザーは「歯磨き剤の有無でラベル作って内訳やセグメントで使いたい」と依頼し、判定方法として「購入回ごとに判定」を選択した。

**How to apply:** 初回なし・2回目ありなどの商品変更を維持する。「いずれかの回で歯磨き剤を買った」という生涯属性に置き換えない。空欄や未記録は歯磨き剤なしの根拠にならないため不明として分ける。LTVは各回の商品に配賦した利益ではなく、その分類に属する定期全体の値であることを明示する。
