import test from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedEmail,
  emailDomain,
  decodeIdTokenPayload,
  validateIdTokenPayload,
  buildAuthorizeUrl,
  GoogleAuthError,
} from "./auth-identity.ts";

const DOMAINS = ["sicks.co.jp", "cyberagent.co.jp", "abema.tv"];

test("許可ドメインは完全一致で通す", () => {
  for (const email of [
    "tomoki.yamamoto@sicks.co.jp",
    "someone@cyberagent.co.jp",
    "someone@abema.tv",
    "someone@ABEMA.TV",
  ]) {
    assert.equal(isAllowedEmail(email, DOMAINS), true, email);
  }
});

test("似たドメイン・サブドメイン・偽装は通さない", () => {
  const rejected = [
    "someone@sub.abema.tv",
    "someone@abema.tv.example.com",
    "someone@notabema.tv",
    "someone@abema.tvv",
    "someone@xabema.tv",
    "someone@sicks.co.jp.evil.com",
    "someone@gmail.com",
    "someone@",
    "noatsign",
    "",
    // @ を2つ使って許可ドメインを手前に見せる偽装
    "someone@abema.tv@evil.com",
  ];
  for (const email of rejected) {
    assert.equal(isAllowedEmail(email, DOMAINS), false, `通ってはいけない: ${email}`);
  }
});

test("emailDomain は最後の @ 以降を小文字で返す", () => {
  assert.equal(emailDomain("a@b@sicks.co.jp"), "sicks.co.jp");
  assert.equal(emailDomain("a@SICKS.CO.JP"), "sicks.co.jp");
  assert.equal(emailDomain("noatsign"), "");
});

/** テスト用のid_tokenを組む（この経路は署名検証しないのでヘッダ/署名はダミー）。 */
function makeIdToken(payload) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.signature`;
}

const VALID = {
  iss: "https://accounts.google.com",
  aud: "client-123",
  sub: "1234567890",
  email: "Tomoki.Yamamoto@SICKS.co.jp",
  email_verified: true,
  name: "山本智樹",
  picture: "https://example.com/p.png",
  hd: "sicks.co.jp",
  exp: 2000000000,
  nonce: "nonce-abc",
};

const OPTS = { clientId: "client-123", nonce: "nonce-abc", nowMs: 1_700_000_000_000 };

test("正しいid_tokenからメールを小文字で取り出す", () => {
  const identity = validateIdTokenPayload(decodeIdTokenPayload(makeIdToken(VALID)), OPTS);
  assert.equal(identity.email, "tomoki.yamamoto@sicks.co.jp");
  assert.equal(identity.sub, "1234567890");
  assert.equal(identity.emailVerified, true);
  assert.equal(identity.name, "山本智樹");
  assert.equal(identity.hd, "sicks.co.jp");
});

test("発行者・aud・期限・nonce・メール未確認・sub欠けはすべて弾く", () => {
  const cases = [
    [{ iss: "https://evil.example.com" }, "invalid_issuer"],
    [{ iss: undefined }, "invalid_issuer"],
    [{ aud: "other-client" }, "invalid_audience"],
    [{ exp: 1_600_000_000 }, "expired"],
    [{ exp: undefined }, "expired"],
    [{ nonce: "nonce-different" }, "nonce_mismatch"],
    [{ nonce: undefined }, "nonce_mismatch"],
    [{ email_verified: false }, "email_unverified"],
    [{ email: undefined }, "email_unverified"],
    [{ sub: undefined }, "no_subject"],
  ];
  for (const [patch, expectedCode] of cases) {
    assert.throws(
      () => validateIdTokenPayload({ ...VALID, ...patch }, OPTS),
      (err) => {
        assert.ok(err instanceof GoogleAuthError);
        assert.equal(err.code, expectedCode, JSON.stringify(patch));
        return true;
      },
      JSON.stringify(patch),
    );
  }
});

test("email_verified が文字列 'true' でも受ける（Googleの揺れ）", () => {
  assert.equal(
    validateIdTokenPayload({ ...VALID, email_verified: "true" }, OPTS).emailVerified,
    true,
  );
});

test("形の壊れたid_tokenはデコードで落ちる", () => {
  assert.throws(() => decodeIdTokenPayload("not-a-jwt"), /形式が不正/);
  assert.throws(() => decodeIdTokenPayload("a.b"), /形式が不正/);
});

test("認可URLにPKCE・state・nonceが載り、verifierは載らない", () => {
  const url = new URL(
    buildAuthorizeUrl({
      clientId: "client-123",
      redirectUri: "https://example.com/api/auth/google/callback",
      state: "state-xyz",
      nonce: "nonce-abc",
      codeChallenge: "challenge-value",
    }),
  );

  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "client-123");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://example.com/api/auth/google/callback",
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("state"), "state-xyz");
  assert.equal(url.searchParams.get("nonce"), "nonce-abc");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-value");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.equal(url.searchParams.get("code_verifier"), null);
});
