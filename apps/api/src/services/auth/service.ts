import { getDb } from "../../lib/prisma";

export const oauthProviders = ["google"] as const;

export function authConfiguration() {
  return {
    providers: process.env.OAUTH_CLIENT_ID ? oauthProviders : [],
    oauthOnly: true,
    configured: Boolean(process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET),
  };
}

export async function ensureUser(userId: string) {
  return getDb().user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
  });
}
