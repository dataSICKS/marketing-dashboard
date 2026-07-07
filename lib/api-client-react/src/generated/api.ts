import {
  useQuery,
  useMutation,
  type UseQueryOptions,
  type UseMutationOptions,
  type QueryFunction,
  type MutationFunction,
} from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";
import type {
  HealthStatus,
  ErrorResponse,
  NewsletterReportResponse,
  NewsletterSyncResult,
  NewsletterChangeEventsResponse,
  NewsletterSegmentsResponse,
  NewsletterTemplatesResponse,
  MatrixResponse,
  ClarityFilesResponse,
  ClarityScrollResponse,
  EfoFilters,
  EfoReportResponse,
  EfoSyncResult,
  Campaign,
  CampaignInput,
  CampaignListResponse,
  CampaignResponse,
} from "./api.schemas";

// queryKey を省略できるよう extends するユーティリティ（オーバーライドは可）
interface QueryOpts<TData, TError, TKey extends readonly unknown[]>
  extends Omit<UseQueryOptions<TData, TError, TData, TKey>, "queryKey"> {
  queryKey?: TKey;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const healthCheck = () =>
  customFetch<HealthStatus>("/api/healthz");

export const getHealthCheckQueryKey = () => ["/api/healthz"] as const;

export type HealthCheckQueryKey = ReturnType<typeof getHealthCheckQueryKey>;

export const useHealthCheck = <TError = ErrorType<ErrorResponse>>(options?: {
  query?: QueryOpts<HealthStatus, TError, HealthCheckQueryKey>;
}) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getHealthCheckQueryKey();
  const queryFn: QueryFunction<HealthStatus, HealthCheckQueryKey> = () => healthCheck();
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// Newsletter — sync
// ---------------------------------------------------------------------------

export const syncNewsletter = () =>
  customFetch<NewsletterSyncResult>("/api/newsletter/sync", { method: "POST" });

export const useSyncNewsletter = <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<NewsletterSyncResult, TError, void, TContext>;
}) => {
  const { mutation: mutationOptions } = options ?? {};
  const mutationFn: MutationFunction<NewsletterSyncResult, void> = () => syncNewsletter();
  return useMutation({ mutationFn, ...mutationOptions });
};

// ---------------------------------------------------------------------------
// Newsletter — data
// ---------------------------------------------------------------------------

export type GetNewsletterDataGroupBy = "day" | "week" | "month" | "scenario" | "template";

export type GetNewsletterDataParams = {
  groupBy?: GetNewsletterDataGroupBy;
  dateFrom?: string | null;
  dateTo?: string | null;
  segment?: string | null;
  compareFrom?: string | null;
  compareTo?: string | null;
};

export const getNewsletterData = (params?: GetNewsletterDataParams) =>
  customFetch<NewsletterReportResponse>(
    `/api/newsletter/data${params ? buildQuery(params as Record<string, string | null | undefined>) : ""}`,
  );

export const getGetNewsletterDataQueryKey = (params?: GetNewsletterDataParams) =>
  ["/api/newsletter/data", ...(params ? [params] : [])] as const;

export type GetNewsletterDataQueryKey = ReturnType<typeof getGetNewsletterDataQueryKey>;

export const useGetNewsletterData = <TError = ErrorType<ErrorResponse>>(
  params?: GetNewsletterDataParams,
  options?: {
    query?: QueryOpts<NewsletterReportResponse, TError, GetNewsletterDataQueryKey>;
  },
) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getGetNewsletterDataQueryKey(params);
  const queryFn: QueryFunction<NewsletterReportResponse, GetNewsletterDataQueryKey> = () =>
    getNewsletterData(params);
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// Newsletter — change events
// ---------------------------------------------------------------------------

export type GetNewsletterChangeEventsParams = {
  scenarioName?: string | null;
  segment?: string | null;
};

export const getNewsletterChangeEvents = (params?: GetNewsletterChangeEventsParams) =>
  customFetch<NewsletterChangeEventsResponse>(
    `/api/newsletter/change-events${params ? buildQuery(params as Record<string, string | null | undefined>) : ""}`,
  );

export const getGetNewsletterChangeEventsQueryKey = (params?: GetNewsletterChangeEventsParams) =>
  ["/api/newsletter/change-events", ...(params ? [params] : [])] as const;

export type GetNewsletterChangeEventsQueryKey = ReturnType<typeof getGetNewsletterChangeEventsQueryKey>;

export const useGetNewsletterChangeEvents = <TError = ErrorType<ErrorResponse>>(
  params?: GetNewsletterChangeEventsParams,
  options?: {
    query?: QueryOpts<NewsletterChangeEventsResponse, TError, GetNewsletterChangeEventsQueryKey>;
  },
) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getGetNewsletterChangeEventsQueryKey(params);
  const queryFn: QueryFunction<NewsletterChangeEventsResponse, GetNewsletterChangeEventsQueryKey> = () =>
    getNewsletterChangeEvents(params);
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// Newsletter — matrix
// ---------------------------------------------------------------------------

export type GetNewsletterMatrixParams = {
  timeGroupBy?: "day" | "week" | "month";
  metrics?: string;
  scenarios?: string;
  templates?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export const getNewsletterMatrix = (params: GetNewsletterMatrixParams) =>
  customFetch<MatrixResponse>(
    `/api/newsletter/matrix${buildQuery(params as Record<string, string | null | undefined>)}`,
  );

export const getGetNewsletterMatrixQueryKey = (params: GetNewsletterMatrixParams) =>
  ["/api/newsletter/matrix", params] as const;

export type GetNewsletterMatrixQueryKey = ReturnType<typeof getGetNewsletterMatrixQueryKey>;

export const useGetNewsletterMatrix = <TError = ErrorType<ErrorResponse>>(
  params: GetNewsletterMatrixParams,
  options?: {
    query?: QueryOpts<MatrixResponse, TError, GetNewsletterMatrixQueryKey>;
  },
) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getGetNewsletterMatrixQueryKey(params);
  const queryFn: QueryFunction<MatrixResponse, GetNewsletterMatrixQueryKey> = () =>
    getNewsletterMatrix(params);
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// Newsletter — segments
// ---------------------------------------------------------------------------

export const getNewsletterSegments = () =>
  customFetch<NewsletterSegmentsResponse>("/api/newsletter/segments");

export const getGetNewsletterSegmentsQueryKey = () => ["/api/newsletter/segments"] as const;

export type GetNewsletterSegmentsQueryKey = ReturnType<typeof getGetNewsletterSegmentsQueryKey>;

export const useGetNewsletterSegments = <TError = ErrorType<ErrorResponse>>(options?: {
  query?: QueryOpts<NewsletterSegmentsResponse, TError, GetNewsletterSegmentsQueryKey>;
}) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getGetNewsletterSegmentsQueryKey();
  const queryFn: QueryFunction<NewsletterSegmentsResponse, GetNewsletterSegmentsQueryKey> = () =>
    getNewsletterSegments();
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// Newsletter — templates
// ---------------------------------------------------------------------------

export const getNewsletterTemplates = () =>
  customFetch<NewsletterTemplatesResponse>("/api/newsletter/templates");

export const getGetNewsletterTemplatesQueryKey = () => ["/api/newsletter/templates"] as const;

export type GetNewsletterTemplatesQueryKey = ReturnType<typeof getGetNewsletterTemplatesQueryKey>;

export const useGetNewsletterTemplates = <TError = ErrorType<ErrorResponse>>(options?: {
  query?: QueryOpts<NewsletterTemplatesResponse, TError, GetNewsletterTemplatesQueryKey>;
}) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getGetNewsletterTemplatesQueryKey();
  const queryFn: QueryFunction<NewsletterTemplatesResponse, GetNewsletterTemplatesQueryKey> = () =>
    getNewsletterTemplates();
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// Clarity — files
// ---------------------------------------------------------------------------

export type GetClarityFilesParams = {
  date?: string | null;
};

export const getClarityFiles = (params?: GetClarityFilesParams) =>
  customFetch<ClarityFilesResponse>(
    `/api/clarity/files${params ? buildQuery(params as Record<string, string | null | undefined>) : ""}`,
  );

export const getGetClarityFilesQueryKey = (params?: GetClarityFilesParams) =>
  ["/api/clarity/files", ...(params ? [params] : [])] as const;

export type GetClarityFilesQueryKey = ReturnType<typeof getGetClarityFilesQueryKey>;

export const useGetClarityFiles = <TError = ErrorType<ErrorResponse>>(
  params?: GetClarityFilesParams,
  options?: {
    query?: QueryOpts<ClarityFilesResponse, TError, GetClarityFilesQueryKey>;
  },
) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getGetClarityFilesQueryKey(params);
  const queryFn: QueryFunction<ClarityFilesResponse, GetClarityFilesQueryKey> = () =>
    getClarityFiles(params);
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// Clarity — scroll
// ---------------------------------------------------------------------------

export type GetClarityScrollParams = {
  date: string;
  adCode: string;
};

export const getClarityScroll = (params: GetClarityScrollParams) =>
  customFetch<ClarityScrollResponse>(
    `/api/clarity/scroll${buildQuery(params as Record<string, string>)}`,
  );

export const getGetClarityScrollQueryKey = (params: GetClarityScrollParams) =>
  ["/api/clarity/scroll", params] as const;

export type GetClarityScrollQueryKey = ReturnType<typeof getGetClarityScrollQueryKey>;

export const useGetClarityScroll = <TError = ErrorType<ErrorResponse>>(
  params: GetClarityScrollParams,
  options?: {
    query?: QueryOpts<ClarityScrollResponse, TError, GetClarityScrollQueryKey>;
  },
) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getGetClarityScrollQueryKey(params);
  const queryFn: QueryFunction<ClarityScrollResponse, GetClarityScrollQueryKey> = () =>
    getClarityScroll(params);
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// EFO — filters
// ---------------------------------------------------------------------------

export const getEfoFilters = () =>
  customFetch<EfoFilters>("/api/efo/filters");

export const getGetEfoFiltersQueryKey = () => ["/api/efo/filters"] as const;

export type GetEfoFiltersQueryKey = ReturnType<typeof getGetEfoFiltersQueryKey>;

export const useGetEfoFilters = <TError = ErrorType<ErrorResponse>>(options?: {
  query?: QueryOpts<EfoFilters, TError, GetEfoFiltersQueryKey>;
}) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getGetEfoFiltersQueryKey();
  const queryFn: QueryFunction<EfoFilters, GetEfoFiltersQueryKey> = () => getEfoFilters();
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// EFO — data
// ---------------------------------------------------------------------------

export type GetEfoDataGroupBy = "day" | "week" | "month" | "template";

export type GetEfoDataParams = {
  groupBy?: GetEfoDataGroupBy;
  dateFrom?: string | null;
  dateTo?: string | null;
  profileName?: string | null;
  adCode?: string | null;
};

export const getEfoData = (params?: GetEfoDataParams) =>
  customFetch<EfoReportResponse>(
    `/api/efo/data${params ? buildQuery(params as Record<string, string | null | undefined>) : ""}`,
  );

export const getGetEfoDataQueryKey = (params?: GetEfoDataParams) =>
  ["/api/efo/data", ...(params ? [params] : [])] as const;

export type GetEfoDataQueryKey = ReturnType<typeof getGetEfoDataQueryKey>;

export const useGetEfoData = <TError = ErrorType<ErrorResponse>>(
  params?: GetEfoDataParams,
  options?: {
    query?: QueryOpts<EfoReportResponse, TError, GetEfoDataQueryKey>;
  },
) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getGetEfoDataQueryKey(params);
  const queryFn: QueryFunction<EfoReportResponse, GetEfoDataQueryKey> = () =>
    getEfoData(params);
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

// ---------------------------------------------------------------------------
// EFO — sync
// ---------------------------------------------------------------------------

export const syncEfo = () =>
  customFetch<EfoSyncResult>("/api/efo/sync", { method: "POST" });

export const useSyncEfo = <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<EfoSyncResult, TError, void, TContext>;
}) => {
  const { mutation: mutationOptions } = options ?? {};
  const mutationFn: MutationFunction<EfoSyncResult, void> = () => syncEfo();
  return useMutation({ mutationFn, ...mutationOptions });
};

// ---------------------------------------------------------------------------
// Campaigns — CRUD
// ---------------------------------------------------------------------------

export const listCampaigns = () =>
  customFetch<CampaignListResponse>("/api/campaigns", { method: "GET" });

export const getListCampaignsQueryKey = () => ["/api/campaigns"] as const;
export type ListCampaignsQueryKey = ReturnType<typeof getListCampaignsQueryKey>;

export const useListCampaigns = <TError = ErrorType<ErrorResponse>>(options?: {
  query?: QueryOpts<CampaignListResponse, TError, ListCampaignsQueryKey>;
}) => {
  const { query: queryOptions } = options ?? {};
  const queryKey = getListCampaignsQueryKey();
  const queryFn: QueryFunction<CampaignListResponse, ListCampaignsQueryKey> = () => listCampaigns();
  return useQuery({ queryKey, queryFn, ...queryOptions });
};

export const createCampaign = (input: CampaignInput) =>
  customFetch<CampaignResponse>("/api/campaigns", { method: "POST", body: JSON.stringify(input) });

export const useCreateCampaign = <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<CampaignResponse, TError, CampaignInput, TContext>;
}) => {
  const { mutation: mutationOptions } = options ?? {};
  const mutationFn: MutationFunction<CampaignResponse, CampaignInput> = (input) => createCampaign(input);
  return useMutation({ mutationFn, ...mutationOptions });
};

export const updateCampaign = (id: number, input: CampaignInput) =>
  customFetch<CampaignResponse>(`/api/campaigns/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const useUpdateCampaign = <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<CampaignResponse, TError, { id: number; input: CampaignInput }, TContext>;
}) => {
  const { mutation: mutationOptions } = options ?? {};
  const mutationFn: MutationFunction<CampaignResponse, { id: number; input: CampaignInput }> = ({ id, input }) => updateCampaign(id, input);
  return useMutation({ mutationFn, ...mutationOptions });
};

export const deleteCampaign = (id: number) =>
  customFetch<void>(`/api/campaigns/${id}`, { method: "DELETE" });

export const useDeleteCampaign = <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<void, TError, number, TContext>;
}) => {
  const { mutation: mutationOptions } = options ?? {};
  const mutationFn: MutationFunction<void, number> = (id) => deleteCampaign(id);
  return useMutation({ mutationFn, ...mutationOptions });
};
