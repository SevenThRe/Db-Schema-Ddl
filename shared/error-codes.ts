import { z } from "zod";

export const API_ERROR_CODES = [
  "BAD_REQUEST",
  "INVALID_REQUEST",
  "REQUEST_FAILED",
  "NETWORK_ERROR",
  "INTERNAL_SERVER_ERROR",
  "NO_FILE_UPLOADED",
  "FILE_NOT_FOUND",
  "FILE_DELETE_FAILED",
  "READ_SHEET_FAILED",
  "PARSE_REGION_FAILED",
  "READ_EXCEL_FAILED",
  "PARSE_SHEET_FAILED",
  "TASK_NOT_FOUND",
  "SEARCH_INDEX_FAILED",
  "DDL_GENERATE_FAILED",
  "ZIP_GENERATE_FAILED",
  "SETTINGS_GET_FAILED",
  "SETTINGS_UPDATE_FAILED",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);

export const VALIDATION_ISSUE_CODES = [
  "INVALID_TABLE_NAME",
  "EMPTY_COLUMNS",
  "INVALID_COLUMN_NAME",
  "DUPLICATE_COLUMN_NAME",
  "MISSING_DATA_TYPE",
  "UNSUPPORTED_DATA_TYPE",
  "CONFLICTING_SIZE_DEFINITIONS",
  "INVALID_SIZE_FORMAT",
  "TYPE_MUST_NOT_INCLUDE_SIZE",
  "TYPE_ONLY_ACCEPTS_INTEGER_SIZE",
  "DUPLICATE_TABLE_NAME",
] as const;

export type ValidationIssueCode = (typeof VALIDATION_ISSUE_CODES)[number];
export const validationIssueCodeSchema = z.enum(VALIDATION_ISSUE_CODES);

const apiErrorParamValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const apiErrorParamsSchema = z.record(apiErrorParamValueSchema);

export const apiValidationIssueSchema = z.object({
  issueCode: validationIssueCodeSchema.optional(),
  tableName: z.string().optional(),
  columnName: z.string().optional(),
  field: z.string().optional(),
  message: z.string().optional(),
  value: z.string().optional(),
  suggestion: z.string().optional(),
  params: apiErrorParamsSchema.optional(),
});

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  params: apiErrorParamsSchema.optional(),
  requestId: z.string().optional(),
  issues: z.array(apiValidationIssueSchema).optional(),
});

export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;
export type ApiValidationIssue = z.infer<typeof apiValidationIssueSchema>;
