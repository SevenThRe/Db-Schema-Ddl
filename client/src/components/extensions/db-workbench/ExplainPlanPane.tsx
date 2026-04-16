// ExplainPlanPane — EXPLAIN プラングラフビジュアライザー
//
// 機能（PLAN-01 / PLAN-02）:
//   - PlanNode ツリーを @xyflow/react のノード/エッジに変換
//   - elkjs レイアウト（layered アルゴリズム、RIGHT 方向）でノード位置を計算
//   - useMemo でレイアウト結果をメモ化（plan 変更時のみ再計算）
//   - フルテーブルスキャンノードを赤枠 + 背景で強調表示（FULL_TABLE_SCAN）
//   - 大量行推定ノードをアンバーバッジで表示（LARGE_ROWS_ESTIMATE）
//   - カスタムノードコンポーネント（planNode タイプ）

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { DbExplainPlan, PlanNode } from "@shared/schema";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

export interface ExplainPlanPaneProps {
  /** EXPLAIN 結果（null の場合は空状態を表示） */
  plan: DbExplainPlan | null;
  /** ロード中フラグ */
  isLoading: boolean;
}

// xyflow ノードデータ型（PlanNode のフラット表現）
interface PlanNodeData {
  label: string;
  nodeType: string;
  relationName?: string;
  cost?: number;
  rows?: number;
  warnings: string[];
  [key: string]: unknown;
}

// ──────────────────────────────────────────────
// PlanNode ツリー → xyflow Nodes/Edges 変換
// ──────────────────────────────────────────────

/**
 * PlanNode ツリーを再帰的に走査して xyflow のノード/エッジを生成する。
 * 初回レイアウト前はすべてのノード位置を (0, 0) に設定する（ELK が後で配置）。
 */
function flattenPlanTree(
  node: PlanNode,
  parentId?: string,
): { nodes: Node<PlanNodeData>[]; edges: Edge[] } {
  const nodes: Node<PlanNodeData>[] = [];
  const edges: Edge[] = [];

  // 現ノードをxyflowノードとして追加
  nodes.push({
    id: node.id,
    position: { x: 0, y: 0 },
    type: "planNode",
    data: {
      label: node.label,
      nodeType: node.nodeType,
      relationName: node.relationName,
      cost: node.cost,
      rows: node.rows,
      warnings: node.warnings,
    },
  });

  // 親子関係をエッジとして追加
  if (parentId) {
    edges.push({
      id: `${parentId}->${node.id}`,
      source: parentId,
      target: node.id,
      style: { stroke: "hsl(var(--border))" },
    });
  }

  // 子ノードを再帰的に処理
  for (const child of node.children) {
    const childResult = flattenPlanTree(child, node.id);
    nodes.push(...childResult.nodes);
    edges.push(...childResult.edges);
  }

  return { nodes, edges };
}

// ──────────────────────────────────────────────
// カスタムノードコンポーネント
// ──────────────────────────────────────────────

/** PlanNode の 1 ノードを表示するカスタム xyflow ノード */
function PlanNodeComponent({ data }: { data: PlanNodeData }) {
  const isFullTableScan = data.warnings.includes("FULL_TABLE_SCAN");
  const isLargeRows = data.warnings.includes("LARGE_ROWS_ESTIMATE");

  return (
    <div
      className={cn(
        "min-w-[120px] rounded-md px-3 py-2 text-left shadow-sm",
        isFullTableScan
          ? // フルテーブルスキャン: 赤枠 + 赤背景ティント（PLAN-02）
            "border-2 border-[hsl(var(--explain-risk-high))] bg-[hsl(var(--explain-risk-high)/0.1)]"
          : // 通常ノード: 標準ボーダー + カード背景
            "border border-border bg-card",
      )}
    >
      {/* テーブル/リレーション名 */}
      <div className="text-xs font-semibold text-foreground">
        {data.relationName ?? data.label}
      </div>

      {/* 操作タイプ */}
      <div className="text-xs text-muted-foreground">{data.nodeType}</div>

      {/* 行推定値 */}
      {data.rows !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          rows: {data.rows.toLocaleString()}
        </div>
      )}

      {/* コスト */}
      {data.cost !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          cost: {data.cost.toFixed(2)}
        </div>
      )}

      {/* リスクバッジ */}
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

// カスタムノードタイプのマップ（xyflow の nodeTypes prop に渡す）
const NODE_TYPES = { planNode: PlanNodeComponent };

// ELK インスタンス（モジュールレベルで 1 度だけ生成）
const elk = new ELK();

// ──────────────────────────────────────────────
// ELK レイアウト計算（非同期）
// ──────────────────────────────────────────────

/**
 * ELK layered アルゴリズムでノード位置を計算する。
 * direction: RIGHT（左から右へのフロー）。
 * ノードサイズは固定値（160×80）を使用。
 */
async function computeElkLayout(
  nodes: Node<PlanNodeData>[],
  edges: Edge[],
): Promise<Node<PlanNodeData>[]> {
  const NODE_WIDTH = 160;
  const NODE_HEIGHT = 80;

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const laid = await elk.layout(elkGraph);

  return nodes.map((n) => {
    const elkNode = laid.children?.find((c) => c.id === n.id);
    return {
      ...n,
      position: {
        x: elkNode?.x ?? 0,
        y: elkNode?.y ?? 0,
      },
    };
  });
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

/**
 * ExplainPlanPane — EXPLAIN プラングラフパネル
 *
 * PlanNode ツリーを xyflow グラフに変換し、ELK レイアウトでノードを配置する。
 * レイアウト結果は plan.rawJson をキーとしてメモ化し、不要な再計算を防ぐ。
 */
export function ExplainPlanPane({ plan, isLoading }: ExplainPlanPaneProps) {
  // ELK レイアウト後のノード（非同期で設定）
  const [layoutNodes, setLayoutNodes] = useState<Node<PlanNodeData>[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [activeView, setActiveView] = useState<"graph" | "raw">("graph");
  const { toast } = useToast();

  // PlanNode ツリー → xyflow Nodes/Edges 変換（plan.rawJson 変更時のみ再計算）
  const { nodes: rawNodes, edges } = useMemo(() => {
    if (!plan) return { nodes: [], edges: [] };
    return flattenPlanTree(plan.root);
  }, [plan]);

  // ELK レイアウト計算（rawNodes/edges 変更時のみ実行、メモ化で高コストを回避）
  useEffect(() => {
    if (rawNodes.length === 0) {
      setLayoutNodes([]);
      setLayoutReady(false);
      return;
    }

    let cancelled = false;
    setLayoutReady(false);

    computeElkLayout(rawNodes, edges).then((positioned) => {
      if (!cancelled) {
        setLayoutNodes(positioned);
        setLayoutReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [rawNodes, edges]);

  useEffect(() => {
    setActiveView("graph");
  }, [plan?.rawJson]);

  const handleCopyRawJson = useCallback(async () => {
    if (!plan?.rawJson) return;
    try {
      await navigator.clipboard.writeText(plan.rawJson);
      toast({ title: "已复制 EXPLAIN JSON", variant: "success" });
    } catch (error) {
      toast({
        title: "复制失败",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  }, [plan?.rawJson, toast]);

  // ローディング状態
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-muted-foreground">
          Calculating execution plan...
        </span>
      </div>
    );
  }

  // プランなし状態
  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-muted-foreground">
          EXPLAIN is only available for SELECT statements
        </span>
      </div>
    );
  }

  // ELK レイアウト計算中
  if (!layoutReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-muted-foreground">
          Laying out graph...
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-panel-muted/70 px-2 py-1">
        <Tabs
          value={activeView}
          onValueChange={(value) => setActiveView(value as "graph" | "raw")}
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
          onClick={() => {
            void handleCopyRawJson();
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy JSON
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeView === "raw" ? (
          <div className="h-full overflow-auto bg-background p-3">
            <pre className="whitespace-pre-wrap break-all rounded-sm border border-border bg-panel-muted/30 p-3 font-mono text-xs text-foreground">
              {plan.rawJson}
            </pre>
          </div>
        ) : (
          <div className="h-full w-full">
            <ReactFlow
              nodes={layoutNodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            </ReactFlow>
          </div>
        )}
      </div>
    </div>
  );
}
