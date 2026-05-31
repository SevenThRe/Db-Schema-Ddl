import { useMemo, useState } from "react";
import { dbSnapshotDiffToDiffEntries } from "@/components/diff-viewer";
import { dbSnapshotDiffToStructuredEntries } from "@/components/diff-viewer/structured-adapter";
import type {
  DbConnectionConfig,
  DbSchemaDiffResult,
  DbSchemaSnapshot,
} from "@shared/schema";
import {
  SchemaDiffSetupView,
  SchemaDiffViewerLayout,
  type SchemaDiffTabMode,
} from "./schema-diff-sections";

export interface DbSchemaDiffViewerProps {
  source: DbSchemaSnapshot;
  target: DbSchemaSnapshot;
  result: DbSchemaDiffResult;
  onReset?: () => void;
  resetLabel?: string;
}

export function DbSchemaDiffViewer({
  source,
  target,
  result,
  onReset,
  resetLabel = "重新配置",
}: DbSchemaDiffViewerProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tabMode, setTabMode] = useState<SchemaDiffTabMode>("structured");
  const [monacoSideBySide, setMonacoSideBySide] = useState(true);

  const entries = useMemo(
    () => dbSnapshotDiffToDiffEntries(source, target, result),
    [source, target, result],
  );
  const structuredEntries = useMemo(
    () => dbSnapshotDiffToStructuredEntries(source, target, result),
    [source, target, result],
  );

  const selectedEntry =
    entries.find((entry) => entry.key === selectedKey) ?? entries[0] ?? null;
  const selectedStructured =
    structuredEntries.find((entry) => entry.key === selectedKey) ??
    structuredEntries[0] ??
    null;

  return (
    <SchemaDiffViewerLayout
      result={result}
      entries={entries}
      structuredEntries={structuredEntries}
      selectedEntry={selectedEntry}
      selectedStructured={selectedStructured}
      selectedKey={selectedEntry?.key ?? ""}
      tabMode={tabMode}
      monacoSideBySide={monacoSideBySide}
      onSelectedKeyChange={setSelectedKey}
      onTabModeChange={setTabMode}
      onMonacoSideBySideChange={setMonacoSideBySide}
      onReset={onReset}
      resetLabel={resetLabel}
    />
  );
}

export interface WorkbenchSchemaDiffPaneProps {
  sourceConnection: DbConnectionConfig;
  connections: DbConnectionConfig[];
  targetConnectionId: string;
  onTargetConnectionChange: (id: string) => void;
  onCompare: () => void;
  isComparing: boolean;
  issue?: string | null;
  sourceSnapshot: DbSchemaSnapshot | null;
  targetSnapshot: DbSchemaSnapshot | null;
  result: DbSchemaDiffResult | null;
  onReset: () => void;
}

export function WorkbenchSchemaDiffPane({
  sourceConnection,
  connections,
  targetConnectionId,
  onTargetConnectionChange,
  onCompare,
  isComparing,
  issue,
  sourceSnapshot,
  targetSnapshot,
  result,
  onReset,
}: WorkbenchSchemaDiffPaneProps) {
  const targetConnection =
    connections.find((connection) => connection.id === targetConnectionId) ??
    null;
  const compareTargets = connections.filter(
    (connection) => connection.id !== sourceConnection.id,
  );

  if (result && sourceSnapshot && targetSnapshot) {
    return (
      <DbSchemaDiffViewer
        source={sourceSnapshot}
        target={targetSnapshot}
        result={result}
        onReset={onReset}
        resetLabel="更换目标"
      />
    );
  }

  return (
    <SchemaDiffSetupView
      sourceConnection={sourceConnection}
      targetConnection={targetConnection}
      compareTargets={compareTargets}
      targetConnectionId={targetConnectionId}
      issue={issue}
      isComparing={isComparing}
      onTargetConnectionChange={onTargetConnectionChange}
      onCompare={onCompare}
    />
  );
}
