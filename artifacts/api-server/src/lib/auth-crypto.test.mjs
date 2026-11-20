import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptSecret,
  decryptSecret,
  hashToken,
  generateBackupCode,
  normalizeBackupCode,
  hashBackupCode,
  pkceChallenge,
  generateSessionToken,
  timingSafeHexEquals,
} from "./auth-crypto.ts";

const KEY = "0123456789abcdef0123456789abcdef";

test("TOTPシークレットは暗号化して復号できる・毎回違う暗号文になる", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const a = encryptSecret(secret, KEY);
  const b = encryptSecret(secret, KEY);

  assert.notEqual(a, b, "IVが毎回変わるので暗号文は一致しない");
  assert.equal(decryptSecret(a, KEY), secret);
  assert.equal(decryptSecret(b, KEY), secret);
  assert.ok(!a.includes(secret), "暗号文に平文が混ざっていないこと");
});

test("鍵が違えば復号できない（GCMの認証タグで落ちる）", () => {
  const payload = encryptSecret("SECRET", KEY);
  assert.throws(() => decryptSecret(payload, "ffffffffffffffffffffffffffffffff"));
});

test("改ざんされた暗号文は復号できない", () => {
  const payload = encryptSecret("SECRET", KEY);
  const parts = payload.split(".");
  const tampered = [parts[0], parts[1], parts[2], Buffer.from("XXXXXX").toString("base64url")].join(".");
  assert.throws(() => decryptSecret(tampered, KEY));
  assert.throws(() => decryptSecret("v2.a.b.c", KEY), /形式が不正/);
});

test("セッショントークンのハッシュは安定・トークン自体は毎回違う", () => {
  const token = generateSessionToken();
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(generateSessionToken(), generateSessionToken());
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
});

test("バックアップコードは読み間違えやすい文字を含まない", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateBackupCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/, code);
    assert.ok(!/[01ILO]/.test(code), `紛らわしい文字が入った: ${code}`);
  }
});

test("バックアップコードは書式の揺れを吸収して同じハッシュになる", () => {
  const code = "ABCD-2345";
  const expected = hashBackupCode(code, KEY);
  for (const variant of ["abcd-2345", "ABCD2345", " ABCD - 2345 ", "abcd 2345"]) {
    assert.equal(hashBackupCode(variant, KEY), expected, variant);
  }
  assert.equal(normalizeBackupCode("abcd-2345"), "ABCD2345");
  assert.notEqual(hashBackupCode("ABCD-2346", KEY), expected);
  assert.notEqual(hashBackupCode(code, "ffffffffffffffffffffffffffffffff"), expected);
});

test("PKCEのチャレンジはRFC 7636の例と一致する", () => {
  // RFC 7636 Appendix B
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(pkceChallenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("定数時間比較", () => {
  assert.equal(timingSafeHexEquals("abc123", "abc123"), true);
  assert.equal(timingSafeHexEquals("abc123", "abc124"), false);
  assert.equal(timingSafeHexEquals("abc123", "abc12"), false);
});
