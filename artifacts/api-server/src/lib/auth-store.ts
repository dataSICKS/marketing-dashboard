import { and, eq, sql } from "drizzle-orm";
import {
  getDb,
  dashboardSessions,
  dashboardUsers,
  type DashboardSession,
  type DashboardUser,
} from "@workspace/db";
import {
  generateId,
  generateSessionToken,
  hashToken,
} from "./auth-crypto.js";
import type { GoogleIdentity } from "./auth-identity.js";
import type { SessionStage } from "@workspace/db";

/**
 * 認証データの読み書き。判定ロジックは持たない（auth-session.ts / auth-identity.ts）。
 *
 * 置き場はReplitのPostgres（DATABASE_URL）。分析データのSupabaseとは分ける。
 * セッションとTOTPシークレットは運用データで、集計データと混ぜたくないため。
 * テーブルは `pnpm --filter db push`（post-merge.shが実行）で作られる。
 */

export interface SessionWithUser {
  session: DashboardSession;
  user: DashboardUser;
}

/**
 * 許可ドメインの利用者を取得、無ければ作る。
 *
 * ドメイン判定は**呼び出し側で済ませてから**渡すこと（この関数は作るだけ）。
 */
export async function upsertUserFromGoogle(
  identity: GoogleIdentity,
): Promise<DashboardUser> {
  const db = getDb();
  const existing = await db
    .select()
    .from(dashboardUsers)
    .where(eq(dashboardUsers.email, identity.email))
    .limit(1);

  if (existing.length > 0) {
    const updated = await db
      .update(dashboardUsers)
      .set({
        googleSub: identity.sub,
        name: identity.name,
        pictureUrl: identity.picture,
        lastLoginAt: new Date(),
      })
      .where(eq(dashboardUsers.id, existing[0].id))
      .returning();
    return updated[0];
  }

  const inserted = await db
    .insert(dashboardUsers)
    .values({
      id: generateId(),
      email: identity.email,
      googleSub: identity.sub,
      name: identity.name,
      pictureUrl: identity.picture,
      lastLoginAt: new Date(),
    })
    .returning();
  return inserted[0];
}

export async function getUserById(id: string): Promise<DashboardUser | null> {
  const rows = await getDb()
    .select()
    .from(dashboardUsers)
    .where(eq(dashboardUsers.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Cookieに入れる生トークンを返す。DBにはそのハッシュだけが入る。 */
export async function createSession(options: {
  userId: string;
  stage: SessionStage;
  ttlMs: number;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; session: DashboardSession }> {
  const token = generateSessionToken();
  const now = new Date();
  const rows = await getDb()
    .insert(dashboardSessions)
    .values({
      id: generateId(),
      tokenHash: hashToken(token),
      userId: options.userId,
      stage: options.stage,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + options.ttlMs),
      ip: options.ip ?? null,
      userAgent: options.userAgent?.slice(0, 500) ?? null,
    })
    .returning();
  return { token, session: rows[0] };
}

export async function loadSessionByToken(
  token: string,
): Promise<SessionWithUser | null> {
  const rows = await getDb()
    .select({ session: dashboardSessions, user: dashboardUsers })
    .from(dashboardSessions)
    .innerJoin(dashboardUsers, eq(dashboardUsers.id, dashboardSessions.userId))
    .where(eq(dashboardSessions.tokenHash, hashToken(token)))
    .limit(1);
  return rows[0] ?? null;
}

/** 6桁コードが通ったときに呼ぶ。ここで初めて「ログイン済み」になる。 */
export async function activateSession(
  sessionId: string,
  expiresAt: Date,
): Promise<void> {
  await getDb()
    .update(dashboardSessions)
    .set({ stage: "active", expiresAt, lastSeenAt: new Date() })
    .where(eq(dashboardSessions.id, sessionId));
}

export async function slideSession(
  sessionId: string,
  expiresAt: Date,
): Promise<void> {
  await getDb()
    .update(dashboardSessions)
    .set({ expiresAt, lastSeenAt: new Date() })
    .where(eq(dashboardSessions.id, sessionId));
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getDb()
    .update(dashboardSessions)
    .set({ revokedAt: new Date() })
    .where(eq(dashboardSessions.id, sessionId));
}

/** シークレットを作り直したときなど、その利用者の全セッションを切る。 */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await getDb()
    .update(dashboardSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(dashboardSessions.userId, userId),
        sql`${dashboardSessions.revokedAt} is null`,
      ),
    );
}

/**
 * 登録手続き中の仮シークレットを保存する。
 * `totpEnrolledAt` は触らない（6桁コードが通るまで未完了のまま）。
 */
export async function setProvisionalTotpSecret(
  userId: string,
  encryptedSecret: string,
): Promise<void> {
  await getDb()
    .update(dashboardUsers)
    .set({
      totpSecret: encryptedSecret,
      totpEnrolledAt: null,
      totpLastUsedStep: null,
    })
    .where(eq(dashboardUsers.id, userId));
}

export async function markTotpEnrolled(
  userId: string,
  step: number,
  backupCodeHashes: string[],
): Promise<void> {
  await getDb()
    .update(dashboardUsers)
    .set({
      totpEnrolledAt: new Date(),
      totpLastUsedStep: step,
      backupCodeHashes,
      totpFailedCount: 0,
      totpLockedUntil: null,
    })
    .where(eq(dashboardUsers.id, userId));
}

export async function recordTotpSuccess(
  userId: string,
  step: number,
): Promise<void> {
  await getDb()
    .update(dashboardUsers)
    .set({ totpLastUsedStep: step, totpFailedCount: 0, totpLockedUntil: null })
    .where(eq(dashboardUsers.id, userId));
}

export async function applyLockState(
  userId: string,
  state: { totpFailedCount: number; totpLockedUntil: Date | null },
): Promise<void> {
  await getDb()
    .update(dashboardUsers)
    .set(state)
    .where(eq(dashboardUsers.id, userId));
}

export async function replaceBackupCodes(
  userId: string,
  hashes: string[],
): Promise<void> {
  await getDb()
    .update(dashboardUsers)
    .set({ backupCodeHashes: hashes })
    .where(eq(dashboardUsers.id, userId));
}

/**
 * バックアップコードを1本使う。
 *
 * 「読んで確認 → 書き戻す」に分けると、同じコードを同時に2回使えてしまう。
 * `array_remove` を条件付きUPDATEで1文にして、消せた行が返ったときだけ成功とする。
 */
export async function consumeBackupCode(
  userId: string,
  hash: string,
): Promise<boolean> {
  const rows = await getDb()
    .update(dashboardUsers)
    .set({
      backupCodeHashes: sql`array_remove(${dashboardUsers.backupCodeHashes}, ${hash})`,
      totpFailedCount: 0,
      totpLockedUntil: null,
    })
    .where(
      and(
        eq(dashboardUsers.id, userId),
        sql`${hash} = any(${dashboardUsers.backupCodeHashes})`,
      ),
    )
    .returning({ id: dashboardUsers.id });
  return rows.length > 0;
}
