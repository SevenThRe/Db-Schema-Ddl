import { useEffect, useMemo, useState } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DbConnectionSummary, DbGraphRequest } from "@shared/schema";
import { useDbGraphData } from "@/hooks/use-db-management";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DbSchemaGraphProps {
  selectedConnection: DbConnectionSummary | null;
  selectedFileId: number | null;
  selectedFileName?: string | null;
  selectedSheet: string | null;
}

const elk = new ELK();

async function layoutGraph(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  const graph = await elk.layout({
    id: "db-graph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "80",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: (node.style?.width as number | undefined) ?? 260,
      height: (node.style?.height as number | undefined) ?? 180,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });

  const positions = new Map(
    (graph.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
  );
  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
}

export function DbSchemaGraph({
  selectedConnection,
  selectedFileId,
  selectedFileName,
  selectedSheet,
}: DbSchemaGraphProps) {
  const [mode, setMode] = useState<DbGraphRequest["mode"]>("full");
  const [includeNeighbors, setIncludeNeighbors] = useState(true);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const request = useMemo<DbGraphRequest | null>(() => {
    if (!selectedConnection?.lastSelectedDatabase) {
      return null;
    }
    return {
      source: {
        kind: "live",
        connectionId: selectedConnection.id,
        databaseName: selectedConnection.lastSelectedDatabase,
      },
      compareTo:
        selectedFileId && selectedSheet
          ? {
              kind: "file",
              fileId: selectedFileId,
              fileName: selectedFileName ?? `file-${selectedFileId}`,
              sheetName: selectedSheet,
            }
          : undefined,
      mode,
      selectedTableNames: selectedTables,
      includeNeighbors,
    };
  }, [includeNeighbors, mode, selectedConnection, selectedFileId, selectedFileName, selectedSheet, selectedTables]);

  const graph = useDbGraphData(selectedConnection?.id ?? null, request);

  useEffect(() => {
    if (!graph.data) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const nextNodes: Node[] = graph.data.nodes.map((node) => ({
      id: node.id,
      position: node.position,
      data: {
        label: (
          <div className={`min-w-[220px] border p-3 ${node.highlighted ? "border-primary bg-primary/10" : node.changed ? "border-amber-500 bg-amber-500/10" : "border-border bg-background"}`}>
            <div className="text-sm font-semibold">{node.label}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              列 {node.columnCount} · FK {node.foreignKeyCount}
            </div>
          </div>
        ),
      },
      style: {
        width: node.width ?? 260,
        height: node.height ?? 160,
      },
      draggable: false,
      selectable: true,
    }));
    const nextEdges: Edge[] = graph.data.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      label: edge.relationshipName,
      animated: edge.changed,
      style: { stroke: edge.changed ? "#f59e0b" : "#64748b", strokeWidth: edge.changed ? 2.5 : 1.5 },
    }));
    void layoutGraph(nextNodes, nextEdges).then((laidOut) => {
      setNodes(laidOut);
      setEdges(nextEdges);
    });
  }, [graph.data]);

  const availableTables = graph.data?.availableTableNames ?? [];

  const toggleTable = (tableName: string, checked: boolean) => {
    setSelectedTables((current) =>
      checked ? Array.from(new Set([...current, tableName])) : current.filter((value) => value !== tableName),
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">关系图控制</CardTitle>
          <CardDescription>整库关系图，高亮变更表，并支持按表聚焦。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{selectedConnection?.name ?? "未选连接"}</Badge>
            <Badge variant="outline">{selectedConnection?.lastSelectedDatabase ?? "未选数据库"}</Badge>
            <Badge variant="secondary">{selectedFileName ?? "未选文件"}</Badge>
          </div>

          <Select value={mode} onValueChange={(value: DbGraphRequest["mode"]) => setMode(value)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="full">全库</SelectItem>
              <SelectItem value="changed">变更表 + 邻接关系</SelectItem>
              <SelectItem value="selection">勾选表聚焦</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-3 border border-dashed border-border bg-muted/20 px-3 py-3">
            <Checkbox checked={includeNeighbors} onCheckedChange={(checked) => setIncludeNeighbors(checked === true)} />
            <span className="text-sm text-muted-foreground">包含相邻关联表</span>
          </div>

          <ScrollArea className="h-[420px] pr-3">
            <div className="space-y-2">
              {availableTables.map((tableName) => (
                <label key={tableName} className="flex items-center gap-3 border border-border bg-background px-3 py-2 text-sm">
                  <Checkbox checked={selectedTables.includes(tableName)} onCheckedChange={(checked) => toggleTable(tableName, checked === true)} />
                  <span className="truncate">{tableName}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">全库关系图</CardTitle>
          <CardDescription>默认展示整库关系，变更表会在图中高亮。</CardDescription>
        </CardHeader>
        <CardContent className="h-[760px]">
          {!request ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              先选择连接和数据库，图视图才会显示。
            </div>
          ) : (
            <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} elementsSelectable>
              <MiniMap />
              <Controls />
              <Background gap={24} size={1} />
            </ReactFlow>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
