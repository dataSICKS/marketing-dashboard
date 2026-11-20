import test from "node:test";
import assert from "node:assert/strict";
import {
  sessionState,
  shouldSlideSession,
  nextExpiry,
  isTotpLocked,
  totpLockRemainingMs,
  afterFailure,
  afterSuccess,
  ACTIVE_SESSION_TTL_MS,
  ACTIVE_SESSION_MAX_AGE_MS,
  SESSION_SLIDE_INTERVAL_MS,
  TOTP_MAX_FAILURES,
  TOTP_LOCK_MS,
} from "./auth-session.ts";

const NOW = Date.parse("2026-11-20T10:00:00Z");
const MIN = 60 * 1000;

const session = (patch = {}) => ({
  stage: "active",
  createdAt: new Date(NOW - 60 * MIN),
  lastSeenAt: new Date(NOW - 1 * MIN),
  expiresAt: new Date(NOW + 60 * MIN),
  revokedAt: null,
  ...patch,
});

const user = (patch = {}) => ({
  disabled: false,
  totpEnrolledAt: new Date(NOW - 10 * 24 * 60 * MIN),
  ...patch,
});

test("二要素まで通ったセッションだけが active になる", () => {
  assert.equal(sessionState(session(), user(), NOW), "active");
});

test("Googleだけ通った状態は active にしない（方針の中核）", () => {
  // 登録済みなら6桁コードの入力待ち
  assert.equal(
    sessionState(session({ stage: "totp_pending" }), user(), NOW),
    "totp_required",
  );
  // 未登録なら登録画面へ
  assert.equal(
    sessionState(session({ stage: "totp_pending" }), user({ totpEnrolledAt: null }), NOW),
    "totp_setup",
  );
});

test("activeでも二要素が未完了なら登録に戻す", () => {
  assert.equal(
    sessionState(session(), user({ totpEnrolledAt: null }), NOW),
    "totp_setup",
  );
});

test("Cookie無し・失効・期限切れ・停止・未知のstageは未ログイン", () => {
  assert.equal(sessionState(null, user(), NOW), "unauthenticated");
  assert.equal(sessionState(session(), null, NOW), "unauthenticated");
  assert.equal(
    sessionState(session({ revokedAt: new Date(NOW - MIN) }), user(), NOW),
    "unauthenticated",
  );
  assert.equal(
    sessionState(session({ expiresAt: new Date(NOW) }), user(), NOW),
    "unauthenticated",
    "expiresAt が現在時刻ちょうどなら切れている扱い",
  );
  assert.equal(
    sessionState(session({ expiresAt: new Date(NOW - 1) }), user(), NOW),
    "unauthenticated",
  );
  assert.equal(sessionState(session(), user({ disabled: true }), NOW), "unauthenticated");
  assert.equal(
    sessionState(session({ stage: "something_else" }), user(), NOW),
    "unauthenticated",
  );
});

test("作成から30日を超えたactiveセッションは操作中でも失効する", () => {
  const old = session({
    createdAt: new Date(NOW - ACTIVE_SESSION_MAX_AGE_MS - MIN),
    expiresAt: new Date(NOW + 60 * MIN),
  });
  assert.equal(sessionState(old, user(), NOW), "unauthenticated");

  const justInside = session({
    createdAt: new Date(NOW - ACTIVE_SESSION_MAX_AGE_MS + MIN),
  });
  assert.equal(sessionState(justInside, user(), NOW), "active");
});

test("寿命の延長は一定間隔が空いてから・activeのみ", () => {
  assert.equal(shouldSlideSession(session({ lastSeenAt: new Date(NOW - MIN) }), NOW), false);
  assert.equal(
    shouldSlideSession(
      session({ lastSeenAt: new Date(NOW - SESSION_SLIDE_INTERVAL_MS) }),
      NOW,
    ),
    true,
  );
  assert.equal(
    shouldSlideSession(
      session({ stage: "totp_pending", lastSeenAt: new Date(NOW - 10 * 60 * MIN) }),
      NOW,
    ),
    false,
    "二要素前のセッションは延長しない",
  );
});

test("延長しても作成から30日の上限を越えない", () => {
  const fresh = session({ createdAt: new Date(NOW - MIN) });
  assert.equal(nextExpiry(fresh, NOW).getTime(), NOW + ACTIVE_SESSION_TTL_MS);

  const nearCap = session({
    createdAt: new Date(NOW - ACTIVE_SESSION_MAX_AGE_MS + 5 * MIN),
  });
  assert.equal(
    nextExpiry(nearCap, NOW).getTime(),
    nearCap.createdAt.getTime() + ACTIVE_SESSION_MAX_AGE_MS,
    "上限で打ち止めになる",
  );
});

test("連続失敗で上限に達するとロックされる", () => {
  let state = { totpFailedCount: 0, totpLockedUntil: null };
  for (let i = 1; i < TOTP_MAX_FAILURES; i++) {
    state = afterFailure(state, NOW);
    assert.equal(state.totpFailedCount, i);
    assert.equal(state.totpLockedUntil, null, `${i}回目ではまだロックしない`);
    assert.equal(isTotpLocked(state, NOW), false);
  }
  state = afterFailure(state, NOW);
  assert.equal(state.totpFailedCount, 0, "ロック後はカウンタを戻す");
  assert.equal(state.totpLockedUntil.getTime(), NOW + TOTP_LOCK_MS);
  assert.equal(isTotpLocked(state, NOW), true);
  assert.equal(totpLockRemainingMs(state, NOW), TOTP_LOCK_MS);
});

test("ロックは期限が来れば解ける・成功で消える", () => {
  const locked = { totpFailedCount: 0, totpLockedUntil: new Date(NOW + 5 * MIN) };
  assert.equal(isTotpLocked(locked, NOW), true);
  assert.equal(isTotpLocked(locked, NOW + 5 * MIN), false);
  assert.equal(totpLockRemainingMs(locked, NOW + 10 * MIN), 0);

  assert.deepEqual(afterSuccess(), { totpFailedCount: 0, totpLockedUntil: null });
  assert.equal(isTotpLocked({ totpFailedCount: 0, totpLockedUntil: null }, NOW), false);
});
