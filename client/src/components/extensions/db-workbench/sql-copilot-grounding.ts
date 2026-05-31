import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
  DbSqlCopilotPromptPackage,
  DbSqlCopilotPromptSection,
  DbSqlCopilotProvider,
  DdlSettings,
} from "@shared/schema";
import { analyzeSqlContext } from "./sql-semantic-context";
import type { SqlSemanticContext } from "./sql-semantic-types";
import {
  createEmptySqlWorkbenchMemory,
  type SqlWorkbenchMemoryState,
} from "./sql-memory";

type RelationKind = "table" | "view";

type GroundingRelation = {
  key: string;
  schema: string;
  name: string;
  kind: RelationKind;
  columns: string[];
  primaryKeys: string[];
  foreignKeys: string[];
};

export interface BuildSqlCopilotPromptPackageOptions {
  settings: DdlSettings;
  connection: DbConnectionConfig;
  schemaSnapshot?: DbSchemaSnapshot | null;
  sqlMemory?: SqlWorkbenchMemoryState | null;
  currentSql: string;
  activeSchema?: string | null;
  selectedTableName?: string | null;
  operatorPrompt?: string | null;
}

const MAX_SECTION_TEXT = 4_000;
const MAX_SQL_TEXT = 3_000;

function normalizeIdentifier(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function truncateText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function parseSchemaQualifiedName(
  candidate: string,
  fallbackSchema: string,
): { schema: string; name: string } {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return { schema: fallbackSchema, name: candidate };
  }

  const segments = trimmed.split(".");
  if (segments.length >= 2) {
    const schema = segments.at(-2)?.trim() || fallbackSchema;
    const name = segments.at(-1)?.trim() || trimmed;
    return { schema, name };
  }

  return { schema: fallbackSchema, name: trimmed };
}

function relationKey(schema: string, name: string): string {
  return `${normalizeIdentifier(schema)}.${normalizeIdentifier(name)}`;
}

function buildGroundingRelations(
  schemaSnapshot: DbSchemaSnapshot | null | undefined,
  activeSchema: string,
): GroundingRelation[] {
  if (!schemaSnapshot) return [];

  const tables = (schemaSnapshot.tables ?? []).map((table) => {
    const parsed = parseSchemaQualifiedName(table.name, activeSchema);
    return {
      key: relationKey(parsed.schema, parsed.name),
      schema: parsed.schema,
      name: parsed.name,
      kind: "table" as const,
      columns: table.columns.map((column) => column.name.trim()).filter(Boolean),
      primaryKeys: table.columns
        .filter((column) => column.primaryKey)
        .map((column) => column.name.trim())
        .filter(Boolean),
      foreignKeys: (table.foreignKeys ?? [])
        .map((foreignKey) => {
          const referenced = parseSchemaQualifiedName(foreignKey.referencedTable, parsed.schema);
          return `${foreignKey.name}: (${foreignKey.columns.join(", ")}) -> ${referenced.schema}.${referenced.name}(${foreignKey.referencedColumns.join(", ")})`;
        })
        .filter(Boolean),
    };
  });

  const views = (schemaSnapshot.views ?? []).map((view) => {
    const parsed = parseSchemaQualifiedName(view.name, activeSchema);
    return {
      key: relationKey(parsed.schema, parsed.name),
      schema: parsed.schema,
      name: parsed.name,
      kind: "view" as const,
      columns: view.columns.map((column) => column.name.trim()).filter(Boolean),
      primaryKeys: [],
      foreignKeys: [],
    };
  });

  return [...tables, ...views];
}

function buildSemanticContext(
  relations: GroundingRelation[],
  activeSchema: string,
): SqlSemanticContext {
  return {
    activeSchema,
    relations: relations.map((relation) => ({
      schema: relation.schema,
      name: relation.name,
      kind: relation.kind,
      columns: relation.columns,
    })),
  };
}

function allowedValueHint(hint: string): string | null {
  const normalized = hint.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length > 32) return null;
  if (normalized.includes("@")) return null;
  if (!/^[a-z0-9 _-]+$/i.test(normalized)) return null;
  return normalized;
}

function driverRuleLines(driver: DbConnectionConfig["driver"]): string[] {
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

function collectPreferredRelationKeys(
  relations: GroundingRelation[],
  activeSchema: string,
  selectedTableName: string | null | undefined,
  currentSql: string,
): Set<string> {
  const preferred = new Set<string>();
  const normalizedSelected = normalizeIdentifier(selectedTableName);

  if (normalizedSelected) {
    const selectedRelation = relations.find((relation) => {
      if (relation.key === normalizedSelected) return true;
      return normalizeIdentifier(relation.name) === normalizedSelected;
    });
    if (selectedRelation) {
      preferred.add(selectedRelation.key);
    }
  }

  const semanticAnalysis = analyzeSqlContext(
    buildSemanticContext(relations, activeSchema),
    currentSql,
    currentSql.length,
  );
  for (const relation of semanticAnalysis.relations) {
    preferred.add(relationKey(relation.schema, relation.name));
  }

  const sqlText = currentSql.toLowerCase();
  for (const relation of relations) {
    if (sqlText.includes(relation.name.toLowerCase())) {
      preferred.add(relation.key);
    }
  }

  return preferred;
}

function sortRelationsForGrounding(
  relations: GroundingRelation[],
  preferredKeys: Set<string>,
  activeSchema: string,
): GroundingRelation[] {
  return [...relations].sort((left, right) => {
    const leftPreferred = preferredKeys.has(left.key) ? 1 : 0;
    const rightPreferred = preferredKeys.has(right.key) ? 1 : 0;
    if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;

    const leftActive = normalizeIdentifier(left.schema) === normalizeIdentifier(activeSchema) ? 1 : 0;
    const rightActive = normalizeIdentifier(right.schema) === normalizeIdentifier(activeSchema) ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;

    if (left.kind !== right.kind) {
      return left.kind === "table" ? -1 : 1;
    }

    return `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`);
  });
}

function buildSchemaSection(relations: GroundingRelation[]): DbSqlCopilotPromptSection {
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

function buildMemoryPatternSection(
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

function buildValueProfileSection(
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

function buildCurrentDraftSection(
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

function buildOperatorIntentSection(operatorPrompt: string | null | undefined): DbSqlCopilotPromptSection {
  const trimmed = operatorPrompt?.trim();
  return {
    title: "Operator request",
    body: trimmed
      ? truncateText(trimmed, 1_200)
      : "No natural-language request was provided. Stay grounded in the current SQL draft and runtime metadata.",
  };
}

function buildSystemPrompt(driver: DbConnectionConfig["driver"]): string {
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

function resolveProvider(settings: DdlSettings): DbSqlCopilotProvider {
  return settings.sqlCopilotProvider === "llama_cpp_cli" ? "llama_cpp_cli" : "ollama";
}

export function buildSqlCopilotPromptPackage({
  settings,
  connection,
  schemaSnapshot,
  sqlMemory,
  currentSql,
  activeSchema,
  selectedTableName,
  operatorPrompt,
}: BuildSqlCopilotPromptPackageOptions): DbSqlCopilotPromptPackage {
  const provider = resolveProvider(settings);
  const runtimeSchema =
    activeSchema?.trim() || connection.defaultSchema?.trim() || schemaSnapshot?.schema?.trim() || "public";
  const effectiveMemory = sqlMemory ?? createEmptySqlWorkbenchMemory();
  const relations = buildGroundingRelations(schemaSnapshot, runtimeSchema);
  const preferredKeys = collectPreferredRelationKeys(
    relations,
    runtimeSchema,
    selectedTableName,
    currentSql,
  );
  const groundedRelations = sortRelationsForGrounding(
    relations,
    preferredKeys,
    runtimeSchema,
  ).slice(0, Math.max(1, settings.sqlCopilotGroundingMaxTables));

  const sections: DbSqlCopilotPromptSection[] = [
    {
      title: "Connection context",
      body: [
        `connection: ${(connection.name || connection.database).trim()}`,
        `driver: ${connection.driver}`,
        `database: ${connection.database}`,
        `activeSchema: ${runtimeSchema}`,
        `selectedRelation: ${selectedTableName?.trim() || "(none)"}`,
        "privacyMode: offline_local_only",
      ].join("\n"),
    },
    {
      title: "Driver rules",
      body: driverRuleLines(connection.driver).join("\n"),
    },
    buildCurrentDraftSection(currentSql, runtimeSchema, relations),
    buildOperatorIntentSection(operatorPrompt),
  ];

  if (groundedRelations.length > 0) {
    sections.splice(2, 0, buildSchemaSection(groundedRelations));
  }

  const memoryPatternSection = buildMemoryPatternSection(
    effectiveMemory,
    runtimeSchema,
    preferredKeys,
    settings.sqlCopilotGroundingMaxPatterns,
  );
  if (memoryPatternSection) {
    sections.splice(sections.length - 2, 0, memoryPatternSection);
  }

  const valueProfileSection = buildValueProfileSection(
    effectiveMemory,
    runtimeSchema,
    preferredKeys,
    settings.sqlCopilotGroundingMaxValueProfiles,
  );
  if (valueProfileSection) {
    sections.splice(sections.length - 2, 0, valueProfileSection);
  }

  const systemPrompt = buildSystemPrompt(connection.driver);
  const userPrompt = operatorPrompt?.trim()
    ? `Respond to the operator request using only the grounded sections. Operator request: ${truncateText(operatorPrompt, 1_000)}`
    : "Review the grounded SQL draft and runtime context. Stay advisory and call out missing grounding explicitly.";

  const promptPreview = [
    `System:\n${systemPrompt}`,
    ...sections.map((section) => `${section.title}:\n${section.body}`),
    `User:\n${userPrompt}`,
  ].join("\n\n");

  const memoryPatternCount = memoryPatternSection
    ? Math.min(
        effectiveMemory.queryPatterns.length,
        Math.max(0, settings.sqlCopilotGroundingMaxPatterns),
      )
    : 0;
  const valueProfileCount = valueProfileSection
    ? Math.min(
        effectiveMemory.valueProfiles.length,
        Math.max(0, settings.sqlCopilotGroundingMaxValueProfiles),
      )
    : 0;

  return {
    provider,
    systemPrompt,
    userPrompt,
    sections,
    promptPreview,
    groundingSummary: {
      driver: connection.driver,
      activeSchema: runtimeSchema,
      sectionCount: sections.length,
      relationCount: groundedRelations.length,
      memoryPatternCount,
      valueProfileCount,
      promptCharCount: promptPreview.length,
    },
  };
}
