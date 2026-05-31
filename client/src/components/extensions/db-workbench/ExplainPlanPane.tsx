import { useCallback, useEffect, useMemo, useState } from "react";
import type { Node } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import type { DbExplainPlan } from "@shared/schema";
import {
  computeExplainPlanLayout,
  flattenExplainPlanTree,
  type ExplainPlanNodeData,
} from "./explain-plan-runtime";
import {
  ExplainPlanGraphView,
  ExplainPlanRawJsonView,
  ExplainPlanStatusState,
  ExplainPlanToolbar,
} from "./explain-plan-sections";

export interface ExplainPlanPaneProps {
  plan: DbExplainPlan | null;
  isLoading: boolean;
}

export function ExplainPlanPane({ plan, isLoading }: ExplainPlanPaneProps) {
  const [layoutNodes, setLayoutNodes] = useState<
    Node<ExplainPlanNodeData>[]
  >([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [activeView, setActiveView] = useState<"graph" | "raw">("graph");
  const { toast } = useToast();

  const { nodes: rawNodes, edges } = useMemo(() => {
    if (!plan) return { nodes: [], edges: [] };
    return flattenExplainPlanTree(plan.root);
  }, [plan]);

  useEffect(() => {
    if (rawNodes.length === 0) {
      setLayoutNodes([]);
      setLayoutReady(false);
      return;
    }

    let cancelled = false;
    setLayoutReady(false);

    computeExplainPlanLayout(rawNodes, edges).then((positioned) => {
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

  if (isLoading) {
    return (
      <ExplainPlanStatusState message="Calculating execution plan..." />
    );
  }

  if (!plan) {
    return (
      <ExplainPlanStatusState message="EXPLAIN is only available for SELECT statements" />
    );
  }

  if (!layoutReady) {
    return <ExplainPlanStatusState message="Laying out graph..." />;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <ExplainPlanToolbar
        activeView={activeView}
        onActiveViewChange={setActiveView}
        onCopyRawJson={() => {
          void handleCopyRawJson();
        }}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeView === "raw" ? (
          <ExplainPlanRawJsonView rawJson={plan.rawJson} />
        ) : (
          <ExplainPlanGraphView nodes={layoutNodes} edges={edges} />
        )}
      </div>
    </div>
  );
}
