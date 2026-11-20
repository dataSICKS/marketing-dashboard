import { Router, type IRouter, type Request, type Response } from "express";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  TOTP_ISSUER,
  appBaseUrl,
  authConfig,
  allowedDomains,
  cookieSecure,
  isAuthConfigured,
  missingAuthEnv,
  AuthNotConfiguredError,
} from "../lib/auth-config.js";
import {
  ACTIVE_SESSION_TTL_MS,
  BACKUP_CODE_COUNT,
  OAUTH_STATE_TTL_MS,
  PENDING_SESSION_TTL_MS,
  TOTP_MAX_FAILURES,
  afterFailure,
  isTotpLocked,
  totpLockRemainingMs,
} from "../lib/auth-session.js";
import {
  clearSessionCookie,
  resolveAuth,
  respondNotConfigured,
  setSessionCookie,
} from "../lib/auth-request.js";
import {
  decryptSecret,
  encryptSecret,
  generateBackupCode,
  hashBackupCode,
} from "../lib/auth-crypto.js";
import {
  generateTotpSecret,
  otpauthUri,
  formatSecretForDisplay,
  verifyTotp,
} from "../lib/auth-totp.js";
import { exchangeCodeForIdentity, startGoogleLogin } from "../lib/auth-google.js";
import { GoogleAuthError, isAllowedEmail } from "../lib/auth-identity.js";
import {
  activateSession,
  applyLockState,
  consumeBackupCode,
  createSession,
  markTotpEnrolled,
  recordTotpSuccess,
  replaceBackupCodes,
  revokeAllSessionsForUser,
  revokeSession,
  setProvisionalTotpSecret,
  upsertUserFromGoogle,
} from "../lib/auth-store.js";

const router: IRouter = Router();

/** ログイン画面に出す情報。未認証でも返す（設定漏れを画面で分かるようにするため）。 */
router.get("/auth/config", (_req, res): void => {
  res.json({
    configured: isAuthConfigured(),
    missing: missingAuthEnv(),
    allowedDomains: allowedDomains(),
  });
});

/**
 * 現在の状態。画面はこれを見てログイン画面／6桁コード入力／本体を出し分ける。
 * `state` が "active" でない限り、利用者情報は最小限しか返さない。
 */
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!isAuthConfigured()) {
    respondNotConfigured(res);
    return;
  }
  try {
    const { state, user } = await resolveAuth(req);
    res.json({
      state,
      email: user?.email ?? null,
      name: user?.name ?? null,
      pictureUrl: state === "active" ? (user?.pictureUrl ?? null) : null,
      totpEnrolled: Boolean(user?.totpEnrolledAt),
      backupCodesRemaining:
        state === "active" ? (user?.backupCodeHashes?.length ?? 0) : null,
      lockedForSeconds: user
        ? Math.ceil(totpLockRemainingMs(user) / 1000)
        : 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to read auth state");
    res.status(503).json({ error: "認証の確認に失敗しました", code: "auth_unavailable" });
  }
});

/** Googleの同意画面へ飛ばす。state と PKCE の verifier は署名付きCookieに置く。 */
router.get("/auth/google/start", (req, res): void => {
  let config;
  try {
    config = authConfig();
  } catch (err) {
    if (err instanceof AuthNotConfiguredError) {
      respondNotConfigured(res);
      return;
    }
    throw err;
  }

  const start = startGoogleLogin(config);
  res.cookie(
    OAUTH_COOKIE,
    JSON.stringify({ s: start.state, v: start.codeVerifier, n: start.nonce }),
    {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      path: "/",
      signed: true,
      maxAge: OAUTH_STATE_TTL_MS,
    },
  );
  res.redirect(start.url);
});

function loginRedirect(res: Response, params?: Record<string, string>): void {
  const base = appBaseUrl();
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  res.redirect(`${base}/${query}`);
}

/**
 * Googleからの戻り。ここで作るのは **totp_pending** のセッションであって、
 * ログイン完了ではない（6桁コードが通るまでAPIは叩けない）。
 */
router.get("/auth/google/callback", async (req, res): Promise<void> => {
  let config;
  try {
    config = authConfig();
  } catch (err) {
    if (err instanceof AuthNotConfiguredError) {
      respondNotConfigured(res);
      return;
    }
    throw err;
  }

  const clearOauthCookie = () => {
    // 応答を返したあとに触ると二次エラーになるので守る
    if (res.headersSent) return;
    res.clearCookie(OAUTH_COOKIE, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      path: "/",
    });
  };

  try {
    if (typeof req.query.error === "string") {
      // 利用者が同意画面でキャンセルした場合など
      clearOauthCookie();
      loginRedirect(res, { auth_error: "cancelled" });
      return;
    }

    const raw = req.signedCookies?.[OAUTH_COOKIE];
    if (typeof raw !== "string") {
      clearOauthCookie();
      loginRedirect(res, { auth_error: "state_missing" });
      return;
    }
    const saved = JSON.parse(raw) as { s?: string; v?: string; n?: string };
    const code = req.query.code;
    const state = req.query.state;

    if (
      typeof code !== "string" ||
      typeof state !== "string" ||
      !saved.s ||
      !saved.v ||
      !saved.n ||
      state !== saved.s
    ) {
      clearOauthCookie();
      loginRedirect(res, { auth_error: "state_mismatch" });
      return;
    }

    const identity = await exchangeCodeForIdentity(config, {
      code,
      codeVerifier: saved.v,
      nonce: saved.n,
    });

    if (!isAllowedEmail(identity.email, config.allowedDomains)) {
      req.log.warn(
        { email: identity.email },
        "Rejected sign-in from a domain that is not allowed",
      );
      clearOauthCookie();
      loginRedirect(res, { auth_error: "domain_not_allowed" });
      return;
    }

    const user = await upsertUserFromGoogle(identity);
    if (user.disabled) {
      clearOauthCookie();
      loginRedirect(res, { auth_error: "disabled" });
      return;
    }

    const { token } = await createSession({
      userId: user.id,
      stage: "totp_pending",
      ttlMs: PENDING_SESSION_TTL_MS,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });

    clearOauthCookie();
    setSessionCookie(res, token, PENDING_SESSION_TTL_MS);
    loginRedirect(res);
  } catch (err) {
    clearOauthCookie();
    if (err instanceof GoogleAuthError) {
      req.log.error({ code: err.code, detail: err.detail }, "Google sign-in failed");
      loginRedirect(res, { auth_error: err.code });
      return;
    }
    req.log.error({ err }, "Unexpected failure during Google sign-in");
    loginRedirect(res, { auth_error: "unexpected" });
  }
});

/**
 * 認証アプリの登録を始める。シークレットを作って**仮**で保存し、URIを返す。
 * 6桁コードが通るまで `totpEnrolledAt` は立てない。
 */
router.post("/auth/totp/enroll", async (req, res): Promise<void> => {
  if (!isAuthConfigured()) {
    respondNotConfigured(res);
    return;
  }
  try {
    const config = authConfig();
    const { state, user } = await resolveAuth(req);
    if (!user || (state !== "totp_setup" && state !== "totp_required")) {
      res.status(401).json({ error: "ログインが必要です", code: "unauthenticated", state });
      return;
    }
    if (user.totpEnrolledAt) {
      res.status(409).json({
        error: "すでに認証アプリが登録されています",
        code: "already_enrolled",
      });
      return;
    }

    const secret = generateTotpSecret();
    await setProvisionalTotpSecret(user.id, encryptSecret(secret, config.encryptionKey));

    res.json({
      secret,
      secretFormatted: formatSecretForDisplay(secret),
      otpauthUri: otpauthUri({ secret, account: user.email, issuer: TOTP_ISSUER }),
      issuer: TOTP_ISSUER,
      account: user.email,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to start TOTP enrollment");
    res.status(500).json({ error: "認証アプリの登録を開始できませんでした" });
  }
});

/**
 * 6桁コードの検証。
 * 初回（登録手続き中）に通ったときだけ、バックアップコードを**1度だけ**返す。
 */
router.post("/auth/totp/verify", async (req, res): Promise<void> => {
  if (!isAuthConfigured()) {
    respondNotConfigured(res);
    return;
  }
  try {
    const config = authConfig();
    const { state, session, user } = await resolveAuth(req);
    if (!user || !session || (state !== "totp_setup" && state !== "totp_required")) {
      res.status(401).json({ error: "ログインが必要です", code: "unauthenticated", state });
      return;
    }
    if (isTotpLocked(user)) {
      res.status(429).json({
        error: "失敗が続いたため一時的にロックされています",
        code: "locked",
        retryAfterSeconds: Math.ceil(totpLockRemainingMs(user) / 1000),
      });
      return;
    }
    if (!user.totpSecret) {
      res.status(409).json({
        error: "認証アプリの登録が始まっていません",
        code: "not_enrolling",
      });
      return;
    }

    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const secret = decryptSecret(user.totpSecret, config.encryptionKey);
    const result = verifyTotp(secret, code, { lastUsedStep: user.totpLastUsedStep });

    if (!result.ok || result.step === undefined) {
      const lock = afterFailure(user);
      await applyLockState(user.id, lock);
      res.status(401).json({
        error: result.replayed
          ? "そのコードは使用済みです。次のコードを待ってください"
          : "コードが一致しません",
        code: result.replayed ? "code_reused" : "code_invalid",
        remainingAttempts: lock.totpLockedUntil
          ? 0
          : Math.max(0, TOTP_MAX_FAILURES - lock.totpFailedCount),
      });
      return;
    }

    const firstTime = !user.totpEnrolledAt;
    let backupCodes: string[] | undefined;

    if (firstTime) {
      backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
      await markTotpEnrolled(
        user.id,
        result.step,
        backupCodes.map((c) => hashBackupCode(c, config.encryptionKey)),
      );
    } else {
      // 失敗回数とロックは recordTotpSuccess 側で消える
      await recordTotpSuccess(user.id, result.step);
    }

    const expiresAt = new Date(Date.now() + ACTIVE_SESSION_TTL_MS);
    await activateSession(session.id, expiresAt);
    // pending の短い寿命で発行したCookieを、本来の寿命に貼り替える
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") {
      setSessionCookie(res, token, ACTIVE_SESSION_TTL_MS);
    }

    res.json({ state: "active", backupCodes: backupCodes ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to verify TOTP code");
    res.status(500).json({ error: "コードの確認に失敗しました" });
  }
});

/** 認証アプリが使えないときの入口。コードは使い捨て。 */
router.post("/auth/backup-code/verify", async (req, res): Promise<void> => {
  if (!isAuthConfigured()) {
    respondNotConfigured(res);
    return;
  }
  try {
    const config = authConfig();
    const { state, session, user } = await resolveAuth(req);
    if (!user || !session || state !== "totp_required") {
      res.status(401).json({ error: "ログインが必要です", code: "unauthenticated", state });
      return;
    }
    if (isTotpLocked(user)) {
      res.status(429).json({
        error: "失敗が続いたため一時的にロックされています",
        code: "locked",
        retryAfterSeconds: Math.ceil(totpLockRemainingMs(user) / 1000),
      });
      return;
    }

    const input = typeof req.body?.code === "string" ? req.body.code : "";
    const consumed = await consumeBackupCode(
      user.id,
      hashBackupCode(input, config.encryptionKey),
    );

    if (!consumed) {
      const lock = afterFailure(user);
      await applyLockState(user.id, lock);
      res.status(401).json({
        error: "バックアップコードが一致しません",
        code: "code_invalid",
      });
      return;
    }

    const expiresAt = new Date(Date.now() + ACTIVE_SESSION_TTL_MS);
    await activateSession(session.id, expiresAt);
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") {
      setSessionCookie(res, token, ACTIVE_SESSION_TTL_MS);
    }

    const remaining = (user.backupCodeHashes?.length ?? 1) - 1;
    res.json({ state: "active", backupCodesRemaining: Math.max(0, remaining) });
  } catch (err) {
    req.log.error({ err }, "Failed to verify backup code");
    res.status(500).json({ error: "バックアップコードの確認に失敗しました" });
  }
});

/** 使い切った／漏れた場合の作り直し。ログイン済みのみ。 */
router.post("/auth/backup-codes/regenerate", async (req, res): Promise<void> => {
  if (!isAuthConfigured()) {
    respondNotConfigured(res);
    return;
  }
  try {
    const config = authConfig();
    const { state, user } = await resolveAuth(req);
    if (!user || state !== "active") {
      res.status(401).json({ error: "ログインが必要です", code: "unauthenticated", state });
      return;
    }
    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
    await replaceBackupCodes(
      user.id,
      backupCodes.map((c) => hashBackupCode(c, config.encryptionKey)),
    );
    res.json({ backupCodes });
  } catch (err) {
    req.log.error({ err }, "Failed to regenerate backup codes");
    res.status(500).json({ error: "バックアップコードを作り直せませんでした" });
  }
});

/** ログアウト。他の端末も切りたい場合は all=true。 */
router.post("/auth/logout", async (req, res): Promise<void> => {
  try {
    const { session, user } = await resolveAuth(req);
    if (session) {
      if (req.body?.all === true && user) {
        await revokeAllSessionsForUser(user.id);
      } else {
        await revokeSession(session.id);
      }
    }
  } catch (err) {
    req.log.error({ err }, "Failed to revoke session on logout");
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
