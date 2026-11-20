import test from "node:test";
import assert from "node:assert/strict";
import {
  base32Encode,
  base32Decode,
  totpCodeForStep,
  verifyTotp,
  currentStep,
  otpauthUri,
  formatSecretForDisplay,
  constantTimeEquals,
  TOTP_PERIOD_SEC,
} from "./auth-totp.ts";

/** RFC 6238 のテストベクタで使われる共有鍵（ASCII "12345678901234567890"）。 */
const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("base32: RFC 4648 のエンコード結果が既知の値と一致する", () => {
  assert.equal(
    base32Encode(Buffer.from(RFC_SECRET_ASCII, "ascii")),
    RFC_SECRET_BASE32,
  );
  assert.equal(base32Encode(Buffer.from("f")), "MY======".replace(/=+$/, ""));
  assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
});

test("base32: デコードは往復する・小文字と区切りを許す", () => {
  assert.equal(
    Buffer.from(base32Decode(RFC_SECRET_BASE32)).toString("ascii"),
    RFC_SECRET_ASCII,
  );
  assert.equal(
    Buffer.from(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq")).toString("ascii"),
    RFC_SECRET_ASCII,
  );
  assert.equal(Buffer.from(base32Decode("MZXW6YTBOI")).toString("ascii"), "foobar");
  assert.throws(() => base32Decode("MZXW6YTBO1"), /base32として読めない文字/);
});

/**
 * RFC 6238 Appendix B（SHA-1）の8桁ベクタ。
 * 6桁は同じ値の下6桁になる（切り出しが 10^digits の剰余なので）。
 */
const RFC_VECTORS = [
  { time: 59, code8: "94287082" },
  { time: 1111111109, code8: "07081804" },
  { time: 1111111111, code8: "14050471" },
  { time: 1234567890, code8: "89005924" },
  { time: 2000000000, code8: "69279037" },
  { time: 20000000000, code8: "65353130" },
];

test("TOTP: RFC 6238 のテストベクタと一致する（8桁・6桁）", () => {
  for (const { time, code8 } of RFC_VECTORS) {
    const step = Math.floor(time / TOTP_PERIOD_SEC);
    assert.equal(
      totpCodeForStep(RFC_SECRET_BASE32, step, 8),
      code8,
      `T=${time} の8桁コード`,
    );
    assert.equal(
      totpCodeForStep(RFC_SECRET_BASE32, step, 6),
      code8.slice(-6),
      `T=${time} の6桁コード`,
    );
  }
});

test("TOTP: 2106年以降のステップでも上位32bitが落ちない", () => {
  // T=20000000000 はステップが 2^29 程度だが、上位32bitを使うケースも崩れないこと
  const bigStep = 2 ** 32 + 12345;
  assert.match(totpCodeForStep(RFC_SECRET_BASE32, bigStep, 6), /^\d{6}$/);
  assert.notEqual(
    totpCodeForStep(RFC_SECRET_BASE32, bigStep, 6),
    totpCodeForStep(RFC_SECRET_BASE32, 12345, 6),
  );
});

test("verifyTotp: 現在のコードは通る・1つ違えば落ちる", () => {
  const nowMs = 1111111109 * 1000;
  const step = currentStep(nowMs);
  const code = totpCodeForStep(RFC_SECRET_BASE32, step);

  assert.deepEqual(verifyTotp(RFC_SECRET_BASE32, code, { nowMs }), {
    ok: true,
    step,
  });
  assert.equal(verifyTotp(RFC_SECRET_BASE32, "000000", { nowMs }).ok, false);
});

test("verifyTotp: 前後1ステップ（±30秒）までは受理する", () => {
  const nowMs = 1111111109 * 1000;
  const step = currentStep(nowMs);
  for (const offset of [-1, 0, 1]) {
    const code = totpCodeForStep(RFC_SECRET_BASE32, step + offset);
    const result = verifyTotp(RFC_SECRET_BASE32, code, { nowMs });
    assert.equal(result.ok, true, `offset=${offset} は通るべき`);
    assert.equal(result.step, step + offset);
  }
  // 2ステップ離れたら落ちる
  const far = totpCodeForStep(RFC_SECRET_BASE32, step + 2);
  assert.equal(verifyTotp(RFC_SECRET_BASE32, far, { nowMs }).ok, false);
});

test("verifyTotp: 一度使ったステップ以下は使い回しとして弾く", () => {
  const nowMs = 1111111109 * 1000;
  const step = currentStep(nowMs);
  const code = totpCodeForStep(RFC_SECRET_BASE32, step);

  const first = verifyTotp(RFC_SECRET_BASE32, code, { nowMs });
  assert.equal(first.ok, true);

  const second = verifyTotp(RFC_SECRET_BASE32, code, {
    nowMs,
    lastUsedStep: first.step,
  });
  assert.equal(second.ok, false);
  assert.equal(second.replayed, true);

  // 次のステップのコードなら通る
  const next = totpCodeForStep(RFC_SECRET_BASE32, step + 1);
  assert.equal(
    verifyTotp(RFC_SECRET_BASE32, next, { nowMs, lastUsedStep: first.step }).ok,
    true,
  );
});

test("verifyTotp: 桁数・書式が違う入力は検証前に落とす", () => {
  const nowMs = 1111111109 * 1000;
  for (const bad of ["", "12345", "1234567", "abcdef", "12 34 5"]) {
    assert.equal(verifyTotp(RFC_SECRET_BASE32, bad, { nowMs }).ok, false, bad);
  }
  // 空白は取り除いて評価する
  const code = totpCodeForStep(RFC_SECRET_BASE32, currentStep(nowMs));
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  assert.equal(verifyTotp(RFC_SECRET_BASE32, spaced, { nowMs }).ok, true);
});

test("otpauthUri: 認証アプリが読む形になっている", () => {
  const uri = otpauthUri({
    secret: RFC_SECRET_BASE32,
    account: "tomoki.yamamoto@sicks.co.jp",
    issuer: "Mail Analytics",
  });
  assert.ok(uri.startsWith("otpauth://totp/"));
  assert.ok(uri.includes(encodeURIComponent("Mail Analytics:tomoki.yamamoto@sicks.co.jp")));
  assert.ok(uri.includes(`secret=${RFC_SECRET_BASE32}`));
  assert.ok(uri.includes("digits=6"));
  assert.ok(uri.includes("period=30"));
  assert.ok(uri.includes("algorithm=SHA1"));
});

test("表示用の整形と定数時間比較", () => {
  assert.equal(formatSecretForDisplay("ABCDEFGH"), "ABCD EFGH");
  assert.equal(formatSecretForDisplay("ABCDE"), "ABCD E");
  assert.equal(constantTimeEquals("123456", "123456"), true);
  assert.equal(constantTimeEquals("123456", "123457"), false);
  assert.equal(constantTimeEquals("123456", "12345"), false);
});
