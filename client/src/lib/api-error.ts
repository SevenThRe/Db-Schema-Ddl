import type { TFunction } from "i18next";

export interface ApiErrorIssue {
  issueCode?: string;
  tableName?: string;
  columnName?: string;
  field?: string;
  message?: string;
  suggestion?: string;
  value?: string;
  params?: Record<string, string | number | boolean | null>;
}

interface ApiRequestErrorOptions {
  status: number;
  code?: string;
  params?: Record<string, unknown>;
  requestId?: string;
  issues?: ApiErrorIssue[];
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  params?: Record<string, unknown>;
  requestId?: string;
  issues?: ApiErrorIssue[];

  constructor(message: string, options: ApiRequestErrorOptions) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.code = options.code;
    this.params = options.params;
    this.requestId = options.requestId;
    this.issues = options.issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toApiRequestError(
  payload: unknown,
  status: number,
  fallback: { code: string; message: string },
): ApiRequestError {
  if (!isRecord(payload)) {
    return new ApiRequestError(fallback.message, {
      status,
      code: fallback.code,
    });
  }

  const code = typeof payload.code === "string" ? payload.code : fallback.code;
  const message = typeof payload.message === "string" ? payload.message : fallback.message;
  const requestId = typeof payload.requestId === "string" ? payload.requestId : undefined;
  const params = isRecord(payload.params) ? payload.params : undefined;
  const issues = Array.isArray(payload.issues) ? (payload.issues as ApiErrorIssue[]) : undefined;

  return new ApiRequestError(message, {
    status,
    code,
    params,
    requestId,
    issues,
  });
}

export async function parseApiErrorResponse(
  res: Response,
  fallback: { code: string; message: string },
): Promise<ApiRequestError> {
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = await res.json().catch(() => null);
    return toApiRequestError(payload, res.status, fallback);
  }

  const text = await res.text().catch(() => "");
  return new ApiRequestError(text || fallback.message, {
    status: res.status,
    code: fallback.code,
  });
}

function buildIssueParams(issue: ApiErrorIssue): Record<string, unknown> {
  return {
    ...(issue.params ?? {}),
    ...(issue.tableName ? { tableName: issue.tableName } : {}),
    ...(issue.columnName ? { columnName: issue.columnName } : {}),
    ...(issue.field ? { field: issue.field } : {}),
    ...(issue.value ? { value: issue.value } : {}),
  };
}

export function translateIssue(issue: ApiErrorIssue, t: TFunction): string {
  if (issue.issueCode) {
    const key = `errors.issue.${issue.issueCode}`;
    const translated = t(key, {
      ...buildIssueParams(issue),
      defaultValue: "",
    });
    if (translated && translated !== key) {
      return translated;
    }
  }

  return issue.message || t("errors.common.issueFallback");
}

export function translateApiError(
  error: unknown,
  t: TFunction,
  options?: { includeIssues?: boolean; maxIssues?: number },
): { title: string; description: string; requestId?: string; code?: string } {
  const includeIssues = options?.includeIssues ?? true;
  const maxIssues = options?.maxIssues ?? 3;

  const normalizedError =
    error instanceof ApiRequestError
      ? error
      : error instanceof Error
        ? new ApiRequestError(error.message, {
            status: 0,
            code: "REQUEST_FAILED",
          })
        : new ApiRequestError(t("errors.common.defaultDesc"), {
            status: 0,
            code: "REQUEST_FAILED",
          });

  const apiCode = normalizedError.code;
  const baseParams = normalizedError.params ?? {};

  let title = t("errors.common.title");
  let description =
    normalizedError.message && normalizedError.message.trim().length > 0
      ? normalizedError.message
      : t("errors.common.defaultDesc");

  if (apiCode) {
    const titleKey = `errors.api.${apiCode}.title`;
    const descKey = `errors.api.${apiCode}.desc`;

    const translatedTitle = t(titleKey, { ...baseParams, defaultValue: "" });
    if (translatedTitle && translatedTitle !== titleKey) {
      title = translatedTitle;
    }

    const translatedDesc = t(descKey, { ...baseParams, defaultValue: "" });
    if (translatedDesc && translatedDesc !== descKey) {
      description = translatedDesc;
    }
  }

  if (
    includeIssues &&
    Array.isArray(normalizedError.issues) &&
    normalizedError.issues.length > 0
  ) {
    const issueLines = normalizedError.issues
      .slice(0, maxIssues)
      .map((issue, index) => `${index + 1}. ${translateIssue(issue, t)}`);
    const remaining = normalizedError.issues.length - issueLines.length;
    const moreLine =
      remaining > 0 ? t("errors.common.moreIssues", { count: remaining }) : "";
    description = [description, ...issueLines, moreLine].filter(Boolean).join("\n");
  }

  return {
    title,
    description,
    requestId: normalizedError.requestId,
    code: normalizedError.code,
  };
}
