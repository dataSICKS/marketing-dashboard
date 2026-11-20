---
name: Dashboard access policy
description: User-approved requirements for Google sign-in, mandatory authenticator codes, and company-domain restrictions.
---

このダッシュボードはGoogleログインに加え、認証アプリの6桁コードによる追加認証を全利用者に必須とする。Googleアカウント自体の二段階認証に任せるだけの構成にはしない。紛失時のバックアップコードも用意し、画面とデータ取得・更新APIの両方を保護する。

**Why:** ユーザーが、この構成で導入することを承認した。

**How to apply:** 認証途中や二段階認証の未設定・未完了を通常のログイン完了と扱わない。設定や権限の不足で必須化できない場合は、保護が完成したと説明しない。

個別のアカウント一覧ではなく、確認済みGoogleメールのドメインで許可する。許可対象は `sicks.co.jp`、`cyberagent.co.jp`、`abema.tv` の3つ。

**Why:** ユーザーがアカウント単位ではなくドメイン単位を希望し、この3ドメインを指定した。

**How to apply:** ドメインは完全一致で照合する。似たドメインやサブドメインを自動では許可しない。クライアントからの申告値だけで判定せず、Google認証で確認された本人情報をサーバー側でも検証する。
