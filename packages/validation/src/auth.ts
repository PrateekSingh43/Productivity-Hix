import { z } from "zod";

export const oauthProviderSchema = z.object({
  provider: z.literal("google"),
  redirectTo: z.string().url().optional(),
});
