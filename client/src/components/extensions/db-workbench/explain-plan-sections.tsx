import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ExplainPlanNodeData } from "./explain-plan-runtime";

export function ExplainPlanStatusState({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="text-xs text-muted-foreground">
        {message}
      </span>
    </div>
  );
}

function ExplainPlanNodeComponent({ data }: { data: ExplainPlanNodeData }) {
  const isFullTableScan = data.warnings.includes("FULL_TABLE_SCAN");
  const isLargeRows = data.warnings.includes("LARGE_ROWS_ESTIMATE");

  return (
    <div
      className={cn(
        "min-w-[120px] rounded-md px-3 py-2 text-left shadow-sm",
        isFullTableScan
          ? "border-2 border-[hsl(var(--explain-risk-high))] bg-[hsl(var(--explain-risk-high)/0.1)]"
          : "border border-border bg-card",
      )}
    >
      <div className="text-xs font-semibold text-foreground">
        {data.relationName ?? data.label}
      </div>

      <div className="text-xs text-muted-foreground">{data.nodeType}</div>

      {data.rows !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          rows: {data.rows.toLocaleString()}
        </div>
      )}

      {data.cost !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          cost: {data.cost.toFixed(2)}
        </div>
      )}

      <div className="mt-1 flex flex-wrap gap-1">
        {isFullTableScan && (
          <Badge
            variant="destructive"
            className="h-4 px-1 py-0 text-[9px] font-semibold"
          >
            FULL SCAN
          </Badge>
        )}
        {isLargeRows && (
          <Badge
            className="h-4 bg-[hsl(var(--explain-risk-med))] px-1 py-0 text-[9px] font-semibold text-white hover:bg-[hsl(var(--explain-risk-med))]"
          >
            LARGE ROWS
          </Badge>
        )}
      </div>
    </div>
  );
}

export const EXPLAIN_PLAN_NODE_TYPES = { planNode: ExplainPlanNodeComponent };

export function ExplainPlanToolbar({
  activeView,
  onActiveViewChange,
  onCopyRawJson,
}: {
  activeView: "graph" | "raw";
  onActiveViewChange: (view: "graph" | "raw") => void;
  onCopyRawJson: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-panel-muted/70 px-2 py-1">
      <Tabs
        value={activeView}
        onValueChange={(value) => onActiveViewChange(value as "graph" | "raw")}
      >
        <TabsList className="h-7">
          <TabsTrigger value="graph" className="h-6 text-xs">
            Graph
          </TabsTrigger>
          <TabsTrigger value="raw" className="h-6 text-xs">
            Raw JSON
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={onCopyRawJson}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy JSON
      </Button>
    </div>
  );
}

export function ExplainPlanRawJsonView({
  rawJson,
}: {
  rawJson: string;
}) {
  return (
    <div className="h-full overflow-auto bg-background p-3">
      <pre className="whitespace-pre-wrap break-all rounded-sm border border-border bg-panel-muted/30 p-3 font-mono text-xs text-foreground">
        {rawJson}
      </pre>
    </div>
  );
}

export function ExplainPlanGraphView({
  nodes,
  edges,
}: {
  nodes: Node<ExplainPlanNodeData>[];
  edges: Edge[];
}) {
  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={EXPLAIN_PLAN_NODE_TYPES}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
