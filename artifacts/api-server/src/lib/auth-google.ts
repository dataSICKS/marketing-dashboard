import { generateUrlSafeToken, pkceChallenge } from "./auth-crypto.js";
import {
  buildAuthorizeUrl,
  decodeIdTokenPayload,
  validateIdTokenPayload,
  GoogleAuthError,
  type GoogleIdentity,
} from "./auth-identity.js";
import type { AuthConfig } from "./auth-config.js";

/**
 * Google OAuth 2.0（認可コード + PKCE）の実行部分。
 *
 * ID トークンは**Googleのトークンエンドポイントから直接**HTTPSで受け取るので、
 * 署名検証は省いてペイロードを読む（Googleの実装ガイドが認める経路）。
 * ブラウザから渡された id_token を信じる作りには**しない**。
 *
 * 判定ロジックは auth-identity.ts（純粋関数・テスト済み）に置いてある。
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface OauthStart {
  url: string;
  state: string;
  codeVerifier: string;
  nonce: string;
}

export function startGoogleLogin(config: AuthConfig): OauthStart {
  const state = generateUrlSafeToken(24);
  const codeVerifier = generateUrlSafeToken(48);
  const nonce = generateUrlSafeToken(16);

  return {
    url: buildAuthorizeUrl({
      clientId: config.googleClientId,
      redirectUri: config.redirectUri,
      state,
      nonce,
      codeChallenge: pkceChallenge(codeVerifier),
    }),
    state,
    codeVerifier,
    nonce,
  };
}

export async function exchangeCodeForIdentity(
  config: AuthConfig,
  options: { code: string; codeVerifier: string; nonce: string },
): Promise<GoogleIdentity> {
  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    code: options.code,
    code_verifier: options.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new GoogleAuthError(
      "token_exchange_failed",
      `Googleのトークン取得に失敗しました (${response.status})`,
      detail.slice(0, 500),
    );
  }

  const json = (await response.json()) as { id_token?: string };
  if (!json.id_token) {
    throw new GoogleAuthError("no_id_token", "id_tokenが返りませんでした");
  }

  return validateIdTokenPayload(decodeIdTokenPayload(json.id_token), {
    clientId: config.googleClientId,
    nonce: options.nonce,
  });
}

export { GoogleAuthError } from "./auth-identity.js";
export type { GoogleIdentity } from "./auth-identity.js";
