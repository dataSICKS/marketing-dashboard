import { Router, type IRouter } from "express";
import healthRouter from "./health";
import newsletterRouter from "./newsletter";
import efoRouter from "./efo";
import clarityRouter from "./clarity";
import campaignsRouter from "./campaigns";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(newsletterRouter);
router.use(efoRouter);
router.use(clarityRouter);
router.use(campaignsRouter);
router.use(settingsRouter);

export default router;
