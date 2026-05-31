import { formatWorkbenchError } from "./workbench-errors";

export type WorkbenchSchemaNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export function normalizeSchemaName(value: string | null | undefined): string {
  return value?.trim() || "public";
}

export function buildSchemaOptions(input: {
  driver: string;
  defaultSchema?: string | null;
  activeSchema: string;
  schemaOptionsRaw: string[];
}): string[] {
  if (input.driver !== "postgres") return [];

  const merged = new Set<string>(["public"]);
  const defaultSchema = input.defaultSchema?.trim();
  if (defaultSchema) {
    merged.add(defaultSchema);
  }

  const activeSchema = input.activeSchema.trim();
  if (activeSchema) {
    merged.add(activeSchema);
  }

  for (const schema of input.schemaOptionsRaw) {
    const normalized = schema.trim();
    if (normalized) {
      merged.add(normalized);
    }
  }

  return Array.from(merged).sort((left, right) => left.localeCompare(right));
}

export function resolveSelectedTableName(
  currentTableName: string | null,
  tables: Array<{ name: string }> | undefined,
): string | null {
  const sortedTableNames = [...(tables ?? [])]
    .map((table) => table.name)
    .sort((left, right) => left.localeCompare(right));

  if (sortedTableNames.length === 0) {
    return null;
  }

  return currentTableName && sortedTableNames.includes(currentTableName)
    ? currentTableName
    : sortedTableNames[0] ?? null;
}

export function buildSchemaLoadFailureNotice(message: string): WorkbenchSchemaNotice {
  return {
    title: "数据库当前不可连接",
    description: message,
    variant: "destructive",
  };
}

export function buildSchemaOptionsFailureNotice(error: unknown): WorkbenchSchemaNotice {
  return {
    title: "Schema list unavailable",
    description: formatWorkbenchError(
      error,
      "Unable to list PostgreSQL schemas for this connection.",
    ),
    variant: "destructive",
  };
}

export function buildSchemaSwitchFailureNotice(error: unknown): WorkbenchSchemaNotice {
  return {
    title: "Schema switch failed",
    description: formatWorkbenchError(
      error,
      "Unable to persist schema selection for this connection.",
    ),
    variant: "destructive",
  };
}
