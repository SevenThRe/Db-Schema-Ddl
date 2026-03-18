import { Parser } from "@dbml/core";
import { z } from "zod";

const rawFieldSchema = z.object({
  name: z.string().min(1),
  type: z.object({
    type_name: z.string().min(1),
    schemaName: z.string().nullable().optional(),
  }),
  unique: z.boolean().optional(),
  pk: z.boolean().optional(),
  not_null: z.boolean().optional(),
  note: z.object({ value: z.string() }).optional(),
  dbdefault: z.object({
    type: z.string().optional(),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }).optional(),
  increment: z.boolean().optional(),
  checks: z.array(z.unknown()).optional(),
});

const rawIndexSchema = z.object({
  name: z.string().nullable().optional(),
  unique: z.boolean().optional(),
  pk: z.boolean().optional(),
  type: z.string().nullable().optional(),
  note: z.object({ value: z.string() }).optional(),
  columns: z.array(z.object({
    type: z.string(),
    value: z.string(),
  })).default([]),
});

const rawRefSchema = z.object({
  name: z.string().nullable().optional(),
  onDelete: z.string().nullable().optional(),
  onUpdate: z.string().nullable().optional(),
  endpoints: z.array(z.object({
    tableName: z.string().min(1),
    schemaName: z.string().nullable().optional(),
    fieldNames: z.array(z.string().min(1)).default([]),
    relation: z.string().optional(),
  })).min(2),
});

const rawTableSchema = z.object({
  name: z.string().min(1),
  fields: z.array(rawFieldSchema).default([]),
  indexes: z.array(rawIndexSchema).default([]),
  note: z.object({ value: z.string() }).optional(),
  checks: z.array(z.unknown()).optional(),
});

const rawDatabaseSchema = z.object({
  tables: z.array(rawTableSchema).default([]),
  refs: z.array(rawRefSchema).default([]),
});

export type RawDdlImportDatabase = z.infer<typeof rawDatabaseSchema>;

export class DdlImportParserError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "DdlImportParserError";
  }
}

export function parseMysqlDdlToRawDatabase(sqlText: string): RawDdlImportDatabase {
  try {
    const parsed = Parser.parseMySQLToJSONv2(sqlText);
    return rawDatabaseSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new DdlImportParserError("Parsed DDL did not match the expected adapter shape.", error.message);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new DdlImportParserError("Failed to parse MySQL DDL.", message);
  }
}
