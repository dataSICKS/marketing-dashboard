import { Router, type IRouter } from "express";
import healthRouter from "./health";
import newsletterRouter from "./newsletter";
import efoRouter from "./efo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(newsletterRouter);
router.use(efoRouter);

export default router;
