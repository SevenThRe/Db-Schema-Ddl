import type {
  DbLiveExportIssue,
  DbLiveExportIssueSummary,
  DbSchemaCatalog,
  DdlImportCatalog,
  DdlImportDialect,
  DdlImportIssue,
  DdlImportIssueSummary,
  DdlImportSourceMode,
} from "@shared/schema";

interface IssueCollectionResult {
  issues: DdlImportIssue[];
  summary: DdlImportIssueSummary;
}

interface LiveExportIssueCollectionResult {
  issues: DbLiveExportIssue[];
  summary: DbLiveExportIssueSummary;
}

function pushIssue(
  issues: DdlImportIssue[],
  issue: DdlImportIssue,
): void {
  issues.push(issue);
}

function pushLiveExportIssue(
  issues: DbLiveExportIssue[],
  issue: DbLiveExportIssue,
): void {
  issues.push(issue);
}

export function summarizeDdlImportIssues(issues: DdlImportIssue[]): DdlImportIssueSummary {
  return issues.reduce<DdlImportIssueSummary>(
    (summary, issue) => {
      if (issue.severity === "blocking") {
        summary.blockingCount += 1;
      } else if (issue.severity === "confirm") {
        summary.confirmCount += 1;
      } else {
        summary.infoCount += 1;
      }
      return summary;
    },
    { blockingCount: 0, confirmCount: 0, infoCount: 0 },
  );
}

export function summarizeDbLiveExportIssues(issues: DbLiveExportIssue[]): DbLiveExportIssueSummary {
  return issues.reduce<DbLiveExportIssueSummary>(
    (summary, issue) => {
      if (issue.severity === "blocking") {
        summary.blockingCount += 1;
      } else if (issue.severity === "confirm") {
        summary.confirmCount += 1;
      } else {
        summary.infoCount += 1;
      }
      return summary;
    },
    { blockingCount: 0, confirmCount: 0, infoCount: 0 },
  );
}

export function collectDdlImportIssues(args: {
  sqlText: string;
  catalog: DdlImportCatalog;
  sourceMode: DdlImportSourceMode;
  dialect: DdlImportDialect;
  parserError?: string;
}): IssueCollectionResult {
  const issues: DdlImportIssue[] = [];
  const normalizedSql = args.sqlText;
  const isOracle = args.dialect === "oracle";

  if (args.parserError) {
    pushIssue(issues, {
      severity: "blocking",
      kind: "parser_error",
      entityKey: "source:sql",
      message: isOracle
        ? "Failed to parse the provided Oracle subset DDL."
        : "Failed to parse the provided MySQL DDL.",
      detail: args.parserError,
    });
  }

  const rules: Array<{
    pattern: RegExp;
    severity: DdlImportIssue["severity"];
    kind: DdlImportIssue["kind"];
    entityKey: string;
    message: string;
  }> = [
    {
      pattern: /\bcreate\s+temporary\s+table\b/i,
      severity: "blocking",
      kind: "parser_unsupported",
      entityKey: "source:create-temporary-table",
      message: "CREATE TEMPORARY TABLE is outside the supported reverse-import subset.",
    },
    {
      pattern: /\bcreate\s+table\b[\s\S]+?\bas\s+select\b/i,
      severity: "blocking",
      kind: "parser_unsupported",
      entityKey: "source:create-table-as-select",
      message: "CREATE TABLE AS SELECT is not supported in the first reverse-authoring cut.",
    },
    {
      pattern: /\balter\s+table\b|\binsert\s+into\b|\bupdate\b|\bdelete\s+from\b|\bdrop\s+(table|view|index|trigger|procedure|function)\b/i,
      severity: "blocking",
      kind: "parser_unsupported",
      entityKey: "source:bundle-unsupported",
      message: "ALTER TABLE, DML, and DROP statements are out of scope for structure-oriented reverse import.",
    },
    {
      pattern: /\bcreate\s+view\b|\bcreate\s+trigger\b|\bprocedure\b|\bfunction\b|\bpackage\b|\bgrant\b/i,
      severity: "blocking",
      kind: "parser_unsupported",
      entityKey: "source:non-table-ddl",
      message: isOracle
        ? "Only the documented Oracle CREATE TABLE subset is supported in this phase."
        : "Only MySQL CREATE TABLE schema definitions are supported in this phase.",
    },
    {
      pattern: /\bgenerated\s+always\b|\bas\s*\(/i,
      severity: "blocking",
      kind: "workbook_inexpressible",
      entityKey: "source:generated-column",
      message: "Generated or computed columns cannot be represented safely in the official workbook contract.",
    },
    {
      pattern: /\bcheck\s*\(/i,
      severity: "blocking",
      kind: "workbook_inexpressible",
      entityKey: "source:check-constraint",
      message: "CHECK constraints are not supported by the current workbook export contract.",
    },
    {
      pattern: /\bpartition\s+by\b/i,
      severity: "blocking",
      kind: "workbook_inexpressible",
      entityKey: "source:partition",
      message: "Partitioning clauses are not supported by the current workbook export contract.",
    },
    {
      pattern: /\btablespace\b|\bstorage\s*\(/i,
      severity: "blocking",
      kind: "parser_unsupported",
      entityKey: "source:oracle-storage",
      message: "Oracle tablespace and storage attributes are outside the documented first-cut subset.",
    },
    {
      pattern: /\bvirtual\b/i,
      severity: "blocking",
      kind: "workbook_inexpressible",
      entityKey: "source:oracle-virtual-column",
      message: "Oracle virtual columns cannot be represented safely in the official workbook contract.",
    },
    {
      pattern: /\bidentity\b/i,
      severity: "confirm",
      kind: "workbook_lossy",
      entityKey: "source:oracle-identity",
      message: "Oracle identity metadata may not round-trip faithfully through the workbook format.",
    },
    {
      pattern: /\busing\s+index\b/i,
      severity: "confirm",
      kind: "workbook_lossy",
      entityKey: "source:oracle-index-options",
      message: "Advanced Oracle index options are reviewable but may not survive workbook export.",
    },
    {
      pattern: /\bfulltext\b|\bspatial\b/i,
      severity: "confirm",
      kind: "workbook_lossy",
      entityKey: "source:special-index",
      message: "FULLTEXT/SPATIAL index metadata may not round-trip faithfully through the workbook format.",
    },
    {
      pattern: /\bcollate\b/i,
      severity: "info",
      kind: "info",
      entityKey: "source:collate",
      message: "COLLATE clauses are currently treated as informational and may not be preserved in workbook export.",
    },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(normalizedSql)) {
      pushIssue(issues, {
        severity: rule.severity,
        kind: rule.kind,
        entityKey: rule.entityKey,
        message: rule.message,
      });
    }
  }

  if (!args.parserError && args.catalog.tables.length === 0) {
    pushIssue(issues, {
      severity: "blocking",
      kind: "parser_unsupported",
      entityKey: "source:no-create-table",
      message: isOracle
        ? "No supported Oracle CREATE TABLE definitions were found in the provided SQL."
        : "No supported CREATE TABLE definitions were found in the provided SQL.",
    });
  }

  for (const table of args.catalog.tables) {
    if (table.comment) {
      pushIssue(issues, {
        severity: "confirm",
        kind: "workbook_lossy",
        entityKey: `table:${table.name}:comment`,
        tableName: table.name,
        message: "Table comments are not modeled explicitly by the current workbook contract.",
      });
    }

    table.columns.forEach((column) => {
      if (column.defaultValue) {
        pushIssue(issues, {
          severity: "confirm",
          kind: "workbook_lossy",
          entityKey: `column:${table.name}.${column.name}:default`,
          tableName: table.name,
          columnName: column.name,
          message: "Column default values are not preserved structurally in workbook export.",
        });
      }

      if (column.unique) {
        pushIssue(issues, {
          severity: "confirm",
          kind: "workbook_lossy",
          entityKey: `column:${table.name}.${column.name}:unique`,
          tableName: table.name,
          columnName: column.name,
          message: "Column-level UNIQUE constraints are not preserved structurally in workbook export.",
        });
      }
    });

    table.indexes
      .filter((index) => !index.primary)
      .forEach((index) => {
        pushIssue(issues, {
          severity: "confirm",
          kind: "workbook_lossy",
          entityKey: `index:${table.name}.${index.name}`,
          tableName: table.name,
          constraintName: index.name,
          message: "Secondary indexes are not preserved structurally in workbook export.",
        });
      });

    table.foreignKeys.forEach((foreignKey) => {
      pushIssue(issues, {
        severity: "confirm",
        kind: "workbook_lossy",
        entityKey: `fk:${table.name}.${foreignKey.name}`,
        tableName: table.name,
        constraintName: foreignKey.name,
        message: "Foreign keys are not preserved structurally in workbook export.",
      });
    });
  }

  return {
    issues,
    summary: summarizeDdlImportIssues(issues),
  };
}

export function collectDbLiveExportIssues(args: {
  catalog: DbSchemaCatalog;
  selectedTableNames?: string[];
}): LiveExportIssueCollectionResult {
  const selectedNames = new Set(
    (args.selectedTableNames ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const tables = args.catalog.tables.filter((table) =>
    selectedNames.size === 0 || selectedNames.has(table.name.trim().toLowerCase()),
  );

  const issues: DbLiveExportIssue[] = [];

  for (const table of tables) {
    if (table.comment) {
      pushLiveExportIssue(issues, {
        severity: "confirm",
        kind: "workbook_lossy",
        entityKey: `table:${table.name}:comment`,
        tableName: table.name,
        message: "Table comments are not modeled explicitly by the current workbook contract.",
      });
    }

    if (table.engine) {
      pushLiveExportIssue(issues, {
        severity: "info",
        kind: "info",
        entityKey: `table:${table.name}:engine`,
        tableName: table.name,
        message: "Engine metadata is informational and may not be preserved structurally in workbook export.",
        detail: table.engine,
      });
    }

    table.columns.forEach((column) => {
      const extra = String(column.extra ?? "").toLowerCase();
      if (extra.includes("generated")) {
        pushLiveExportIssue(issues, {
          severity: "blocking",
          kind: "workbook_inexpressible",
          entityKey: `column:${table.name}.${column.name}:generated`,
          tableName: table.name,
          columnName: column.name,
          message: "Generated columns cannot be represented safely in the official workbook contract.",
          detail: column.extra,
        });
      }

      if (column.defaultValue != null && String(column.defaultValue).trim() !== "") {
        pushLiveExportIssue(issues, {
          severity: "confirm",
          kind: "workbook_lossy",
          entityKey: `column:${table.name}.${column.name}:default`,
          tableName: table.name,
          columnName: column.name,
          message: "Column default values are not preserved structurally in workbook export.",
        });
      }
    });

    table.indexes
      .filter((index) => !index.primary)
      .forEach((index) => {
        pushLiveExportIssue(issues, {
          severity: "confirm",
          kind: "workbook_lossy",
          entityKey: `index:${table.name}.${index.name}`,
          tableName: table.name,
          constraintName: index.name,
          message: index.unique
            ? "Secondary UNIQUE intent is not preserved structurally in workbook export."
            : "Secondary indexes are not preserved structurally in workbook export.",
        });
      });

    table.foreignKeys.forEach((foreignKey) => {
      pushLiveExportIssue(issues, {
        severity: "confirm",
        kind: "workbook_lossy",
        entityKey: `fk:${table.name}.${foreignKey.name}`,
        tableName: table.name,
        constraintName: foreignKey.name,
        message: "Foreign keys are not preserved structurally in workbook export.",
      });
    });
  }

  return {
    issues,
    summary: summarizeDbLiveExportIssues(issues),
  };
}
