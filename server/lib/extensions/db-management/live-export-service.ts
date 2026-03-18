import type {
  DdlImportCatalog,
  DdlImportColumn,
  DdlImportDefaultValue,
  DbLiveExportExecuteRequest,
  DbLiveExportExecuteResponse,
  DbLiveExportPreviewRequest,
  DbLiveExportPreviewResponse,
  DbSchemaCatalog,
  DdlSettings,
  WorkbookTemplateVariantId,
} from "@shared/schema";
import { storage } from "../../../storage";
import { exportWorkbookFromDdlCatalog } from "../../ddl-import/export-service";
import { collectDbLiveExportIssues } from "../../ddl-import/issues";
import { getWorkbookTemplateVariant } from "../../workbook-templates";
import { resolveLiveDbCatalogSource, type ResolvedLiveDbCatalogSource } from "./history-service";

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function buildArtifactKey(args: {
  connectionId: number;
  databaseName: string;
  resolvedSnapshotHash: string;
  templateId: WorkbookTemplateVariantId;
  selectedTableNames: string[];
}): string {
  const selectionKey =
    args.selectedTableNames.length > 0
      ? args.selectedTableNames.map((name) => normalizeName(name)).sort().join(",")
      : "*";
  return [
    "live-export",
    String(args.connectionId),
    normalizeName(args.databaseName),
    args.resolvedSnapshotHash,
    args.templateId,
    selectionKey,
  ].join(":");
}

function resolveSelectableTableNames(catalog: DbSchemaCatalog): string[] {
  return catalog.tables.map((table) => table.name);
}

function resolveSelection(args: {
  selectableTableNames: string[];
  requestedTableNames: string[];
}): string[] {
  const selectableSet = new Set(args.selectableTableNames.map((name) => normalizeName(name)));
  const requested = args.requestedTableNames.map((name) => name.trim()).filter(Boolean);
  if (requested.length === 0) {
    return [...args.selectableTableNames];
  }

  const missing = requested.filter((name) => !selectableSet.has(normalizeName(name)));
  if (missing.length > 0) {
    throw new Error(`Selected tables were not found in the resolved catalog: ${missing.join(", ")}`);
  }

  return requested;
}

function buildPreviewArtifact(args: {
  input: DbLiveExportPreviewRequest;
  resolved: ResolvedLiveDbCatalogSource;
}): DbLiveExportPreviewResponse {
  return rebaseLiveExportArtifact(
    {
      artifactVersion: "v1",
      artifactKey: "",
      connectionId: args.input.connectionId,
      databaseName: args.input.databaseName,
      freshnessMode: args.input.freshnessMode,
      resolvedSnapshotHash: args.resolved.resolvedSnapshotHash,
      resolvedSnapshotCapturedAt: args.resolved.resolvedSnapshotCapturedAt,
      catalog: args.resolved.catalog,
      selectedTableNames: [],
      selectableTableNames: [],
      templateId: args.input.templateId,
      issueSummary: {
        blockingCount: 0,
        confirmCount: 0,
        infoCount: 0,
      },
      issues: [],
      canExport: false,
    },
    {
      selectedTableNames: args.input.selectedTableNames,
      templateId: args.input.templateId,
    },
  );
}

export function rebaseLiveExportArtifact(
  artifact: DbLiveExportPreviewResponse,
  options: {
    selectedTableNames?: string[];
    templateId?: WorkbookTemplateVariantId;
  } = {},
): DbLiveExportPreviewResponse {
  const selectableTableNames = resolveSelectableTableNames(artifact.catalog);
  const selectedTableNames = resolveSelection({
    selectableTableNames,
    requestedTableNames: options.selectedTableNames ?? artifact.selectedTableNames,
  });
  const { issues, summary } = collectDbLiveExportIssues({
    catalog: artifact.catalog,
    selectedTableNames,
  });

  return {
    artifactVersion: "v1",
    artifactKey: buildArtifactKey({
      connectionId: artifact.connectionId,
      databaseName: artifact.databaseName,
      resolvedSnapshotHash: artifact.resolvedSnapshotHash,
      templateId: options.templateId ?? artifact.templateId,
      selectedTableNames,
    }),
    connectionId: artifact.connectionId,
    databaseName: artifact.databaseName,
    freshnessMode: artifact.freshnessMode,
    resolvedSnapshotHash: artifact.resolvedSnapshotHash,
    resolvedSnapshotCapturedAt: artifact.resolvedSnapshotCapturedAt,
    catalog: artifact.catalog,
    selectedTableNames,
    selectableTableNames,
    templateId: options.templateId ?? artifact.templateId,
    issueSummary: summary,
    issues,
    canExport: summary.blockingCount === 0 && selectedTableNames.length > 0,
  };
}

export interface LiveDbWorkbookExportServiceDeps {
  resolveCatalogSource?: (args: {
    connectionId: number;
    databaseName: string;
    freshnessMode: DbLiveExportPreviewRequest["freshnessMode"];
  }) => Promise<ResolvedLiveDbCatalogSource>;
}

export async function previewLiveDbWorkbookExport(
  input: DbLiveExportPreviewRequest,
  deps: LiveDbWorkbookExportServiceDeps = {},
): Promise<DbLiveExportPreviewResponse> {
  getWorkbookTemplateVariant(input.templateId);

  if (!(await storage.getDbConnection(input.connectionId))) {
    throw new Error("DB connection not found.");
  }

  const resolved = await (deps.resolveCatalogSource ?? resolveLiveDbCatalogSource)({
    connectionId: input.connectionId,
    databaseName: input.databaseName,
    freshnessMode: input.freshnessMode,
  });

  return buildPreviewArtifact({ input, resolved });
}

export function assertExecutableLiveExport(
  artifact: DbLiveExportPreviewResponse,
  allowLossyExport: boolean,
): void {
  if (!artifact.canExport) {
    throw new Error("Live DB workbook export is blocked by current preview issues.");
  }
  if (artifact.selectedTableNames.length === 0) {
    throw new Error("Select at least one table before exporting a workbook.");
  }
  if (artifact.issueSummary.confirmCount > 0 && !allowLossyExport) {
    throw new Error("Live DB workbook export requires lossy export confirmation.");
  }
}

function toDefaultValue(value: string | null | undefined): DdlImportDefaultValue | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^(true|false)$/i.test(trimmed)) {
    return { type: "boolean", value: trimmed.toLowerCase() };
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { type: "number", value: trimmed };
  }
  if (/^'.*'$/.test(trimmed) || /^".*"$/.test(trimmed)) {
    return { type: "string", value: trimmed.slice(1, -1) };
  }
  return { type: "expression", value: trimmed };
}

function toDdlImportColumn(
  tableName: string,
  column: DbSchemaCatalog["tables"][number]["columns"][number],
  primaryKeyColumns: string[],
): DdlImportColumn {
  const numericSize =
    column.numericPrecision != null
      ? column.numericScale != null
        ? `${column.numericPrecision},${column.numericScale}`
        : String(column.numericPrecision)
      : undefined;
  const dataTypeArgs = column.characterMaxLength != null
    ? String(column.characterMaxLength)
    : numericSize;

  return {
    entityKey: `column:${tableName}.${column.name}`,
    name: column.name,
    dataType: column.dataType.toUpperCase(),
    dataTypeArgs,
    columnType: column.columnType ?? column.dataType.toUpperCase(),
    nullable: column.nullable,
    defaultValue: toDefaultValue(column.defaultValue),
    autoIncrement: column.autoIncrement,
    primaryKey: primaryKeyColumns.includes(column.name),
    unique: false,
    comment: column.comment,
  };
}

function toDdlImportCatalog(catalog: DbSchemaCatalog): DdlImportCatalog {
  return {
    sourceMode: "mysql-file",
    dialect: "mysql",
    databaseName: catalog.databaseName,
    tables: catalog.tables.map((table) => {
      const primaryKeyColumns = table.primaryKey?.columns ?? [];
      return {
        entityKey: `table:${table.name}`,
        name: table.name,
        comment: table.comment,
        engine: table.engine,
        columns: table.columns.map((column) => toDdlImportColumn(table.name, column, primaryKeyColumns)),
        indexes: table.indexes.map((index) => ({
          entityKey: `index:${table.name}.${index.name}`,
          name: index.name,
          unique: index.unique,
          primary: index.primary,
          indexType: index.indexType,
          comment: undefined,
          columns: index.columns.map((column) => ({
            columnName: column.columnName,
            seqInIndex: column.seqInIndex,
            direction: column.direction,
            subPart: column.subPart,
          })),
        })),
        foreignKeys: table.foreignKeys.map((foreignKey) => ({
          entityKey: `fk:${table.name}.${foreignKey.name}`,
          name: foreignKey.name,
          referencedTableName: foreignKey.referencedTableName,
          referencedTableSchema: foreignKey.referencedTableSchema,
          onDelete: foreignKey.deleteRule,
          onUpdate: foreignKey.updateRule,
          columns: foreignKey.columnMappings.map((mapping) => ({
            columnName: mapping.columnName,
            referencedColumnName: mapping.referencedColumnName,
          })),
        })),
      };
    }),
  };
}

export interface ExecuteLiveDbWorkbookExportDeps {
  storage?: Pick<typeof storage, "createUploadedFile" | "findFileByHash">;
  uploadsDir: string;
  settings: Pick<DdlSettings, "maxConsecutiveEmptyRows" | "pkMarkers">;
}

export async function executeLiveDbWorkbookExport(
  request: DbLiveExportExecuteRequest,
  deps: ExecuteLiveDbWorkbookExportDeps,
): Promise<DbLiveExportExecuteResponse> {
  const reviewedArtifact = rebaseLiveExportArtifact(request.artifact, {
    selectedTableNames: request.selectedTableNames,
    templateId: request.templateId,
  });
  assertExecutableLiveExport(reviewedArtifact, request.allowLossyExport);

  const exported = await exportWorkbookFromDdlCatalog(
    {
      catalog: toDdlImportCatalog(reviewedArtifact.catalog),
      templateId: reviewedArtifact.templateId,
      selectedTableNames: reviewedArtifact.selectedTableNames,
      originalName: request.originalName,
    },
    {
      storage: deps.storage ?? storage,
      uploadsDir: deps.uploadsDir,
      settings: deps.settings,
    },
  );

  return {
    artifact: reviewedArtifact,
    file: exported.file,
    template: exported.template,
    validation: exported.validation,
    selectedTableNames: exported.selectedTableNames,
    issueSummary: reviewedArtifact.issueSummary,
    rememberedTemplateId: reviewedArtifact.templateId,
  };
}
