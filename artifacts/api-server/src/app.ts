import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { cookieSecretOrEphemeral } from "./lib/auth-config";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// OAuthのstate/PKCEを署名付きCookieで持ち回るため（セッションCookieは署名不要の
// ランダムトークンで、DB側のハッシュと突き合わせて検証する）
app.use(cookieParser(cookieSecretOrEphemeral()));

app.use("/api", router);

export default app;
