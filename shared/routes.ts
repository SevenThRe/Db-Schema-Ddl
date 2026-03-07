import { z } from 'zod';
import {
  uploadedFiles,
  insertUploadedFileSchema,
  tableInfoSchema,
  generateDdlRequestSchema,
  exportZipRequestSchema,
  generateDdlByReferenceRequestSchema,
  exportZipByReferenceRequestSchema,
  ddlSettingsSchema,
  processingTaskSchema,
  nameFixPreviewRequestSchema,
  nameFixPreviewResponseSchema,
  nameFixApplyRequestSchema,
  nameFixApplyResponseSchema,
  nameFixRollbackRequestSchema,
  nameFixRollbackResponseSchema,
  nameFixJobSchema,
  nameFixJobItemSchema,
  schemaDiffPreviewRequestSchema,
  schemaDiffPreviewResponseSchema,
  schemaDiffConfirmRequestSchema,
  schemaDiffConfirmResponseSchema,
  schemaDiffAlterPreviewRequestSchema,
  schemaDiffAlterPreviewResponseSchema,
  schemaDiffHistoryResponseSchema,
} from './schema';
import { apiErrorSchema } from "./error-codes";

const ddlGenerationWarningSchema = z.object({
  code: z.enum(["AUTO_INCREMENT_IGNORED", "AUTO_INCREMENT_DIALECT_UNSUPPORTED"]),
  tableName: z.string(),
  columnName: z.string(),
  message: z.string(),
  reason: z.string().optional(),
});

export const api = {
  files: {
    list: {
      method: 'GET' as const,
      path: '/api/files' as const,
      responses: {
        200: z.array(z.custom<typeof uploadedFiles.$inferSelect>()),
      },
    },
    upload: {
      method: 'POST' as const,
      path: '/api/files' as const,
      // Input is FormData
      responses: {
        201: z.custom<typeof uploadedFiles.$inferSelect>(),
        400: apiErrorSchema,
      },
    },
    getSheets: {
      method: 'GET' as const,
      path: '/api/files/:id/sheets' as const,
      responses: {
        200: z.array(z.object({
          name: z.string(),
          hasTableDefinitions: z.boolean(),
        })),
        404: apiErrorSchema,
      },
    },
    getTableInfo: {
      method: 'GET' as const,
      path: '/api/files/:id/sheets/:sheetName' as const,
      responses: {
        200: z.array(tableInfoSchema),
        404: apiErrorSchema,
        400: apiErrorSchema,
      },
    },
    getSearchIndex: {
      method: 'GET' as const,
      path: '/api/files/:id/search-index' as const,
      responses: {
        200: z.array(z.object({
          type: z.enum(['sheet', 'table']),
          sheetName: z.string(),
          displayName: z.string(),
          physicalTableName: z.string().optional(),
          logicalTableName: z.string().optional(),
        })),
        404: apiErrorSchema,
      },
    },
    remove: {
      method: 'DELETE' as const,
      path: '/api/files/:id' as const,
      responses: {
        200: z.object({
          message: z.string(),
          fileCleanupWarning: z.string().nullable(),
        }),
        404: apiErrorSchema,
      },
    },
    getSheetData: {
      method: 'GET' as const,
      path: '/api/files/:id/sheets/:sheetName/data' as const,
      responses: {
        200: z.array(z.array(z.unknown())),
        404: apiErrorSchema,
        400: apiErrorSchema,
      },
    },
    parseRegion: {
      method: 'POST' as const,
      path: '/api/files/:id/parse-region' as const,
      input: z.object({
        sheetName: z.string().min(1),
        startRow: z.number().int().min(0),
        endRow: z.number().int().min(0),
        startCol: z.number().int().min(0),
        endCol: z.number().int().min(0),
      }),
      responses: {
        200: z.array(tableInfoSchema),
        404: apiErrorSchema,
        400: apiErrorSchema,
      },
    },
  },
  ddl: {
    generate: {
      method: 'POST' as const,
      path: '/api/generate-ddl' as const,
      input: generateDdlRequestSchema,
      responses: {
        200: z.object({
          ddl: z.string(),
          warnings: z.array(ddlGenerationWarningSchema).optional(),
        }),
        400: apiErrorSchema,
      },
    },
    generateByReference: {
      method: 'POST' as const,
      path: '/api/generate-ddl-by-reference' as const,
      input: generateDdlByReferenceRequestSchema,
      responses: {
        200: z.object({
          ddl: z.string(),
          warnings: z.array(ddlGenerationWarningSchema).optional(),
        }),
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    exportZip: {
      method: 'POST' as const,
      path: '/api/export-ddl-zip' as const,
      input: exportZipRequestSchema,
      responses: {
        200: z.custom<Blob>(), // Binary response (ZIP file)
        400: apiErrorSchema,
      },
    },
    exportZipByReference: {
      method: 'POST' as const,
      path: '/api/export-ddl-zip-by-reference' as const,
      input: exportZipByReferenceRequestSchema,
      responses: {
        200: z.custom<Blob>(), // Binary response (ZIP file)
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
  },
  tasks: {
    get: {
      method: 'GET' as const,
      path: '/api/tasks/:id' as const,
      responses: {
        200: processingTaskSchema,
        404: apiErrorSchema,
      },
    },
  },
  settings: {
    get: {
      method: 'GET' as const,
      path: '/api/settings' as const,
      responses: {
        200: ddlSettingsSchema,
      },
    },
    getRuntime: {
      method: 'GET' as const,
      path: '/api/settings/runtime' as const,
      responses: {
        200: z.object({
          excelExecutor: z.object({
            disabled: z.boolean(),
            timeoutMs: z.number(),
            queueLength: z.number(),
            inFlightCount: z.number(),
            workerCount: z.number(),
            cacheEntries: z.number(),
            cacheBytes: z.number(),
            cacheTtlMs: z.number(),
            cacheMaxEntries: z.number(),
            cacheMaxTotalBytes: z.number(),
            cacheMaxBundleBytes: z.number(),
            queueMaxLength: z.number(),
            metrics: z.object({
              cacheHits: z.number(),
              cacheMisses: z.number(),
              cacheEvictions: z.number(),
              workerTimeouts: z.number(),
              workerRestarts: z.number(),
            }),
          }),
        }),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/settings' as const,
      input: ddlSettingsSchema,
      responses: {
        200: ddlSettingsSchema,
        400: apiErrorSchema,
      },
    },
  },
  nameFix: {
    preview: {
      method: 'POST' as const,
      path: '/api/name-fix/preview' as const,
      input: nameFixPreviewRequestSchema,
      responses: {
        200: nameFixPreviewResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    apply: {
      method: 'POST' as const,
      path: '/api/name-fix/apply' as const,
      input: nameFixApplyRequestSchema,
      responses: {
        200: nameFixApplyResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    rollback: {
      method: 'POST' as const,
      path: '/api/name-fix/rollback' as const,
      input: nameFixRollbackRequestSchema,
      responses: {
        200: nameFixRollbackResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    getJob: {
      method: 'GET' as const,
      path: '/api/name-fix/jobs/:id' as const,
      responses: {
        200: z.object({
          job: nameFixJobSchema,
          items: z.array(nameFixJobItemSchema),
        }),
        404: apiErrorSchema,
      },
    },
    download: {
      method: 'GET' as const,
      path: '/api/name-fix/download/:token' as const,
      responses: {
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
  },
  diff: {
    preview: {
      method: "POST" as const,
      path: "/api/diff/preview" as const,
      input: schemaDiffPreviewRequestSchema,
      responses: {
        200: schemaDiffPreviewResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    confirm: {
      method: "POST" as const,
      path: "/api/diff/confirm-renames" as const,
      input: schemaDiffConfirmRequestSchema,
      responses: {
        200: schemaDiffConfirmResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    alterPreview: {
      method: "POST" as const,
      path: "/api/diff/alter-preview" as const,
      input: schemaDiffAlterPreviewRequestSchema,
      responses: {
        200: schemaDiffAlterPreviewResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    alterExport: {
      method: "POST" as const,
      path: "/api/diff/alter-export" as const,
      input: schemaDiffAlterPreviewRequestSchema,
      responses: {
        200: z.custom<Blob>(),
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    history: {
      method: "GET" as const,
      path: "/api/diff/history/:newFileId" as const,
      responses: {
        200: schemaDiffHistoryResponseSchema,
        404: apiErrorSchema,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
