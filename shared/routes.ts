import { z } from 'zod';
import { uploadedFiles, insertUploadedFileSchema, tableInfoSchema, generateDdlRequestSchema, ddlSettingsSchema, processingTaskSchema } from './schema';

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
        400: z.object({ message: z.string() }),
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
        404: z.object({ message: z.string() }),
      },
    },
    getTableInfo: {
      method: 'GET' as const,
      path: '/api/files/:id/sheets/:sheetName' as const,
      responses: {
        200: z.array(tableInfoSchema),
        404: z.object({ message: z.string() }),
        400: z.object({ message: z.string() }),
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
        404: z.object({ message: z.string() }),
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
        400: z.object({ message: z.string() }),
      },
    },
    exportZip: {
      method: 'POST' as const,
      path: '/api/export-ddl-zip' as const,
      input: generateDdlRequestSchema,
      responses: {
        200: z.custom<Blob>(), // Binary response (ZIP file)
        400: z.object({ message: z.string() }),
      },
    },
  },
  tasks: {
    get: {
      method: 'GET' as const,
      path: '/api/tasks/:id' as const,
      responses: {
        200: processingTaskSchema,
        404: z.object({ message: z.string() }),
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
        400: z.object({ message: z.string() }),
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
