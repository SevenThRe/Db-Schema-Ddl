import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
} from "@shared/schema";
import {
  buildAutocompleteContext,
  type SqlAutocompleteContext,
} from "./sql-autocomplete";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import { formatWorkbenchError } from "./workbench-errors";
import { buildSchemaOptions } from "./workbench-schema-runtime";

export interface BuildWorkbenchSchemaContextInput {
  connection: Pick<DbConnectionConfig, "driver" | "defaultSchema">;
  activeSchema: string;
  runtimeSchema: string | undefined;
  schemaOptionsRaw: string[];
  schemaSnapshot: DbSchemaSnapshot | null | undefined;
  schemaQueryError: unknown;
  selectedTableName: string | null | undefined;
  sqlMemory: SqlWorkbenchMemoryState;
}

export interface WorkbenchSchemaContext {
  schemaOptions: string[];
  autocompleteContext: SqlAutocompleteContext;
  schemaErrorMessage: string | null;
}

export function buildWorkbenchSchemaContext(
  input: BuildWorkbenchSchemaContextInput,
): WorkbenchSchemaContext {
  return {
    schemaOptions: buildSchemaOptions({
      driver: input.connection.driver,
      defaultSchema: input.connection.defaultSchema,
      activeSchema: input.activeSchema,
      schemaOptionsRaw: input.schemaOptionsRaw,
    }),
    autocompleteContext: buildAutocompleteContext(
      input.schemaSnapshot,
      input.runtimeSchema,
      input.selectedTableName,
      input.connection.driver,
      input.sqlMemory,
    ),
    schemaErrorMessage: input.schemaQueryError
      ? formatWorkbenchError(
          input.schemaQueryError,
          "Unable to load schema from the current connection.",
        )
      : null,
  };
}
