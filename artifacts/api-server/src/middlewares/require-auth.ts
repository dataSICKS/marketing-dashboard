import type { NextFunction, Request, Response } from "express";
import {
  resolveAuth,
  respondNotConfigured,
  authIsConfigured,
} from "../lib/auth-request.js";
import { logger } from "../lib/logger.js";
import type { DashboardSession, DashboardUser } from "@workspace/db";

declare module "express-serve-static-core" {
  interface Request {
    auth?: { session: DashboardSession; user: DashboardUser };
  }
}

/**
 * データ取得・更新APIの門。**二要素まで通ったセッション以外は通さない。**
 *
 * 設定が足りない場合は 503 で止める（開けない）。
 * 認証を未設定のまま「とりあえず全員通す」にすると、保護されていないことに
 * 誰も気付かないため。
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!authIsConfigured()) {
    respondNotConfigured(res);
    return;
  }

  try {
    const resolved = await resolveAuth(req);
    if (resolved.state !== "active" || !resolved.session || !resolved.user) {
      res.status(401).json({
        error: "ログインが必要です",
        code: "unauthenticated",
        state: resolved.state,
      });
      return;
    }
    req.auth = { session: resolved.session, user: resolved.user };
    next();
  } catch (err) {
    logger.error({ err }, "Failed to resolve authentication");
    res.status(503).json({
      error: "認証の確認に失敗しました",
      code: "auth_unavailable",
    });
  }
}
