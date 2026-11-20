import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP（RFC 6238 / HMAC-SHA1・30秒・6桁）を node:crypto だけで実装する。
 *
 * 依存を足さないのは意図的。Replitのデプロイが
 * `pnpm install --frozen-lockfile` で走るため、lockを更新できない環境から
 * パッケージを足すとインストールごと失敗する（scripts/post-merge.sh）。
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 時間ステップの幅（秒）。認証アプリの既定値。 */
export const TOTP_PERIOD_SEC = 30;
/** 既定の桁数。 */
export const TOTP_DIGITS = 6;
/**
 * 前後に許す時間ステップ数。
 * 端末の時計ずれを1ステップ（±30秒）だけ許容する。広げるほど総当たりが楽になる。
 */
export const TOTP_WINDOW = 1;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** 小文字・空白・`=`パディングは受け付ける（手入力されるため）。 */
export function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`base32として読めない文字: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

/** 認証アプリに登録する新しいシークレット（160bit）。 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** 現在時刻に対応する時間ステップ。リプレイ防止でDBに保存する値。 */
export function currentStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SEC);
}

/** 指定ステップのコードを計算する（RFC 4226 の切り出し）。 */
export function totpCodeForStep(
  secretBase32: string,
  step: number,
  digits: number = TOTP_DIGITS,
): string {
  const key = base32Decode(secretBase32);
  const counter = Buffer.alloc(8);
  // ステップは64bitビッグエンディアン。上位32bitも埋める（2106年以降も崩れない）。
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const digest = createHmac("sha1", Buffer.from(key)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export interface TotpVerifyResult {
  ok: boolean;
  /** 受理したステップ。DBに保存して同じコードの再利用を弾く。 */
  step?: number;
  /** 使い回し（前回受理したステップ以下）だった場合。 */
  replayed?: boolean;
}

/**
 * コードを検証する。
 *
 * `lastUsedStep` を渡すと、それ以下のステップは受理しない。
 * 30秒の間に同じコードを2回使えると、肩越しに見られたコードで入れてしまうため。
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: {
    nowMs?: number;
    lastUsedStep?: number | null;
    window?: number;
    digits?: number;
  } = {},
): TotpVerifyResult {
  const digits = options.digits ?? TOTP_DIGITS;
  const normalized = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${digits}}$`).test(normalized)) return { ok: false };

  const window = options.window ?? TOTP_WINDOW;
  const base = currentStep(options.nowMs ?? Date.now());

  for (let offset = -window; offset <= window; offset++) {
    const step = base + offset;
    if (step < 0) continue;
    const expected = totpCodeForStep(secretBase32, step, digits);
    if (!constantTimeEquals(expected, normalized)) continue;
    if (options.lastUsedStep != null && step <= options.lastUsedStep) {
      return { ok: false, replayed: true, step };
    }
    return { ok: true, step };
  }
  return { ok: false };
}

/** 長さが違っても早期returnしない比較。 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // 長さが違う時点で不一致だが、比較自体は行って時間差を減らす
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * 認証アプリに読ませるURI。
 * `label` はアプリ上の表示名になるので、どのアカウントか分かるメールを入れる。
 */
export function otpauthUri(options: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = `${options.issuer}:${options.account}`;
  const params = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

/** 手入力しやすいように4文字ずつ区切る。 */
export function formatSecretForDisplay(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(" ");
}
