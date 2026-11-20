/**
 * Googleから受け取った素性の検証と、許可ドメインの判定。
 *
 * **このファイルは node: も他モジュールも実行時importしない**（型importのみ）。
 * 純粋関数だけに保ってテストから直接呼べるようにしてある。
 * 乱数やHTTPを使う部分は auth-google.ts 側。
 */

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const VALID_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export interface AuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  /** PKCE の S256 チャレンジ。code_verifier 自体はURLに載せない。 */
  codeChallenge: string;
}

export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    // 毎回アカウントを選ばせる。共有端末で前の人のセッションに入らないようにする。
    prompt: "select_account",
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  /** Workspaceのドメイン（あれば）。判定にはメールのドメインを使う。 */
  hd: string | null;
}

export interface IdTokenPayload {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  hd?: string;
  exp?: number;
  nonce?: string;
}

export function decodeIdTokenPayload(idToken: string): IdTokenPayload {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_tokenの形式が不正です");
  return JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  ) as IdTokenPayload;
}

/**
 * ペイロードの素性を確かめる。
 * 発行者・宛先(aud)・期限・nonce・メール確認済みのどれか1つでも欠けていたら通さない。
 */
export function validateIdTokenPayload(
  payload: IdTokenPayload,
  options: { clientId: string; nonce: string; nowMs?: number },
): GoogleIdentity {
  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);

  if (!payload.iss || !VALID_ISSUERS.includes(payload.iss)) {
    throw new GoogleAuthError("invalid_issuer", "id_tokenの発行者が不正です");
  }
  if (payload.aud !== options.clientId) {
    throw new GoogleAuthError("invalid_audience", "id_tokenの宛先が一致しません");
  }
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new GoogleAuthError("expired", "id_tokenの有効期限が切れています");
  }
  if (payload.nonce !== options.nonce) {
    throw new GoogleAuthError("nonce_mismatch", "nonceが一致しません");
  }
  const verified =
    payload.email_verified === true || payload.email_verified === "true";
  if (!payload.email || !verified) {
    throw new GoogleAuthError(
      "email_unverified",
      "確認済みのメールアドレスが取得できませんでした",
    );
  }
  if (!payload.sub) {
    throw new GoogleAuthError("no_subject", "ユーザー識別子が取得できませんでした");
  }

  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    hd: payload.hd ? payload.hd.trim().toLowerCase() : null,
  };
}

/**
 * メールのドメインが許可リストにあるか。**完全一致のみ**。
 * `abema.tv` を許可しても `sub.abema.tv` や `notabema.tv` は通らない。
 */
export function isAllowedEmail(
  email: string,
  allowedDomains: string[],
): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return allowedDomains.some((allowed) => allowed.trim().toLowerCase() === domain);
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

export class GoogleAuthError extends Error {
  readonly code: string;
  readonly detail?: string;
  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
    this.detail = detail;
  }
}
