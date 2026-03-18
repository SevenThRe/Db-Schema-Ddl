import type { DdlImportCatalog, DdlImportIssue, DdlImportIssueSummary } from "@shared/schema";

interface IssueCollectionResult {
  issues: DdlImportIssue[];
  summary: DdlImportIssueSummary;
}

function pushIssue(
  issues: DdlImportIssue[],
  issue: DdlImportIssue,
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

export function collectDdlImportIssues(args: {
  sqlText: string;
  catalog: DdlImportCatalog;
  parserError?: string;
}): IssueCollectionResult {
  const issues: DdlImportIssue[] = [];
  const normalizedSql = args.sqlText;

  if (args.parserError) {
    pushIssue(issues, {
      severity: "blocking",
      kind: "parser_error",
      entityKey: "source:sql",
      message: "Failed to parse the provided MySQL DDL.",
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
      message: "CREATE TEMPORARY TABLE is outside the supported MySQL-first import subset.",
    },
    {
      pattern: /\bcreate\s+table\b[\s\S]+?\bas\s+select\b/i,
      severity: "blocking",
      kind: "parser_unsupported",
      entityKey: "source:create-table-as-select",
      message: "CREATE TABLE AS SELECT is not supported in the first reverse-authoring cut.",
    },
    {
      pattern: /\bcreate\s+view\b|\bcreate\s+trigger\b|\bprocedure\b|\bfunction\b/i,
      severity: "blocking",
      kind: "parser_unsupported",
      entityKey: "source:non-table-ddl",
      message: "Only MySQL CREATE TABLE schema definitions are supported in this phase.",
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
      message: "No supported CREATE TABLE definitions were found in the provided SQL.",
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
