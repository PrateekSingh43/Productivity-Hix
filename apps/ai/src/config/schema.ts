import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().trim().min(1).max(32_000),
});

const generateOptionsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().max(8192).optional(),
});

export const generateRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(32_000).optional(),
    messages: z.array(chatMessageSchema).max(50).optional(),
  })
  .merge(generateOptionsSchema)
  .superRefine((value, ctx) => {
    const hasPrompt = Boolean(value.prompt);
    const hasMessages = Boolean(value.messages && value.messages.length > 0);
    if (!hasPrompt && !hasMessages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide prompt or messages",
        path: ["messages"],
      });
    }
  })
  .transform((value) => ({
    messages:
      value.messages && value.messages.length > 0
        ? value.messages
        : [{ role: "user" as const, content: value.prompt as string }],
    temperature: value.temperature,
    maxOutputTokens: value.maxOutputTokens,
  }));

export type GenerateRequestInput = z.input<typeof generateRequestSchema>;
