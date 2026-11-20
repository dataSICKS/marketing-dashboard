/**
 * セッションの状態判定。**純粋関数だけ**（DBアクセスは auth-store.ts）。
 *
 * ここの要点は「Googleの認証だけ通った状態を active と混同しない」こと。
 * dashboard-access-policy が明示している通り、認証途中は未ログイン扱いにする。
 */

/**
 * セッションと二要素の時間・回数の方針。
 *
 * このファイルに置いてあるのは意図的。実行時importを持たない純粋モジュールに
 * しておくと `node --experimental-strip-types --test` から直接呼べる
 * （Nodeの型除去は `./x.js` を `x.ts` に読み替えないため）。
 */

/** Googleの認証だけ通った状態の寿命。6桁コードを入れるまでの猶予。 */
export const PENDING_SESSION_TTL_MS = 10 * 60 * 1000;
/** 二要素まで通ったセッションの寿命。操作があれば延びる。 */
export const ACTIVE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** 操作があっても、ここを超えたら必ず再ログイン。 */
export const ACTIVE_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** 寿命を延ばす間隔。毎リクエストでUPDATEを撃たないため。 */
export const SESSION_SLIDE_INTERVAL_MS = 30 * 60 * 1000;
/** OAuthの往復（state/PKCE）を持つCookieの寿命。 */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/** 連続失敗の上限とロック時間。6桁の総当たりを止める。 */
export const TOTP_MAX_FAILURES = 5;
export const TOTP_LOCK_MS = 15 * 60 * 1000;
/** 発行するバックアップコードの本数。 */
export const BACKUP_CODE_COUNT = 10;


/** 画面に返す状態。 */
export type AuthState =
  /** Cookieが無い・切れた・失効した。Googleログインから。 */
  | "unauthenticated"
  /** Googleは通ったが、認証アプリをまだ登録していない。 */
  | "totp_setup"
  /** 登録済みで、6桁コードの入力待ち。 */
  | "totp_required"
  /** 二要素まで完了。APIを叩ける唯一の状態。 */
  | "active";

export interface SessionLike {
  stage: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export interface UserLike {
  disabled: boolean;
  totpEnrolledAt: Date | null;
}

export function sessionState(
  session: SessionLike | null,
  user: UserLike | null,
  nowMs: number = Date.now(),
): AuthState {
  if (!session || !user) return "unauthenticated";
  if (user.disabled) return "unauthenticated";
  if (session.revokedAt) return "unauthenticated";
  if (session.expiresAt.getTime() <= nowMs) return "unauthenticated";

  if (session.stage === "active") {
    // 二要素を解除された利用者が active セッションを持ち続けないようにする
    if (!user.totpEnrolledAt) return "totp_setup";
    // 絶対上限を超えたセッションは、操作があっても失効させる
    if (session.createdAt.getTime() + ACTIVE_SESSION_MAX_AGE_MS <= nowMs) {
      return "unauthenticated";
    }
    return "active";
  }

  if (session.stage === "totp_pending") {
    return user.totpEnrolledAt ? "totp_required" : "totp_setup";
  }

  // 知らない stage は信用しない
  return "unauthenticated";
}

/** activeセッションの寿命を延ばすべきか（毎リクエストでUPDATEしないため）。 */
export function shouldSlideSession(
  session: SessionLike,
  nowMs: number = Date.now(),
): boolean {
  if (session.stage !== "active") return false;
  return nowMs - session.lastSeenAt.getTime() >= SESSION_SLIDE_INTERVAL_MS;
}

/**
 * 延長後の期限。作成から ACTIVE_SESSION_MAX_AGE_MS を超えては延ばさない。
 * 操作し続けるだけで無期限にログインできてしまうのを防ぐ。
 */
export function nextExpiry(
  session: SessionLike,
  nowMs: number = Date.now(),
): Date {
  const slid = nowMs + ACTIVE_SESSION_TTL_MS;
  const cap = session.createdAt.getTime() + ACTIVE_SESSION_MAX_AGE_MS;
  return new Date(Math.min(slid, cap));
}

export interface LockLike {
  totpFailedCount: number;
  totpLockedUntil: Date | null;
}

/** 6桁コードの総当たりを止めるロック中かどうか。 */
export function isTotpLocked(
  user: LockLike,
  nowMs: number = Date.now(),
): boolean {
  return Boolean(user.totpLockedUntil && user.totpLockedUntil.getTime() > nowMs);
}

export function totpLockRemainingMs(
  user: LockLike,
  nowMs: number = Date.now(),
): number {
  if (!user.totpLockedUntil) return 0;
  return Math.max(0, user.totpLockedUntil.getTime() - nowMs);
}

/** 失敗を1回積む。上限に達したらロック期限を立てる。 */
export function afterFailure(
  user: LockLike,
  nowMs: number = Date.now(),
): { totpFailedCount: number; totpLockedUntil: Date | null } {
  const count = user.totpFailedCount + 1;
  if (count >= TOTP_MAX_FAILURES) {
    return { totpFailedCount: 0, totpLockedUntil: new Date(nowMs + TOTP_LOCK_MS) };
  }
  return { totpFailedCount: count, totpLockedUntil: user.totpLockedUntil ?? null };
}

/** 成功したら失敗回数とロックを消す。 */
export function afterSuccess(): {
  totpFailedCount: number;
  totpLockedUntil: null;
} {
  return { totpFailedCount: 0, totpLockedUntil: null };
}
