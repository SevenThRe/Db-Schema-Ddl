import type { Response } from "express";
import crypto from "crypto";
import type { ApiErrorCode } from "@shared/error-codes";

type ApiErrorParams = Record<string, string | number | boolean | null>;

interface SendApiErrorOptions {
  status: number;
  code: ApiErrorCode;
  message: string;
  params?: ApiErrorParams;
  requestId?: string;
  issues?: unknown[];
}

export function sendApiError(res: Response, options: SendApiErrorOptions) {
  const {
    status,
    code,
    message,
    params,
    requestId = crypto.randomUUID(),
    issues,
  } = options;

  return res.status(status).json({
    code,
    message,
    params,
    requestId,
    ...(Array.isArray(issues) ? { issues } : {}),
  });
}
