import fs from "node:fs/promises";
import path from "node:path";

import type { DbColumnSchema, DbSchemaSnapshot } from "../shared/schema.ts";
import { buildSqlCopilotGenerationSemanticContext } from "../client/src/components/extensions/db-workbench/sql-copilot-generation.ts";
import {
  evaluateSqlCopilotGenerationCases,
  renderSqlCopilotEvaluationArtifactMarkdown,
  type SqlCopilotEvaluationCase,
} from "../client/src/components/extensions/db-workbench/sql-copilot-generation-evaluation.ts";

function column(name: string, primaryKey = false): DbColumnSchema {
  return {
    name,
    dataType: primaryKey ? "bigint" : "varchar",
    nullable: !primaryKey,
    primaryKey,
  };
}

function createPostgresSnapshot(): DbSchemaSnapshot {
  return {
    connectionId: "eval-pg",
    connectionName: "eval-pg",
    database: "app_db",
    schema: "public",
    tables: [
      {
        name: "public.users",
        columns: [column("id", true), column("email"), column("created_at")],
        indexes: [],
        foreignKeys: [],
      },
      {
        name: "public.orders",
        columns: [column("id", true), column("user_id"), column("status"), column("created_at")],
        indexes: [],
        foreignKeys: [
          {
            name: "fk_orders_users",
            columns: ["user_id"],
            referencedTable: "public.users",
            referencedColumns: ["id"],
          },
        ],
      },
    ],
    views: [],
    routines: [],
    triggers: [],
    sequences: [],
  };
}

function createMysqlSnapshot(): DbSchemaSnapshot {
  return {
    connectionId: "eval-mysql",
    connectionName: "eval-mysql",
    database: "shop_db",
    schema: "shop_db",
    tables: [
      {
        name: "shop_db.customers",
        columns: [column("id", true), column("email"), column("tier")],
        indexes: [],
        foreignKeys: [],
      },
      {
        name: "shop_db.orders",
        columns: [column("id", true), column("customer_id"), column("status"), column("order_date")],
        indexes: [],
        foreignKeys: [
          {
            name: "fk_orders_customers",
            columns: ["customer_id"],
            referencedTable: "shop_db.customers",
            referencedColumns: ["id"],
          },
        ],
      },
    ],
    views: [],
    routines: [],
    triggers: [],
    sequences: [],
  };
}

function buildRepresentativeCases(): SqlCopilotEvaluationCase[] {
  const postgresContext = buildSqlCopilotGenerationSemanticContext(
    createPostgresSnapshot(),
    "public",
  );
  const mysqlContext = buildSqlCopilotGenerationSemanticContext(
    createMysqlSnapshot(),
    "shop_db",
  );

  return [
    {
      id: "pg-join-users-orders",
      label: "PostgreSQL grounded join draft",
      completionMode: "natural_language",
      rawOutput: JSON.stringify({
        sql: "SELECT o.id, u.email\nFROM orders o\nJOIN users u ON o.user_id = u.id\nWHERE o.status = :status\nORDER BY o.created_at DESC;",
        summary: "Orders joined to users by foreign key",
        assumptions: ["orders.user_id references users.id", "status should be supplied by the operator"],
        safetyNotes: ["Named parameter :status still requires parameter review before execution"],
      }),
      semanticContext: postgresContext,
      expectedHallucination: false,
      expectedSafetyRegression: false,
    },
    {
      id: "pg-partial-select-completion",
      label: "PostgreSQL partial SQL completion",
      completionMode: "partial_sql_completion",
      rawOutput: JSON.stringify({
        sql: "SELECT status, COUNT(*) AS order_count\nFROM orders\nGROUP BY status\nORDER BY order_count DESC;",
        summary: "Aggregate orders by status",
        assumptions: ["orders.status exists in the grounded schema"],
        safetyNotes: [],
      }),
      semanticContext: postgresContext,
      expectedHallucination: false,
      expectedSafetyRegression: false,
    },
    {
      id: "mysql-customer-orders",
      label: "MySQL customer order listing",
      completionMode: "natural_language",
      rawOutput: JSON.stringify({
        sql: "SELECT o.id, c.email, o.status\nFROM orders o\nJOIN customers c ON o.customer_id = c.id\nWHERE o.order_date >= :from_date\nORDER BY o.order_date DESC;",
        summary: "Recent orders with customer email",
        assumptions: ["orders.customer_id references customers.id"],
        safetyNotes: ["Named parameter :from_date still requires parameter review before execution"],
      }),
      semanticContext: mysqlContext,
      expectedHallucination: false,
      expectedSafetyRegression: false,
    },
    {
      id: "mysql-partial-update-refusal",
      label: "MySQL write draft stays bounded",
      completionMode: "intent_refinement",
      rawOutput: JSON.stringify({
        sql: "UPDATE orders\nSET status = :next_status\nWHERE id = :order_id;",
        summary: "Update one order status by primary key",
        assumptions: ["Operator intends to update exactly one order"],
        safetyNotes: ["Uses named parameters so execution still goes through parameter review and readonly/runtime guards"],
      }),
      semanticContext: mysqlContext,
      expectedHallucination: false,
      expectedSafetyRegression: false,
    },
  ];
}

function parseOutputDir(args: string[]): string {
  const flagIndex = args.findIndex((entry) => entry === "--output-dir");
  if (flagIndex >= 0 && args[flagIndex + 1]) {
    return path.resolve(process.cwd(), args[flagIndex + 1]);
  }
  return path.resolve(process.cwd(), "artifacts", "sql-copilot-evaluation");
}

async function main(): Promise<void> {
  const outputDir = parseOutputDir(process.argv.slice(2));
  await fs.mkdir(outputDir, { recursive: true });

  const artifact = evaluateSqlCopilotGenerationCases(buildRepresentativeCases());
  const stamp = artifact.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `phase53-baseline-${stamp}.json`);
  const markdownPath = path.join(outputDir, `phase53-baseline-${stamp}.md`);

  await fs.writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await fs.writeFile(
    markdownPath,
    `${renderSqlCopilotEvaluationArtifactMarkdown(artifact)}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        jsonPath,
        markdownPath,
        totalCases: artifact.totalCases,
        passCount: artifact.passCount,
        hallucinationRate: artifact.hallucinationRate,
        safetyRegressionRate: artifact.safetyRegressionRate,
      },
      null,
      2,
    ),
  );
}

void main();
