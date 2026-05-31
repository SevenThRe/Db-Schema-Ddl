import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
  DbSqlCopilotPromptPackage,
  DbSqlCopilotPromptSection,
} from "@shared/schema";
import { collectSemanticDiagnostics } from "./sql-semantic-context";
import type {
  SqlSemanticContext,
  SqlSemanticDiagnostic,
} from "./sql-semantic-types";

export type SqlCopilotGenerationMode =
  | "natural_language"
  | "intent_refinement"
  | "partial_sql_completion";

export interface SqlCopilotGeneratedDraft {
  sql: string;
  summary: string | null;
  assumptions: string[];
  safetyNotes: string[];
  completionMode: SqlCopilotGenerationMode;
  diagnostics: SqlSemanticDiagnostic[];
  hallucinationRisk: boolean;
  safetyRegression: boolean;
  rawOutput: string;
}

export interface BuildSqlCopilotGenerationPromptPackageOptions {
  basePromptPackage: DbSqlCopilotPromptPackage;
  connection: Pick<DbConnectionConfig, "driver" | "readonly">;
  currentSql: string;
  operatorPrompt?: string | null;
}

export interface ParseSqlCopilotGeneratedDraftOptions {
  rawOutput: string;
  completionMode: SqlCopilotGenerationMode;
  semanticContext?: SqlSemanticContext | null;
}

export interface SqlCopilotEvaluationCase {
  id: string;
  label: string;
  completionMode: SqlCopilotGenerationMode;
  rawOutput: string;
  semanticContext: SqlSemanticContext;
  expectedHallucination: boolean;
  expectedSafetyRegression: boolean;
}

export interface SqlCopilotEvaluationCaseResult {
  id: string;
  label: string;
  sql: string;
  hallucinationRisk: boolean;
  safetyRegression: boolean;
  passed: boolean;
  diagnostics: string[];
}

export interface SqlCopilotEvaluationArtifact {
  generatedAt: string;
  totalCases: number;
  passCount: number;
  hallucinationRate: number;
  safetyRegressionRate: number;
  cases: SqlCopilotEvaluationCaseResult[];
}

const GENERATION_JSON_KEYS = `{
  "sql": "<generated SQL string>",
  "summary": "<one-line summary>",
  "assumptions": ["<explicit grounding assumptions>"],
  "safetyNotes": ["<risks, readonly notes, or missing-grounding notes>"]
}`;

const HALLUCINATION_DIAGNOSTIC_CODES = new Set([
  "unknown_relation",
  "unknown_column",
  "unknown_qualifier",
]);

const SQL_STATEMENT_START_PATTERN =
  /^\s*(with\b|select\b|insert\b|update\b|delete\b|explain\b|create\b|alter\b|drop\b|truncate\b)/i;

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function truncateText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function tryParseJsonPayload(candidate: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(candidate);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractJsonCandidate(rawOutput: string): Record<string, unknown> | null {
  const fencedMatches = Array.from(
    rawOutput.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),
  );
  for (const match of fencedMatches) {
    const parsed = tryParseJsonPayload(match[1] ?? "");
    if (parsed) return parsed;
  }

  const trimmed = rawOutput.trim();
  const direct = tryParseJsonPayload(trimmed);
  if (direct) return direct;

  const firstBrace = rawOutput.indexOf("{");
  const lastBrace = rawOutput.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParseJsonPayload(rawOutput.slice(firstBrace, lastBrace + 1));
  }

  return null;
}

function extractSqlCandidate(rawOutput: string): string {
  const sqlFence = rawOutput.match(/```sql\s*([\s\S]*?)```/i);
  if (sqlFence?.[1]) {
    return sqlFence[1].trim();
  }

  const genericFence = rawOutput.match(/```\s*([\s\S]*?)```/i);
  if (genericFence?.[1] && SQL_STATEMENT_START_PATTERN.test(genericFence[1])) {
    return genericFence[1].trim();
  }

  if (SQL_STATEMENT_START_PATTERN.test(rawOutput)) {
    return rawOutput.trim();
  }

  const sqlLabel = rawOutput.match(/sql\s*:\s*([\s\S]*)/i);
  if (sqlLabel?.[1] && SQL_STATEMENT_START_PATTERN.test(sqlLabel[1])) {
    return sqlLabel[1].trim();
  }

  return "";
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((entry): entry is string => typeof entry === "string"));
}

function detectDangerousPattern(sql: string): string[] {
  const warnings: string[] = [];
  const normalized = sql.trim().toLowerCase();
  if (!normalized) return warnings;

  if (/\btruncate\b/.test(normalized)) {
    warnings.push("Generated SQL includes TRUNCATE and must stay behind explicit destructive-SQL confirmation.");
  }
  if (/\bdrop\b/.test(normalized)) {
    warnings.push("Generated SQL includes DROP and must stay behind explicit destructive-SQL confirmation.");
  }
  if (/\bdelete\b/.test(normalized) && !/\bwhere\b/.test(normalized)) {
    warnings.push("Generated SQL contains DELETE without WHERE.");
  }
  if (/\bupdate\b/.test(normalized) && !/\bwhere\b/.test(normalized)) {
    warnings.push("Generated SQL contains UPDATE without WHERE.");
  }

  return warnings;
}

function buildGenerationPromptSections(
  basePromptPackage: DbSqlCopilotPromptPackage,
  completionMode: SqlCopilotGenerationMode,
  currentSql: string,
  operatorPrompt: string | null,
  readonly: boolean,
): DbSqlCopilotPromptSection[] {
  const generationContract: DbSqlCopilotPromptSection = {
    title: "Generation contract",
    body: [
      "Return strict JSON only with exactly these keys:",
      GENERATION_JSON_KEYS,
      "Do not wrap the JSON in markdown fences.",
      "If grounding is insufficient, return an empty string for `sql` and explain the gap in `assumptions` or `safetyNotes`.",
      "Prefer one executable statement unless the current draft is already clearly a short script.",
    ].join("\n"),
  };

  const generationModeSection: DbSqlCopilotPromptSection = {
    title: "Generation mode",
    body: [
      `completionMode: ${completionMode}`,
      `readonlyConnection: ${readonly ? "true" : "false"}`,
      `operatorPromptPresent: ${operatorPrompt ? "true" : "false"}`,
      `currentSqlPresent: ${currentSql.trim() ? "true" : "false"}`,
    ].join("\n"),
  };

  return [...basePromptPackage.sections, generationModeSection, generationContract];
}

export function deriveSqlCopilotGenerationMode(
  currentSql: string,
  operatorPrompt?: string | null,
): SqlCopilotGenerationMode {
  const hasSql = currentSql.trim().length > 0;
  const hasPrompt = (operatorPrompt?.trim().length ?? 0) > 0;

  if (hasSql && hasPrompt) return "intent_refinement";
  if (hasSql) return "partial_sql_completion";
  return "natural_language";
}

export function buildSqlCopilotGenerationPromptPackage({
  basePromptPackage,
  connection,
  currentSql,
  operatorPrompt,
}: BuildSqlCopilotGenerationPromptPackageOptions): DbSqlCopilotPromptPackage {
  const completionMode = deriveSqlCopilotGenerationMode(currentSql, operatorPrompt);
  const effectivePrompt = nonEmpty(operatorPrompt);
  const sections = buildGenerationPromptSections(
    basePromptPackage,
    completionMode,
    currentSql,
    effectivePrompt,
    connection.readonly === true,
  );

  const systemPrompt = [
    basePromptPackage.systemPrompt,
    "You are now generating a reviewable SQL draft, not a prose answer.",
    "Return strict JSON only with keys sql, summary, assumptions, and safetyNotes.",
    "Never fabricate schema objects beyond the grounded sections.",
  ].join(" ");

  const userPrompt =
    completionMode === "intent_refinement"
      ? `Refine or complete the current SQL draft using the operator request. Operator request: ${effectivePrompt ?? "(none)"}.`
      : completionMode === "partial_sql_completion"
        ? "Complete or repair the current SQL draft using only grounded schema, driver rules, and safe query memory."
        : `Generate one grounded SQL draft from the operator request. Operator request: ${effectivePrompt ?? "(none)"}.`;

  const promptPreview = [
    `System:\n${systemPrompt}`,
    ...sections.map((section) => `${section.title}:\n${section.body}`),
    `User:\n${userPrompt}`,
  ].join("\n\n");

  return {
    ...basePromptPackage,
    systemPrompt,
    userPrompt,
    sections,
    promptPreview,
    groundingSummary: {
      ...basePromptPackage.groundingSummary,
      sectionCount: sections.length,
      promptCharCount: promptPreview.length,
    },
  };
}

export function buildSqlCopilotGenerationSemanticContext(
  schemaSnapshot: DbSchemaSnapshot | null | undefined,
  activeSchema: string | null | undefined,
): SqlSemanticContext {
  const fallbackSchema = nonEmpty(activeSchema) ?? schemaSnapshot?.schema?.trim() ?? "public";
  const tableRelations = (schemaSnapshot?.tables ?? []).map((table) => {
    const nameSegments = table.name.split(".");
    const relationName = nameSegments.at(-1)?.trim() || table.name.trim();
    const relationSchema =
      nameSegments.length > 1 ? nameSegments.at(-2)?.trim() || fallbackSchema : fallbackSchema;
    return {
      schema: relationSchema,
      name: relationName,
      kind: "table" as const,
      columns: table.columns.map((column) => column.name.trim()).filter(Boolean),
    };
  });
  const viewRelations = (schemaSnapshot?.views ?? []).map((view) => {
    const nameSegments = view.name.split(".");
    const relationName = nameSegments.at(-1)?.trim() || view.name.trim();
    const relationSchema =
      nameSegments.length > 1 ? nameSegments.at(-2)?.trim() || fallbackSchema : fallbackSchema;
    return {
      schema: relationSchema,
      name: relationName,
      kind: "view" as const,
      columns: view.columns.map((column) => column.name.trim()).filter(Boolean),
    };
  });

  return {
    activeSchema: fallbackSchema,
    relations: [...tableRelations, ...viewRelations],
  };
}

export function parseSqlCopilotGeneratedDraft({
  rawOutput,
  completionMode,
  semanticContext,
}: ParseSqlCopilotGeneratedDraftOptions): SqlCopilotGeneratedDraft {
  const payload = extractJsonCandidate(rawOutput);
  const sql =
    nonEmpty(typeof payload?.sql === "string" ? payload.sql : null) ??
    extractSqlCandidate(rawOutput);
  const summary =
    nonEmpty(typeof payload?.summary === "string" ? payload.summary : null) ??
    (sql ? truncateText(sql.replace(/\s+/g, " "), 120) : null);
  const assumptions = sanitizeStringArray(payload?.assumptions);
  const safetyNotes = uniqueStrings([
    ...sanitizeStringArray(payload?.safetyNotes),
    ...detectDangerousPattern(sql),
  ]);
  const diagnostics =
    semanticContext && sql ? collectSemanticDiagnostics(semanticContext, sql) : [];
  const hallucinationRisk = diagnostics.some((diagnostic) =>
    HALLUCINATION_DIAGNOSTIC_CODES.has(diagnostic.code),
  );
  const safetyRegression =
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "update_without_where" ||
        diagnostic.code === "delete_without_where",
    ) || safetyNotes.some((note) => /truncate|drop|without where/i.test(note));

  return {
    sql,
    summary,
    assumptions,
    safetyNotes: uniqueStrings([
      ...safetyNotes,
      ...diagnostics.map((diagnostic) => diagnostic.message),
    ]),
    completionMode,
    diagnostics,
    hallucinationRisk,
    safetyRegression,
    rawOutput,
  };
}

export function evaluateSqlCopilotGenerationCases(
  cases: SqlCopilotEvaluationCase[],
): SqlCopilotEvaluationArtifact {
  const caseResults = cases.map((testCase) => {
    const draft = parseSqlCopilotGeneratedDraft({
      rawOutput: testCase.rawOutput,
      completionMode: testCase.completionMode,
      semanticContext: testCase.semanticContext,
    });

    const passed =
      draft.hallucinationRisk === testCase.expectedHallucination &&
      draft.safetyRegression === testCase.expectedSafetyRegression;

    return {
      id: testCase.id,
      label: testCase.label,
      sql: draft.sql,
      hallucinationRisk: draft.hallucinationRisk,
      safetyRegression: draft.safetyRegression,
      passed,
      diagnostics: draft.safetyNotes,
    };
  });

  const totalCases = caseResults.length;
  const passCount = caseResults.filter((entry) => entry.passed).length;
  const hallucinationCount = caseResults.filter((entry) => entry.hallucinationRisk).length;
  const safetyRegressionCount = caseResults.filter((entry) => entry.safetyRegression).length;

  return {
    generatedAt: new Date().toISOString(),
    totalCases,
    passCount,
    hallucinationRate: totalCases === 0 ? 0 : hallucinationCount / totalCases,
    safetyRegressionRate: totalCases === 0 ? 0 : safetyRegressionCount / totalCases,
    cases: caseResults,
  };
}

export function renderSqlCopilotEvaluationArtifactMarkdown(
  artifact: SqlCopilotEvaluationArtifact,
): string {
  const lines = [
    "# SQL Copilot Evaluation Artifact",
    "",
    `Generated at: ${artifact.generatedAt}`,
    "",
    `- Total cases: ${artifact.totalCases}`,
    `- Pass count: ${artifact.passCount}`,
    `- Hallucination rate: ${(artifact.hallucinationRate * 100).toFixed(1)}%`,
    `- Safety regression rate: ${(artifact.safetyRegressionRate * 100).toFixed(1)}%`,
    "",
    "## Cases",
    "",
  ];

  for (const testCase of artifact.cases) {
    lines.push(`### ${testCase.id} ${testCase.label}`);
    lines.push(`- Passed: ${testCase.passed ? "yes" : "no"}`);
    lines.push(`- Hallucination risk: ${testCase.hallucinationRisk ? "yes" : "no"}`);
    lines.push(`- Safety regression: ${testCase.safetyRegression ? "yes" : "no"}`);
    if (testCase.sql) {
      lines.push("- SQL:");
      lines.push("```sql");
      lines.push(testCase.sql);
      lines.push("```");
    }
    if (testCase.diagnostics.length > 0) {
      lines.push("- Diagnostics:");
      for (const diagnostic of testCase.diagnostics) {
        lines.push(`  - ${diagnostic}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
