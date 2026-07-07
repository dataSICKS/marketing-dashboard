import { z } from "zod/v4";

export const GetNewsletterDataQueryParams = z.object({
  groupBy: z
    .enum(["day", "week", "month", "scenario", "template"])
    .optional(),
  dateFrom: z.coerce.string().nullish(),
  dateTo: z.coerce.string().nullish(),
  segment: z.coerce.string().nullish(),
  compareFrom: z.coerce.string().nullish(),
  compareTo: z.coerce.string().nullish(),
});

export type GetNewsletterDataQueryParamsType = z.infer<
  typeof GetNewsletterDataQueryParams
>;

export const GetEfoFiltersQueryParams = z.object({
  dateFrom: z.coerce.string().nullish(),
  dateTo: z.coerce.string().nullish(),
});

export type GetEfoFiltersQueryParamsType = z.infer<
  typeof GetEfoFiltersQueryParams
>;

export const GetEfoDataQueryParams = z.object({
  groupBy: z.enum(["day", "week", "month"]).optional(),
  dateFrom: z.coerce.string().nullish(),
  dateTo: z.coerce.string().nullish(),
  profileName: z.coerce.string().nullish(),
  adCode: z.coerce.string().nullish(),
});

export type GetEfoDataQueryParamsType = z.infer<typeof GetEfoDataQueryParams>;

export const GetClarityFilesQueryParams = z.object({
  date: z.coerce.string().nullish(),
});

export const GetClarityScrollQueryParams = z.object({
  date: z.coerce.string(),
  adCode: z.coerce.string(),
});
