import type { Request } from "express";
import { env } from "../config/env";

export function isDevAuthAllowed(): boolean {
  return Boolean(env.ALLOW_DEV_AUTH && process.env.NODE_ENV !== "production");
}

export function tryExtractDevUser(request: Request): string | null {
  if (!isDevAuthAllowed()) {
    return null;
  }
  const developmentUser = request.header("x-user-id");
  if (developmentUser && typeof developmentUser === "string" && developmentUser.trim().length > 0) {
    return developmentUser.trim();
  }
  return null;
}
