import { z } from "zod";

export const deviceCodeRequestSchema = z.object({
  clientName: z.string().default("ProductiveHix Desktop Bridge"),
  platform: z.string().default("windows"),
  hostname: z.string().optional(),
});

export const deviceVerifySchema = z.object({
  userCode: z.string().min(4).max(16),
});

export const deviceTokenRequestSchema = z.object({
  deviceCode: z.string().min(10),
});

export type DeviceCodeRequestInput = z.infer<typeof deviceCodeRequestSchema>;
export type DeviceVerifyInput = z.infer<typeof deviceVerifySchema>;
export type DeviceTokenRequestInput = z.infer<typeof deviceTokenRequestSchema>;
