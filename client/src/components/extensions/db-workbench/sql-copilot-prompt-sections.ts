import type {
  DbConnectionConfig,
  DbSqlCopilotPromptSection,
} from "@shared/schema";
import { analyzeSqlContext } from "./sql-semantic-context";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import {
  buildSemanticContext,
  normalizeIdentifier,
  relationKey,
  type GroundingRelation,
} from "./sql-copilot-grounding-relations";

const MAX_SECTION_TEXT = 4_000;
const MAX_SQL_TEXT = 3_000;

export function truncateText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function allowedValueHint(hint: string): string | null {
  const normalized = hint.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length > 32) return null;
  if (normalized.includes("@")) return null;
  if (!/^[a-z0-9 _-]+$/i.test(normalized)) return null;
  return normalized;
}

export function driverRuleLines(driver: DbConnectionConfig["driver"]): string[] {
  if (driver === "postgres") {
    return [
      "Treat PostgreSQL syntax and catalogs as authoritative for this session.",
      'Prefer unquoted lowercase identifiers unless case-sensitive names require double quotes.',
      "Ground joins in the provided foreign-key graph or explicit relation names only.",
      "Keep advice operator-safe: never imply execution happened or that a missing object exists.",
    ];
  }

  return [
    "Treat MySQL syntax and catalogs as authoritative for this session.",
    "Prefer unquoted identifiers unless reserved words or mixed-case names require backticks.",
    "Ground joins in the provided foreign-key graph or explicit relation names only.",
    "Keep advice operator-safe: never imply execution happened or that a missing object exists.",
  ];
}

export function buildSchemaSection(relations: GroundingRelation[]): DbSqlCopilotPromptSection {
  const body = relations
    .map((relation) => {
      const lines = [
        `${relation.kind.toUpperCase()} ${relation.schema}.${relation.name}`,
        `columns: ${relation.columns.slice(0, 16).join(", ") || "(none listed)"}`,
      ];
      if (relation.primaryKeys.length > 0) {
        lines.push(`primary key: ${relation.primaryKeys.join(", ")}`);
      }
      if (relation.foreignKeys.length > 0) {
        lines.push(`foreign keys: ${relation.foreignKeys.slice(0, 4).join(" | ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  return {
    title: "Schema grounding",
    body: truncateText(body, MAX_SECTION_TEXT),
  };
}

export function buildMemoryPatternSection(
  memory: SqlWorkbenchMemoryState,
  activeSchema: string,
  preferredKeys: Set<string>,
  maxPatterns: number,
): DbSqlCopilotPromptSection | null {
  const relevant = [...memory.queryPatterns]
    .filter((pattern) => {
      if (normalizeIdentifier(pattern.schema) === normalizeIdentifier(activeSchema)) return true;
      return pattern.relationKeys.some((entry) => preferredKeys.has(normalizeIdentifier(entry)));
    })
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.lastExecutedAt.localeCompare(left.lastExecutedAt);
    })
    .slice(0, Math.max(0, maxPatterns));

  if (relevant.length === 0) return null;

  return {
    title: "Safe query memory",
    body: truncateText(
      relevant
        .map(
          (pattern) =>
            `${pattern.summary} | kind=${pattern.statementKind} | relations=${pattern.relationKeys.join(", ") || "(none)"} | pattern=${pattern.patternSql}`,
        )
        .join("\n"),
      MAX_SECTION_TEXT,
    ),
  };
}

export function buildValueProfileSection(
  memory: SqlWorkbenchMemoryState,
  activeSchema: string,
  preferredKeys: Set<string>,
  maxProfiles: number,
): DbSqlCopilotPromptSection | null {
  const relevant = [...memory.valueProfiles]
    .filter((profile) => {
      if (normalizeIdentifier(profile.schema) === normalizeIdentifier(activeSchema)) return true;
      return preferredKeys.has(relationKey(profile.schema, profile.relation));
    })
    .sort((left, right) => {
      if (right.sampleCount !== left.sampleCount) return right.sampleCount - left.sampleCount;
      return right.lastObservedAt.localeCompare(left.lastObservedAt);
    })
    .slice(0, Math.max(0, maxProfiles));

  if (relevant.length === 0) return null;

  return {
    title: "Value-shape grounding",
    body: truncateText(
      relevant
        .map((profile) => {
          const hints = profile.exampleHints
            .map(allowedValueHint)
            .filter((entry): entry is string => Boolean(entry));
          const hintText = hints.length > 0 ? ` | hints=${hints.join(", ")}` : "";
          return `${profile.schema}.${profile.relation}.${profile.column} | samples=${profile.sampleCount} | nulls=${profile.nullCount} | kinds=${profile.observedKinds.join(", ")}${hintText}`;
        })
        .join("\n"),
      MAX_SECTION_TEXT,
    ),
  };
}

export function buildCurrentDraftSection(
  currentSql: string,
  activeSchema: string,
  relations: GroundingRelation[],
): DbSqlCopilotPromptSection {
  const semanticAnalysis = analyzeSqlContext(
    buildSemanticContext(relations, activeSchema),
    currentSql,
    currentSql.length,
  );
  const statementKind = semanticAnalysis.statement.kind;
  const currentClause = semanticAnalysis.clause;
  const relationRefs =
    semanticAnalysis.relations.length > 0
      ? semanticAnalysis.relations
          .map((relation) => `${relation.schema}.${relation.name}`)
          .join(", ")
      : "(none)";

  const sqlPreview = currentSql.trim()
    ? truncateText(currentSql, MAX_SQL_TEXT)
    : "(empty SQL draft)";

  return {
    title: "Current operator draft",
    body: [
      `statementKind: ${statementKind}`,
      `cursorClause: ${currentClause}`,
      `activeSchema: ${activeSchema}`,
      `relationRefs: ${relationRefs}`,
      "sql:",
      sqlPreview,
    ].join("\n"),
  };
}

export function buildOperatorIntentSection(
  operatorPrompt: string | null | undefined,
): DbSqlCopilotPromptSection {
  const trimmed = operatorPrompt?.trim();
  return {
    title: "Operator request",
    body: trimmed
      ? truncateText(trimmed, 1_200)
      : "No natural-language request was provided. Stay grounded in the current SQL draft and runtime metadata.",
  };
}

export function buildSystemPrompt(driver: DbConnectionConfig["driver"]): string {
  const driverLabel = driver === "postgres" ? "PostgreSQL" : "MySQL";
  return [
    "You are a local SQL copilot running entirely on the operator machine.",
    `This session is grounded to ${driverLabel} metadata only.`,
    "Do not claim any statement was executed, explain plans were run, or live data was inspected unless that evidence is explicitly present in the prompt.",
    "Never invent tables, columns, joins, or driver behavior that are not grounded below.",
    "If grounding is insufficient, say exactly what is missing.",
    "Keep the output advisory and concise because deterministic execution remains outside this model runtime.",
  ].join(" ");
}
