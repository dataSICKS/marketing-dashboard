import type { Request, Response } from "express";
import {
  SESSION_COOKIE,
  cookieSecure,
  isAuthConfigured,
  missingAuthEnv,
} from "./auth-config.js";
import {
  sessionState,
  shouldSlideSession,
  nextExpiry,
  type AuthState,
} from "./auth-session.js";
import { loadSessionByToken, slideSession } from "./auth-store.js";
import type { DashboardSession, DashboardUser } from "@workspace/db";

/**
 * リクエストから認証状態を取り出す共通処理。
 *
 * 判定そのものは auth-session.ts の純粋関数に任せ、ここは
 * 「Cookieを読む・DBを引く・寿命を延ばす」だけを持つ。
 */

export interface ResolvedAuth {
  state: AuthState;
  session: DashboardSession | null;
  user: DashboardUser | null;
}

const UNAUTHENTICATED: ResolvedAuth = {
  state: "unauthenticated",
  session: null,
  user: null,
};

export async function resolveAuth(req: Request): Promise<ResolvedAuth> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) return UNAUTHENTICATED;

  const found = await loadSessionByToken(token);
  if (!found) return UNAUTHENTICATED;

  const state = sessionState(found.session, found.user);
  if (state === "unauthenticated") return UNAUTHENTICATED;

  // 操作があったら期限を延ばす（間隔を空けて最小限のUPDATEにする）
  if (state === "active" && shouldSlideSession(found.session)) {
    const expiresAt = nextExpiry(found.session);
    await slideSession(found.session.id, expiresAt);
    found.session.expiresAt = expiresAt;
  }

  return { state, session: found.session, user: found.user };
}

export function setSessionCookie(
  res: Response,
  token: string,
  maxAgeMs: number,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    // Lax にしておくと、他サイトからのPOSTにCookieが付かない（CSRF対策）。
    // Googleからのリダイレクト（GET）では送られるので認証の往復は通る。
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
  });
}

/**
 * 設定が足りないときの応答。
 * **開けてしまわず**、どの環境変数が無いかを返して設定漏れを分かるようにする。
 */
export function respondNotConfigured(res: Response): void {
  res.status(503).json({
    error: "認証が未設定のため、ダッシュボードを開けません",
    code: "auth_not_configured",
    missing: missingAuthEnv(),
  });
}

export function authIsConfigured(): boolean {
  return isAuthConfigured();
}
