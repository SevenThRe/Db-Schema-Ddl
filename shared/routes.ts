import { z } from 'zod';
import {
  uploadedFiles,
  insertUploadedFileSchema,
  workbookTemplateVariantSchema,
  createWorkbookFromTemplateRequestSchema,
  createWorkbookFromTemplateResponseSchema,
  tableInfoSchema,
  generateDdlRequestSchema,
  ddlImportPreviewRequestSchema,
  ddlImportPreviewResponseSchema,
  ddlImportExportRequestSchema,
  ddlImportExportResponseSchema,
  exportZipRequestSchema,
  generateDdlByReferenceRequestSchema,
  exportZipByReferenceRequestSchema,
  ddlSettingsSchema,
  extensionHostStateSchema,
  extensionLifecycleActionRequestSchema,
  extensionCatalogReleaseSchema,
  extensionLifecycleStateSchema,
  dbConnectionSummarySchema,
  dbConnectionUpsertRequestSchema,
  dbConnectionTestResponseSchema,
  dbDatabaseOptionSchema,
  dbSelectDatabaseRequestSchema,
  dbSchemaIntrospectRequestSchema,
  dbSchemaIntrospectResponseSchema,
  dbDiffPreviewRequestSchema,
  dbDiffPreviewResponseSchema,
  dbDiffConfirmRenamesRequestSchema,
  dbSqlPreviewRequestSchema,
  dbSqlPreviewResponseSchema,
  dbDryRunRequestSchema,
  dbDryRunResponseSchema,
  dbHistoryListRequestSchema,
  dbHistoryListResponseSchema,
  dbHistoryDetailResponseSchema,
  dbHistoryCompareRequestSchema,
  dbHistoryCompareResponseSchema,
  dbSnapshotCompareRequestSchema,
  dbSnapshotCompareResponseSchema,
  dbSnapshotCompareReportRequestSchema,
  dbSnapshotCompareReportResponseSchema,
  dbApplyRequestSchema,
  dbApplyResponseSchema,
  dbDeployJobDetailResponseSchema,
  dbComparePolicySchema,
  dbGraphRequestSchema,
  dbGraphResponseSchema,
  dbVsDbCompareRequestSchema,
  dbVsDbCompareResponseSchema,
  dbVsDbGraphRequestSchema,
  dbVsDbGraphResponseSchema,
  dbVsDbPreviewRequestSchema,
  dbVsDbPreviewResponseSchema,
  dbVsDbRenameReviewRequestSchema,
  processingTaskResponseSchema,
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
    listTemplates: {
      method: "GET" as const,
      path: "/api/files/templates" as const,
      responses: {
        200: z.array(workbookTemplateVariantSchema),
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
    createFromTemplate: {
      method: "POST" as const,
      path: "/api/files/create-from-template" as const,
      input: createWorkbookFromTemplateRequestSchema,
      responses: {
        201: createWorkbookFromTemplateResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
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
    previewImport: {
      method: "POST" as const,
      path: "/api/ddl/import/preview" as const,
      input: ddlImportPreviewRequestSchema,
      responses: {
        200: ddlImportPreviewResponseSchema,
        400: apiErrorSchema,
      },
    },
    exportWorkbook: {
      method: "POST" as const,
      path: "/api/ddl/import/export-workbook" as const,
      input: ddlImportExportRequestSchema,
      responses: {
        201: ddlImportExportResponseSchema,
        400: apiErrorSchema,
      },
    },
  },
  tasks: {
    get: {
      method: 'GET' as const,
      path: '/api/tasks/:id' as const,
      responses: {
        200: processingTaskResponseSchema,
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
  extensions: {
    list: {
      method: "GET" as const,
      path: "/api/extensions" as const,
      responses: {
        200: z.array(extensionHostStateSchema),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/extensions/:id" as const,
      responses: {
        200: extensionHostStateSchema,
        404: apiErrorSchema,
      },
    },
    catalog: {
      method: "GET" as const,
      path: "/api/extensions/:id/catalog" as const,
      responses: {
        200: extensionCatalogReleaseSchema.nullable(),
        404: apiErrorSchema,
      },
    },
    lifecycle: {
      method: "GET" as const,
      path: "/api/extensions/:id/lifecycle" as const,
      responses: {
        200: extensionLifecycleStateSchema.nullable(),
        404: apiErrorSchema,
      },
    },
    enable: {
      method: "POST" as const,
      path: "/api/extensions/:id/enable" as const,
      input: extensionLifecycleActionRequestSchema,
      responses: {
        200: extensionHostStateSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    disable: {
      method: "POST" as const,
      path: "/api/extensions/:id/disable" as const,
      input: extensionLifecycleActionRequestSchema,
      responses: {
        200: extensionHostStateSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    uninstall: {
      method: "POST" as const,
      path: "/api/extensions/:id/uninstall" as const,
      input: extensionLifecycleActionRequestSchema,
      responses: {
        200: extensionHostStateSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
  },
  dbManagement: {
    listConnections: {
      method: "GET" as const,
      path: "/api/db-management/connections" as const,
      responses: {
        200: z.array(dbConnectionSummarySchema),
      },
    },
    createConnection: {
      method: "POST" as const,
      path: "/api/db-management/connections" as const,
      input: dbConnectionUpsertRequestSchema,
      responses: {
        201: dbConnectionSummarySchema,
        400: apiErrorSchema,
      },
    },
    updateConnection: {
      method: "PUT" as const,
      path: "/api/db-management/connections/:id" as const,
      input: dbConnectionUpsertRequestSchema,
      responses: {
        200: dbConnectionSummarySchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    deleteConnection: {
      method: "DELETE" as const,
      path: "/api/db-management/connections/:id" as const,
      responses: {
        200: z.object({
          success: z.boolean(),
        }),
        404: apiErrorSchema,
      },
    },
    testConnection: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/test" as const,
      responses: {
        200: dbConnectionTestResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    listDatabases: {
      method: "GET" as const,
      path: "/api/db-management/connections/:id/databases" as const,
      responses: {
        200: z.array(dbDatabaseOptionSchema),
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    selectDatabase: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/select-database" as const,
      input: dbSelectDatabaseRequestSchema,
      responses: {
        200: dbConnectionSummarySchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    introspect: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/introspect" as const,
      input: dbSchemaIntrospectRequestSchema,
      responses: {
        200: dbSchemaIntrospectResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    diffPreview: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/diff-preview" as const,
      input: dbDiffPreviewRequestSchema,
      responses: {
        200: dbDiffPreviewResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    confirmRenames: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/confirm-renames" as const,
      input: dbDiffConfirmRenamesRequestSchema,
      responses: {
        200: dbDiffPreviewResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    previewSql: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/preview-sql" as const,
      input: dbSqlPreviewRequestSchema,
      responses: {
        200: dbSqlPreviewResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    dryRun: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/dry-run" as const,
      input: dbDryRunRequestSchema,
      responses: {
        200: dbDryRunResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    listHistory: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/history" as const,
      input: dbHistoryListRequestSchema,
      responses: {
        200: dbHistoryListResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    historyDetail: {
      method: "GET" as const,
      path: "/api/db-management/connections/:id/history/:eventId" as const,
      responses: {
        200: dbHistoryDetailResponseSchema,
        404: apiErrorSchema,
      },
    },
    compareHistory: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/history/compare" as const,
      input: dbHistoryCompareRequestSchema,
      responses: {
        200: dbHistoryCompareResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    snapshotCompare: {
      method: "POST" as const,
      path: "/api/db-management/snapshot-compare" as const,
      input: dbSnapshotCompareRequestSchema,
      responses: {
        200: dbSnapshotCompareResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    exportSnapshotCompareReport: {
      method: "POST" as const,
      path: "/api/db-management/snapshot-compare/report" as const,
      input: dbSnapshotCompareReportRequestSchema,
      responses: {
        200: dbSnapshotCompareReportResponseSchema,
        400: apiErrorSchema,
      },
    },
    applyChanges: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/apply" as const,
      input: dbApplyRequestSchema,
      responses: {
        202: dbApplyResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    deployJobDetail: {
      method: "GET" as const,
      path: "/api/db-management/connections/:id/deploy-jobs/:jobId" as const,
      responses: {
        200: dbDeployJobDetailResponseSchema,
        404: apiErrorSchema,
      },
    },
    graphData: {
      method: "POST" as const,
      path: "/api/db-management/connections/:id/graph" as const,
      input: dbGraphRequestSchema,
      responses: {
        200: dbGraphResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    compareDatabases: {
      method: "POST" as const,
      path: "/api/db-management/db-compare" as const,
      input: dbVsDbCompareRequestSchema,
      responses: {
        200: dbVsDbCompareResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    reviewDatabaseRenames: {
      method: "POST" as const,
      path: "/api/db-management/db-compare/review-renames" as const,
      input: dbVsDbRenameReviewRequestSchema,
      responses: {
        200: dbVsDbCompareResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    previewDatabaseSql: {
      method: "POST" as const,
      path: "/api/db-management/db-compare/preview-sql" as const,
      input: dbVsDbPreviewRequestSchema,
      responses: {
        200: dbVsDbPreviewResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    databaseGraph: {
      method: "POST" as const,
      path: "/api/db-management/db-compare/graph" as const,
      input: dbVsDbGraphRequestSchema,
      responses: {
        200: dbVsDbGraphResponseSchema,
        400: apiErrorSchema,
        404: apiErrorSchema,
      },
    },
    getComparePolicy: {
      method: "GET" as const,
      path: "/api/db-management/db-compare/policy" as const,
      responses: {
        200: dbComparePolicySchema,
      },
    },
    updateComparePolicy: {
      method: "PUT" as const,
      path: "/api/db-management/db-compare/policy" as const,
      input: dbComparePolicySchema,
      responses: {
        200: dbComparePolicySchema,
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
  if (!params) {
    return url;
  }

  for (const [key, value] of Object.entries(params)) {
    const token = `:${key}`;
    if (!url.includes(token)) {
      continue;
    }
    url = url.replace(token, String(value));
  }

  return url;
}
