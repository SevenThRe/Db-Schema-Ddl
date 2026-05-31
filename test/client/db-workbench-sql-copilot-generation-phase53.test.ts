import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import type {
  DbColumnSchema,
  DbConnectionConfig,
  DbSchemaSnapshot,
} from "../../shared/schema.ts";
import { createDefaultDdlSettings } from "../../shared/config.ts";
import { buildSqlCopilotPromptPackage } from "../../client/src/components/extensions/db-workbench/sql-copilot-grounding.ts";
import {
  buildSqlCopilotGenerationPromptPackage,
  buildSqlCopilotGenerationSemanticContext,
  deriveSqlCopilotGenerationMode,
  parseSqlCopilotGeneratedDraft,
} from "../../client/src/components/extensions/db-workbench/sql-copilot-generation.ts";
import {
  evaluateSqlCopilotGenerationCases,
  renderSqlCopilotEvaluationArtifactMarkdown,
} from "../../client/src/components/extensions/db-workbench/sql-copilot-generation-evaluation.ts";
import {
  createEmptySqlWorkbenchMemory,
  type SqlWorkbenchMemoryState,
} from "../../client/src/components/extensions/db-workbench/sql-memory.ts";

function column(name: string, primaryKey = false): DbColumnSchema {
  return {
    name,
    dataType: primaryKey ? "bigint" : "varchar",
    nullable: !primaryKey,
    primaryKey,
  };
}

function createConnection(): DbConnectionConfig {
  return {
    id: "conn-phase53",
    name: "Phase 53 Demo",
    driver: "postgres",
    host: "127.0.0.1",
    port: 5432,
    database: "app_db",
    username: "postgres",
    password: "",
    defaultSchema: "public",
  };
}

function createSnapshot(): DbSchemaSnapshot {
  return {
    connectionId: "conn-phase53",
    connectionName: "Phase 53 Demo",
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

function createMemory(): SqlWorkbenchMemoryState {
  const memory = createEmptySqlWorkbenchMemory();
  memory.queryPatterns = [
    {
      key: "pattern-orders",
      summary: "Recent order join",
      patternSql:
        "SELECT o.id, u.email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = ?",
      statementKind: "select",
      schema: "public",
      relationKeys: ["public.orders", "public.users"],
      columnKeys: ["public.orders.status", "public.users.email"],
      count: 3,
      lastExecutedAt: "2026-04-18T03:00:00.000Z",
    },
  ];
  return memory;
}

function createBasePromptPackage() {
  const settings = createDefaultDdlSettings();
  settings.sqlCopilotEnabled = true;
  settings.sqlCopilotProvider = "ollama";
  settings.sqlCopilotOllamaModel = "qwen2.5-coder:3b";

  return buildSqlCopilotPromptPackage({
    settings,
    connection: createConnection(),
    schemaSnapshot: createSnapshot(),
    sqlMemory: createMemory(),
    currentSql: "SELECT o.id FROM orders o",
    activeSchema: "public",
    selectedTableName: "public.orders",
    operatorPrompt: "Join users and filter by a named status parameter.",
  });
}

test("generation prompt package adds strict JSON contract and mode-specific instructions", () => {
  const basePromptPackage = createBasePromptPackage();
  const promptPackage = buildSqlCopilotGenerationPromptPackage({
    basePromptPackage,
    connection: createConnection(),
    currentSql: "SELECT o.id FROM orders o",
    operatorPrompt: "Join users and filter by a named status parameter.",
  });

  assert.equal(
    deriveSqlCopilotGenerationMode(
      "SELECT o.id FROM orders o",
      "Join users and filter by a named status parameter.",
    ),
    "intent_refinement",
  );
  assert.match(promptPackage.promptPreview, /Generation contract:/);
  assert.match(promptPackage.promptPreview, /Return strict JSON only/);
  assert.match(promptPackage.promptPreview, /completionMode: intent_refinement/);
  assert.match(promptPackage.promptPreview, /operatorPromptPresent: true/);
  assert.match(promptPackage.promptPreview, /Refine or complete the current SQL draft/);
  assert.ok(promptPackage.groundingSummary.promptCharCount > basePromptPackage.groundingSummary.promptCharCount);
});

test("parseSqlCopilotGeneratedDraft flags hallucination risk for unknown grounded relations", () => {
  const semanticContext = buildSqlCopilotGenerationSemanticContext(createSnapshot(), "public");
  const draft = parseSqlCopilotGeneratedDraft({
    rawOutput: JSON.stringify({
      sql: "SELECT g.id\nFROM ghosts g;",
      summary: "Unknown relation query",
      assumptions: ["ghosts table exists"],
      safetyNotes: [],
    }),
    completionMode: "natural_language",
    semanticContext,
  });

  assert.equal(draft.hallucinationRisk, true);
  assert.equal(draft.safetyRegression, false);
  assert.ok(draft.diagnostics.some((diagnostic) => diagnostic.code === "unknown_relation"));
  assert.match(draft.safetyNotes.join("\n"), /Unknown relation/i);
});

test("parseSqlCopilotGeneratedDraft flags safety regressions for destructive writes without filters", () => {
  const semanticContext = buildSqlCopilotGenerationSemanticContext(createSnapshot(), "public");
  const draft = parseSqlCopilotGeneratedDraft({
    rawOutput: "```json\n{\"sql\":\"DELETE FROM orders;\",\"summary\":\"Delete all orders\",\"assumptions\":[],\"safetyNotes\":[]}\n```",
    completionMode: "intent_refinement",
    semanticContext,
  });

  assert.equal(draft.hallucinationRisk, false);
  assert.equal(draft.safetyRegression, true);
  assert.ok(draft.diagnostics.some((diagnostic) => diagnostic.code === "delete_without_where"));
  assert.match(draft.safetyNotes.join("\n"), /DELETE without WHERE/i);
});

test("generation evaluation artifact reports hallucination and safety metrics", () => {
  const semanticContext = buildSqlCopilotGenerationSemanticContext(createSnapshot(), "public");
  const artifact = evaluateSqlCopilotGenerationCases([
    {
      id: "safe-select",
      label: "Safe grounded select",
      completionMode: "natural_language",
      rawOutput: JSON.stringify({
        sql: "SELECT o.id, u.email FROM orders o JOIN users u ON o.user_id = u.id;",
        summary: "Join orders to users",
        assumptions: ["orders.user_id references users.id"],
        safetyNotes: [],
      }),
      semanticContext,
      expectedHallucination: false,
      expectedSafetyRegression: false,
    },
    {
      id: "unsafe-delete",
      label: "Delete without where",
      completionMode: "intent_refinement",
      rawOutput: JSON.stringify({
        sql: "DELETE FROM orders;",
        summary: "Delete all orders",
        assumptions: [],
        safetyNotes: [],
      }),
      semanticContext,
      expectedHallucination: false,
      expectedSafetyRegression: true,
    },
  ]);

  const markdown = renderSqlCopilotEvaluationArtifactMarkdown(artifact);

  assert.equal(artifact.totalCases, 2);
  assert.equal(artifact.passCount, 2);
  assert.equal(artifact.hallucinationRate, 0);
  assert.equal(artifact.safetyRegressionRate, 0.5);
  assert.match(markdown, /SQL Copilot Evaluation Artifact/);
  assert.match(markdown, /unsafe-delete Delete without where/);
});

test("phase 53 UI strings for generated draft review remain reachable", () => {
  const dialogSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/SqlCopilotDialog.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const runtimeSidebarSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/SqlCopilotRuntimeSidebar.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const runtimeSidebarSectionsSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/sql-copilot-runtime-sidebar-sections.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const dialogSectionsSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/sql-copilot-dialog-sections.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const dialogMainPanelSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/sql-copilot-dialog-main-panel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const generatedDraftReviewSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/SqlCopilotGeneratedDraftReview.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const dialogModelSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/sql-copilot-dialog-model.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const layoutSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const layoutSqlControllersSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/use-workbench-layout-sql-controllers.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const controllerGraphSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const layoutRenderPropsSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/workbench-layout-render-prop-input.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const layoutRenderPropActionInputSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/workbench-layout-render-prop-action-input.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const layoutRenderPropControllerActionInputSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/workbench-layout-render-prop-controller-action-input.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const layoutRenderPropSqlActionInputSource = fs.readFileSync(
    new URL(
      "../../client/src/components/extensions/db-workbench/workbench-layout-render-prop-sql-action-input.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(dialogSource, /<SqlCopilotDialogContent/);
  assert.match(dialogSectionsSource, /<SqlCopilotRuntimeSidebar/);
  assert.match(dialogMainPanelSource, /<SqlCopilotGeneratedDraftReview/);
  assert.doesNotMatch(dialogSource, /Runtime settings/);
  assert.doesNotMatch(dialogSource, /Discovered runtimes/);
  assert.doesNotMatch(dialogSource, /Generated draft review/);
  assert.doesNotMatch(dialogSectionsSource, /Runtime settings/);
  assert.doesNotMatch(dialogSectionsSource, /Discovered runtimes/);
  assert.doesNotMatch(dialogSectionsSource, /Generated draft review/);
  assert.match(runtimeSidebarSource, /<SqlCopilotRuntimeSettingsSection/);
  assert.match(runtimeSidebarSource, /<SqlCopilotDiscoveredRuntimesSection/);
  assert.match(runtimeSidebarSectionsSource, /Runtime settings/);
  assert.match(runtimeSidebarSectionsSource, /Discovered runtimes/);
  assert.match(generatedDraftReviewSource, /Generated draft review/);
  assert.match(generatedDraftReviewSource, /Run generated draft with safety gates/);
  assert.match(generatedDraftReviewSource, /hallucination/);
  assert.match(dialogModelSource, /export function formatGenerationMode/);
  assert.match(dialogModelSource, /export function formatRuntimeLabel/);
  assert.match(dialogMainPanelSource, /Generate SQL draft/);
  assert.match(dialogMainPanelSource, /Generated SQL prompt preview/);
  assert.match(layoutSource, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraphSource, /useWorkbenchLayoutSqlControllers\(\{/);
  assert.match(layoutSource, /useWorkbenchLayoutRenderProps\(\{/);
  assert.match(layoutSqlControllersSource, /generationPromptPackage: sqlCopilotContext\.generationPromptPackage/);
  assert.match(layoutRenderPropsSource, /buildWorkbenchLayoutRenderPropActionInput\(input\)/);
  assert.match(layoutRenderPropActionInputSource, /buildWorkbenchLayoutRenderPropControllerActionInput\(input\)/);
  assert.match(layoutRenderPropControllerActionInputSource, /buildWorkbenchLayoutRenderPropSqlActionInput\(input\)/);
  assert.match(layoutRenderPropSqlActionInputSource, /handleGenerateSqlCopilotDraft/);
  assert.match(layoutRenderPropSqlActionInputSource, /handleRunGeneratedDraftWithSafetyGates/);
});
