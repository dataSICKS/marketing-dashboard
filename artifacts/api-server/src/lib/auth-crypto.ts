import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/**
 * 認証まわりの暗号処理。node:crypto のみ（依存を足さない）。
 *
 * 用途ごとに鍵を分ける（HKDFのinfoを変える）。
 * 1つの鍵を暗号化とHMACに兼用すると、片方の解析が他方に効いてしまうため。
 */

const HKDF_SALT = "marketing-dashboard/auth/v1";

function derivedKey(masterKey: string, purpose: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(masterKey, "utf8"), HKDF_SALT, purpose, 32),
  );
}

/** Cookieに入れるトークン。これ自体はDBに保存しない。 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** セッションIDなどの内部ID。 */
export function generateId(): string {
  return randomBytes(16).toString("hex");
}

/** DBに保存するのはトークンのハッシュだけ。 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * TOTPシークレットの暗号化（AES-256-GCM）。
 * 形式は `v1.<iv>.<tag>.<暗号文>`（いずれもbase64url）。
 */
export function encryptSecret(plain: string, masterKey: string): string {
  const key = derivedKey(masterKey, "totp-secret");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, masterKey: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("暗号化されたシークレットの形式が不正です");
  }
  const key = derivedKey(masterKey, "totp-secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parts[1], "base64url"),
  );
  decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * バックアップコードの文字集合。
 * 0/O・1/I/L のような読み間違えやすい文字を外してある（紙に書き写す前提）。
 */
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** `XXXX-XXXX` 形式のコードを1本作る。 */
export function generateBackupCode(): string {
  const pick = () =>
    Array.from({ length: 4 }, () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** 入力の揺れ（小文字・ハイフンなし・空白）を吸収する。 */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/** 保存するのはHMACハッシュだけ。平文は発行時に1度表示するのみ。 */
export function hashBackupCode(code: string, masterKey: string): string {
  const key = derivedKey(masterKey, "backup-code");
  return createHmac("sha256", key)
    .update(normalizeBackupCode(code), "utf8")
    .digest("hex");
}

export function timingSafeHexEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** OAuthのstate / PKCEのcode_verifier。 */
export function generateUrlSafeToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** PKCE（S256）のチャレンジ値。 */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}
