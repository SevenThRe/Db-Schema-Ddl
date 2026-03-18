import type {
  DdlImportCatalog,
  DdlImportColumn,
  DdlImportForeignKey,
  DdlImportIndex,
  DdlImportTable,
} from "@shared/schema";
import type { RawDdlImportDatabase } from "./parser-adapter";

function parseColumnType(typeName: string): { dataType: string; dataTypeArgs?: string } {
  const normalized = typeName.trim();
  const match = normalized.match(/^([^(]+)\((.+)\)$/);
  if (!match) {
    return { dataType: normalized.toUpperCase() };
  }

  return {
    dataType: match[1]!.trim().toUpperCase(),
    dataTypeArgs: match[2]!.trim(),
  };
}

function normalizeColumn(raw: RawDdlImportDatabase["tables"][number]["fields"][number]): DdlImportColumn {
  const { dataType, dataTypeArgs } = parseColumnType(raw.type.type_name);

  return {
    name: raw.name,
    dataType,
    dataTypeArgs,
    columnType: raw.type.type_name,
    nullable: !raw.not_null,
    defaultValue: raw.dbdefault
      ? {
          type:
            raw.dbdefault.type === "number" ||
            raw.dbdefault.type === "string" ||
            raw.dbdefault.type === "boolean"
              ? raw.dbdefault.type
              : "expression",
          value: String(raw.dbdefault.value),
        }
      : undefined,
    autoIncrement: Boolean(raw.increment),
    primaryKey: Boolean(raw.pk),
    unique: Boolean(raw.unique),
    comment: raw.note?.value,
  };
}

function normalizeIndex(raw: RawDdlImportDatabase["tables"][number]["indexes"][number]): DdlImportIndex {
  return {
    name: raw.name ?? "unnamed_index",
    unique: Boolean(raw.unique),
    primary: Boolean(raw.pk),
    indexType: raw.type ?? undefined,
    comment: raw.note?.value,
    columns: raw.columns.map((column) => ({
      columnName: column.value,
    })),
  };
}

function normalizeForeignKeys(
  tableName: string,
  refs: RawDdlImportDatabase["refs"],
): DdlImportForeignKey[] {
  return refs.reduce<DdlImportForeignKey[]>((acc, ref) => {
      const referencing = ref.endpoints.find((endpoint) => endpoint.tableName === tableName && endpoint.relation === "*")
        ?? ref.endpoints.find((endpoint) => endpoint.tableName === tableName);
      const referenced = ref.endpoints.find((endpoint) => endpoint !== referencing);

      if (!referencing || !referenced) {
        return acc;
      }

      acc.push({
        name: ref.name ?? `${tableName}_${referencing.fieldNames.join("_")}_fk`,
        referencedTableName: referenced.tableName,
        referencedTableSchema: referenced.schemaName ?? undefined,
        onDelete: ref.onDelete ?? undefined,
        onUpdate: ref.onUpdate ?? undefined,
        columns: referencing.fieldNames.map((columnName, index) => ({
          columnName,
            referencedColumnName: referenced.fieldNames[index] ?? referenced.fieldNames[0] ?? columnName,
          })),
      });

      return acc;
    }, []);
}

function normalizeTable(
  raw: RawDdlImportDatabase["tables"][number],
  refs: RawDdlImportDatabase["refs"],
): DdlImportTable {
  return {
    name: raw.name,
    comment: raw.note?.value,
    columns: raw.fields.map(normalizeColumn),
    indexes: raw.indexes.map(normalizeIndex),
    foreignKeys: normalizeForeignKeys(raw.name, refs),
  };
}

export function normalizeImportedDdl(raw: RawDdlImportDatabase): DdlImportCatalog {
  return {
    dialect: "mysql",
    databaseName: "ddl_import",
    tables: raw.tables.map((table) => normalizeTable(table, raw.refs)),
  };
}
