import type { SqlSemanticContext } from "./sql-semantic-types";
import {
  parseSqlCopilotGeneratedDraft,
  type SqlCopilotGenerationMode,
} from "./sql-copilot-generation";

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
