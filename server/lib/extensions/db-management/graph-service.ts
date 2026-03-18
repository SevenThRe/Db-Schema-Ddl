import type {
  DbGraphRequest,
  DbGraphResponse,
  DbVsDbGraphRequest,
  DbVsDbGraphResponse,
} from "@shared/schema";
import { compareDbHistory, compareLiveDatabases, resolveCompareSourceCatalog } from "./history-service";

function normalizeName(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function resolveDatabaseName(request: DbGraphRequest): string {
  if (request.source.kind !== "file") {
    return request.source.databaseName;
  }
  if (request.compareTo && request.compareTo.kind !== "file") {
    return request.compareTo.databaseName;
  }
  throw new Error("Graph requests require at least one DB-backed source.");
}

function collectNeighborNames(tableNames: Set<string>, edges: DbGraphResponse["edges"]): Set<string> {
  const expanded = new Set(tableNames);
  for (const edge of edges) {
    if (expanded.has(edge.sourceId) || expanded.has(edge.targetId)) {
      expanded.add(edge.sourceId);
      expanded.add(edge.targetId);
    }
  }
  return expanded;
}

export async function buildDbGraph(connectionId: number, request: DbGraphRequest): Promise<DbGraphResponse> {
  const databaseName = resolveDatabaseName(request);

  const resolved = await resolveCompareSourceCatalog(connectionId, request.source, {
    databaseName,
    refreshLiveSchema: request.source.kind === "live" && !request.source.snapshotHash,
  });

  let changedTableNames = new Set<string>();
  if (request.compareTo) {
    const comparison = await compareDbHistory(connectionId, {
      left: request.source,
      right: request.compareTo,
      scope: "database",
      refreshLiveSchema: request.source.kind === "live" && !request.source.snapshotHash,
    });
    changedTableNames = new Set(
      comparison.tableChanges.map((change) =>
        normalizeName(
          change.fileTable?.physicalTableName ?? change.dbTable?.name ?? change.entityKey,
        ),
      ),
    );
  }

  const nodes = resolved.catalog.tables.map((table, index) => ({
    id: normalizeName(table.name),
    tableName: table.name,
    label: table.name,
    columnCount: table.columns.length,
    foreignKeyCount: table.foreignKeys.length,
    changed: changedTableNames.has(normalizeName(table.name)),
    highlighted: false,
    position: { x: (index % 4) * 320, y: Math.floor(index / 4) * 220 },
    width: 240,
    height: Math.max(150, 96 + table.columns.length * 26),
  }));

  const edges = resolved.catalog.tables.flatMap((table) =>
    table.foreignKeys.map((foreignKey) => ({
      id: `${normalizeName(table.name)}->${normalizeName(foreignKey.referencedTableName)}:${foreignKey.name}`,
      sourceId: normalizeName(table.name),
      targetId: normalizeName(foreignKey.referencedTableName),
      relationshipName: foreignKey.name,
      changed:
        changedTableNames.has(normalizeName(table.name)) ||
        changedTableNames.has(normalizeName(foreignKey.referencedTableName)),
    })),
  );

  const selected = new Set(request.selectedTableNames.map((name) => normalizeName(name)));
  let visible = new Set(nodes.map((node) => node.id));
  if (request.mode === "changed") {
    visible = new Set(changedTableNames);
  } else if (request.mode === "selection" && selected.size > 0) {
    visible = new Set(selected);
  }
  if (request.includeNeighbors && visible.size > 0 && visible.size < nodes.length) {
    visible = collectNeighborNames(visible, edges);
  }

  const filteredNodes = nodes
    .filter((node) => request.mode === "full" || visible.has(node.id))
    .map((node) => ({
      ...node,
      highlighted:
        selected.size > 0
          ? visible.has(node.id) && selected.has(node.id)
          : changedTableNames.has(node.id),
    }));
  const nodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = edges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));

  return {
    source: resolved.source,
    compareTo: request.compareTo,
    mode: request.mode,
    nodes: filteredNodes,
    edges: filteredEdges,
    changedTableNames: Array.from(changedTableNames).sort(),
    availableTableNames: resolved.catalog.tables.map((table) => table.name).sort(),
  };
}

export async function buildDbVsDbGraph(request: DbVsDbGraphRequest): Promise<DbVsDbGraphResponse> {
  const compareResult = await compareLiveDatabases(request.compare);
  const source = await resolveCompareSourceCatalog(request.compare.source.connectionId, {
    kind: "live",
    connectionId: request.compare.source.connectionId,
    databaseName: request.compare.source.databaseName,
    snapshotHash: compareResult.context.sourceSnapshotHash,
  }, {
    databaseName: request.compare.source.databaseName,
    refreshLiveSchema: request.compare.refreshSourceSchema,
  });

  const changedTableNames = new Set(
    compareResult.tableChanges.map((change) =>
      normalizeName(change.fileTable?.physicalTableName ?? change.dbTable?.name ?? change.entityKey),
    ),
  );

  const nodes = source.catalog.tables.map((table, index) => ({
    id: normalizeName(table.name),
    tableName: table.name,
    label: table.name,
    columnCount: table.columns.length,
    foreignKeyCount: table.foreignKeys.length,
    changed: changedTableNames.has(normalizeName(table.name)),
    highlighted: false,
    position: { x: (index % 4) * 320, y: Math.floor(index / 4) * 220 },
    width: 240,
    height: Math.max(150, 96 + table.columns.length * 26),
  }));

  const edges = source.catalog.tables.flatMap((table) =>
    table.foreignKeys.map((foreignKey) => ({
      id: `${normalizeName(table.name)}->${normalizeName(foreignKey.referencedTableName)}:${foreignKey.name}`,
      sourceId: normalizeName(table.name),
      targetId: normalizeName(foreignKey.referencedTableName),
      relationshipName: foreignKey.name,
      changed:
        changedTableNames.has(normalizeName(table.name)) ||
        changedTableNames.has(normalizeName(foreignKey.referencedTableName)),
    })),
  );

  const selected = new Set(request.selectedTableNames.map((name) => normalizeName(name)));
  let visible = new Set(nodes.map((node) => node.id));
  if (request.mode === "changed") {
    visible = new Set(changedTableNames);
  } else if (request.mode === "selection" && selected.size > 0) {
    visible = new Set(selected);
  }
  if (request.includeNeighbors && visible.size > 0 && visible.size < nodes.length) {
    visible = collectNeighborNames(visible, edges);
  }

  const filteredNodes = nodes
    .filter((node) => request.mode === "full" || visible.has(node.id))
    .map((node) => ({
      ...node,
      highlighted:
        selected.size > 0
          ? visible.has(node.id) && selected.has(node.id)
          : changedTableNames.has(node.id),
    }));
  const nodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = edges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));

  return {
    compareResult,
    mode: request.mode,
    nodes: filteredNodes,
    edges: filteredEdges,
    changedTableNames: Array.from(changedTableNames).sort(),
    availableTableNames: source.catalog.tables.map((table) => table.name).sort(),
  };
}
