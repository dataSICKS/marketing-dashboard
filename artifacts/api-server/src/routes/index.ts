import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import newsletterRouter from "./newsletter";
import ltvRouter from "./ltv";
import efoRouter from "./efo";
import clarityRouter from "./clarity";
import campaignsRouter from "./campaigns";
import settingsRouter from "./settings";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

// --- 認証なしで通すもの ---
// ヘルスチェック（Replitの死活監視）とログイン手続きそのもの。
router.use(healthRouter);
router.use(authRouter);

// --- ここから先はすべてログイン必須 ---
// 画面の出し分けだけに頼らず、データ取得・更新APIを**サーバー側で**止める。
// 新しいルートを足したときに保護を忘れないよう、この1行より下に置く。
router.use(requireAuth);

router.use(newsletterRouter);
router.use(ltvRouter);
router.use(efoRouter);
router.use(clarityRouter);
router.use(campaignsRouter);
router.use(settingsRouter);

export default router;
