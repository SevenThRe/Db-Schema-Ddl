import type { DbDriver, DbTableSchema } from "@shared/schema";
import {
  buildCreateTableDdl,
  tableDraftFromSchema,
} from "./table-designer-model";
import { buildInsertScript } from "./result-sql-export";
import { buildDropTableSql } from "./table-operations-model";

// Navicat-style "Export as SQL" — a self-contained dump of a table's structure
// and/or data, restorable by re-running the script. Composes the introspection
// -> CREATE generator and the INSERT generator.

export interface BuildTableSqlDumpOptions {
  driver: DbDriver;
  schemaName?: string;
  /** Emit the CREATE TABLE (from the introspected schema). Default true. */
  includeStructure?: boolean;
  /** Emit INSERT statements for the supplied rows. Default true. */
  includeData?: boolean;
  /** Prefix a DROP TABLE IF EXISTS so the dump is idempotent. Default true. */
  dropBeforeCreate?: boolean;
  batchSize?: number;
}

export function buildTableSqlDump(
  schema: DbTableSchema,
  rows: (string | number | boolean | null)[][],
  options: BuildTableSqlDumpOptions,
): string {
  const includeStructure = options.includeStructure ?? true;
  const includeData = options.includeData ?? true;
  const dropBeforeCreate = options.dropBeforeCreate ?? true;
  const sections: string[] = [];

  if (includeStructure) {
    if (dropBeforeCreate) {
      sections.push(
        buildDropTableSql(schema.name, options.driver, {
          ifExists: true,
          schemaName: options.schemaName,
        }),
      );
    }
    sections.push(
      buildCreateTableDdl(tableDraftFromSchema(schema), options.driver, options.schemaName),
    );
  }

  if (includeData && rows.length > 0) {
    sections.push(
      buildInsertScript({
        driver: options.driver,
        tableName: schema.name,
        schemaName: options.schemaName,
        columns: schema.columns.map((column) => ({ name: column.name })),
        rows,
        batchSize: options.batchSize,
      }),
    );
  }

  return sections.join("\n\n");
}
