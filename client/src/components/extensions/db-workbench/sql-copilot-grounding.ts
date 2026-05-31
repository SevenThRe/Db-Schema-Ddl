import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
  DbSqlCopilotPromptPackage,
  DbSqlCopilotPromptSection,
  DbSqlCopilotProvider,
  DdlSettings,
} from "@shared/schema";
import {
  createEmptySqlWorkbenchMemory,
  type SqlWorkbenchMemoryState,
} from "./sql-memory";
import {
  buildGroundingRelations,
  collectPreferredRelationKeys,
  sortRelationsForGrounding,
} from "./sql-copilot-grounding-relations";
import {
  buildCurrentDraftSection,
  buildMemoryPatternSection,
  buildOperatorIntentSection,
  buildSchemaSection,
  buildSystemPrompt,
  buildValueProfileSection,
  driverRuleLines,
  truncateText,
} from "./sql-copilot-prompt-sections";

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
