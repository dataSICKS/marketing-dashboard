import { isDatabaseConfigured } from "@workspace/db";

/**
 * 許可ドメイン。
 *
 * アカウント一覧ではなくドメインで許可する方針（dashboard-access-policy）。
 * **完全一致**で照合する。`sub.abema.tv` や `abema.tv.example.com` は許可しない。
 * 環境変数で上書きできるが、既定値はこの3つ。
 */
const DEFAULT_ALLOWED_DOMAINS = [
  "sicks.co.jp",
  "cyberagent.co.jp",
  "abema.tv",
];

export const SESSION_COOKIE = "md_session";
export const OAUTH_COOKIE = "md_oauth";

/** 認証アプリに表示される名前。 */
export const TOTP_ISSUER = "Mail Analytics";

export interface AuthConfig {
  googleClientId: string;
  googleClientSecret: string;
  /** Google Cloud側に登録したリダイレクトURIと**完全一致**させる必要がある。 */
  redirectUri: string;
  /** TOTPシークレットの暗号化とバックアップコードのHMACに使う。 */
  encryptionKey: string;
  /** Cookie署名用。 */
  cookieSecret: string;
  allowedDomains: string[];
}

/** 未設定の環境変数名。画面にそのまま出して設定漏れを分かるようにする。 */
export function missingAuthEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!process.env.GOOGLE_REDIRECT_URI) missing.push("GOOGLE_REDIRECT_URI");
  if (!process.env.AUTH_ENCRYPTION_KEY) missing.push("AUTH_ENCRYPTION_KEY");
  if (!process.env.AUTH_COOKIE_SECRET) missing.push("AUTH_COOKIE_SECRET");
  if (!isDatabaseConfigured()) missing.push("DATABASE_URL");
  return missing;
}

export function isAuthConfigured(): boolean {
  return missingAuthEnv().length === 0;
}

export function allowedDomains(): string[] {
  const raw = process.env.AUTH_ALLOWED_DOMAINS;
  if (!raw) return DEFAULT_ALLOWED_DOMAINS;
  const parsed = raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_DOMAINS;
}

/**
 * 設定が揃っていなければ例外。呼び出し側は 503 にして
 * 「どの環境変数が無いか」を画面に出す。**開けてしまわない**のが要点。
 */
export function authConfig(): AuthConfig {
  const missing = missingAuthEnv();
  if (missing.length > 0) {
    throw new AuthNotConfiguredError(missing);
  }
  const key = process.env.AUTH_ENCRYPTION_KEY as string;
  if (key.length < 32) {
    throw new AuthNotConfiguredError(["AUTH_ENCRYPTION_KEY（32文字以上）"]);
  }
  return {
    googleClientId: process.env.GOOGLE_CLIENT_ID as string,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    redirectUri: process.env.GOOGLE_REDIRECT_URI as string,
    encryptionKey: key,
    cookieSecret: process.env.AUTH_COOKIE_SECRET as string,
    allowedDomains: allowedDomains(),
  };
}

export class AuthNotConfiguredError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`認証の設定が足りません: ${missing.join(", ")}`);
    this.name = "AuthNotConfiguredError";
    this.missing = missing;
  }
}

/**
 * Cookie署名用のシークレット。未設定でも**起動は通す**ために
 * プロセスごとのランダム値にフォールバックする（= 再起動でCookieが無効になる）。
 * 認証自体は isAuthConfigured() が false の間すべて 503 で止まる。
 */
export function cookieSecretOrEphemeral(): string {
  return process.env.AUTH_COOKIE_SECRET ?? ephemeralSecret;
}

const ephemeralSecret = `ephemeral-${Math.random().toString(36).slice(2)}-${Date.now()}`;

/** 本番（https）でだけ Secure 属性を付ける。ローカルhttpでも動かせるように。 */
export function cookieSecure(): boolean {
  if (process.env.AUTH_COOKIE_INSECURE === "true") return false;
  return (process.env.GOOGLE_REDIRECT_URI ?? "").startsWith("https://");
}

/**
 * ログイン後に戻す先。
 * 既定では GOOGLE_REDIRECT_URI からコールバックのパスを削って求める。
 * ダッシュボードをサブパスで配信している場合は APP_BASE_URL で上書きする。
 */
export function appBaseUrl(): string {
  const override = process.env.APP_BASE_URL;
  if (override) return override.replace(/\/+$/, "");
  const redirect = process.env.GOOGLE_REDIRECT_URI ?? "";
  return redirect
    .replace(/\/api\/auth\/google\/callback\/?$/, "")
    .replace(/\/+$/, "");
}
