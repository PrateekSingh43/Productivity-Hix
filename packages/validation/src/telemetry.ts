import { z } from "zod";

export const activeWindowDataSchema = z.object({
  application: z.string().min(1),
  windowTitle: z.string(),
  processId: z.number().int().positive().optional(),
  appPath: z.string().optional(),
});

export const afkDataSchema = z.object({
  state: z.enum(["active", "afk"]),
});

export const inputActivityDataSchema = z.object({
  keyPresses: z.number().int().nonnegative().optional(),
  mouseClicks: z.number().int().nonnegative().optional(),
  mouseMovement: z.number().int().nonnegative().optional(),
});

export const collectorProvenanceSchema = z.object({
  collector: z.enum(["activitywatch", "browser-extension"]),
  collectorName: z.string().optional(),
  bucketId: z.string().optional(),
  version: z.string().optional(),
  hostname: z.string().optional(),
});

export const desktopActivityEventSchema = z.object({
  eventId: z.string().min(1),
  source: z.literal("desktop"),
  installationId: z.string().min(1),
  eventType: z.enum(["active_window", "afk", "input"]),
  timestamp: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  data: z.record(z.string(), z.unknown()),
  provenance: collectorProvenanceSchema.optional(),
});

export const browserActivityDataSchema = z.object({
  domain: z.string().min(1),
  sanitizedUrl: z.string(),
  pageTitle: z.string(),
  audible: z.boolean().optional(),
  incognito: z.boolean().optional(),
  tabCount: z.number().int().nonnegative().optional(),
  idleState: z.enum(["active", "idle"]).optional(),
});

export const browserActivityEventSchema = z.object({
  eventId: z.string().min(1),
  source: z.literal("browser"),
  installationId: z.string().min(1),
  eventType: z.enum(["active_tab", "tab_switch", "browser_idle"]),
  timestamp: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  data: z.record(z.string(), z.unknown()),
  provenance: collectorProvenanceSchema.optional(),
});

export const telemetryEventSchema = z.union([
  desktopActivityEventSchema,
  browserActivityEventSchema,
]);

export const telemetryBatchSchema = z.object({
  installationId: z.string().min(1),
  source: z.enum(["desktop", "browser"]),
  sentAt: z.string().datetime(),
  events: z.array(telemetryEventSchema).min(1).max(500),
});

export type TelemetryBatchInput = z.infer<typeof telemetryBatchSchema>;
export type TelemetryEventInput = z.infer<typeof telemetryEventSchema>;
