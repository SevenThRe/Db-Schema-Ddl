import { z } from 'zod';
import { uploadedFiles, insertUploadedFileSchema, tableInfoSchema, generateDdlRequestSchema, ddlSettingsSchema, processingTaskSchema } from './schema';
import { apiErrorSchema } from "./error-codes";

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
  },
  ddl: {
    generate: {
      method: 'POST' as const,
      path: '/api/generate-ddl' as const,
      input: generateDdlRequestSchema,
      responses: {
        200: z.object({ ddl: z.string() }),
        400: apiErrorSchema,
      },
    },
    exportZip: {
      method: 'POST' as const,
      path: '/api/export-ddl-zip' as const,
      input: generateDdlRequestSchema,
      responses: {
        200: z.custom<Blob>(), // Binary response (ZIP file)
        400: apiErrorSchema,
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
