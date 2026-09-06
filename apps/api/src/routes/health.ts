import { Router } from "express";
import { env } from "../config/env";

export const healthRouter: Router = Router();

healthRouter.get("/", (_request, response) => {
  response.json({ ok: true, service: "productivehix-api", environment: env.NODE_ENV });
});
