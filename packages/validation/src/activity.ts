import { z } from "zod";

export const activityRangeSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine(({ from, to }) => from < to, "from must be before to");
