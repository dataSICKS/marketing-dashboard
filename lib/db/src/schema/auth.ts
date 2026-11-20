import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";

/**
 * ダッシュボードの利用者。
 *
 * 招待制ではなく「確認済みGoogleメールのドメイン」で許可するため、
 * 許可ドメインの初回ログイン時にこの行が作られる（= 自動登録）。
 * 誰を止めるかは `disabled` で個別に落とす。
 *
 * `totp_secret` は平文では置かない。AUTH_ENCRYPTION_KEY から導いた鍵で
 * AES-256-GCM で暗号化した文字列を入れる（auth-crypto.ts）。
 * DBの閲覧権限だけで二要素を突破されないようにするため。
 */
export const dashboardUsers = pgTable(
  "dashboard_users",
  {
    id: text("id").primaryKey(),
    /** 小文字に正規化したGoogleの確認済みメール。 */
    email: text("email").notNull().unique(),
    /** Googleのユーザー識別子（sub）。メール変更に強い本来のキー。 */
    googleSub: text("google_sub"),
    name: text("name"),
    pictureUrl: text("picture_url"),

    /** 暗号化済みTOTPシークレット。登録確定前の仮シークレットもここに入る。 */
    totpSecret: text("totp_secret"),
    /** 6桁コードの検証が一度通った時刻。null = まだ二要素が未完了。 */
    totpEnrolledAt: timestamp("totp_enrolled_at", { withTimezone: true }),
    /** 直近で受理した時間ステップ。同じコードの使い回し（リプレイ）を弾く。 */
    totpLastUsedStep: integer("totp_last_used_step"),

    /** バックアップコードのHMACハッシュ。使ったものは配列から取り除く（使い捨て）。 */
    backupCodeHashes: text("backup_code_hashes").array(),

    /** 連続失敗回数とロック期限。6桁の総当たりを止めるため。 */
    totpFailedCount: integer("totp_failed_count").notNull().default(0),
    totpLockedUntil: timestamp("totp_locked_until", { withTimezone: true }),

    /** 個別の利用停止。ドメインが許可内でもここがtrueならログインさせない。 */
    disabled: boolean("disabled").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [index("dashboard_users_google_sub_idx").on(table.googleSub)],
);

/**
 * ログインセッション。
 *
 * `stage` が2段階ある点が肝。Googleの認証だけ通った状態は `totp_pending` で、
 * これを「ログイン済み」として扱わない（6桁コードが通って初めて `active`）。
 *
 * Cookieに入れるのはランダムなトークンそのもので、DBにはそのSHA-256だけを置く。
 * DBが漏れてもセッションを復元できないようにするため。
 */
export const dashboardSessions = pgTable(
  "dashboard_sessions",
  {
    id: text("id").primaryKey(),
    /** Cookieのトークンのsha256（hex）。トークン本体は保存しない。 */
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id").notNull(),
    /** "totp_pending" | "active" */
    stage: text("stage").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [index("dashboard_sessions_user_id_idx").on(table.userId)],
);

export type DashboardUser = typeof dashboardUsers.$inferSelect;
export type DashboardSession = typeof dashboardSessions.$inferSelect;

/** セッションの段階。`totp_pending` を「ログイン完了」と混同しないため型で分ける。 */
export type SessionStage = "totp_pending" | "active";
