import { z } from "zod/v4";

export const HealthCheckResponse = z.object({
  status: z.string(),
});

export type HealthCheckResponseType = z.infer<typeof HealthCheckResponse>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
});
