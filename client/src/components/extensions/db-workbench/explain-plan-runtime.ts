import type { Node, Edge } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { PlanNode } from "@shared/schema";

export interface ExplainPlanNodeData {
  label: string;
  nodeType: string;
  relationName?: string;
  cost?: number;
  rows?: number;
  warnings: string[];
  [key: string]: unknown;
}

export function flattenExplainPlanTree(
  node: PlanNode,
  parentId?: string,
): { nodes: Node<ExplainPlanNodeData>[]; edges: Edge[] } {
  const nodes: Node<ExplainPlanNodeData>[] = [];
  const edges: Edge[] = [];

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

  if (parentId) {
    edges.push({
      id: `${parentId}->${node.id}`,
      source: parentId,
      target: node.id,
      style: { stroke: "hsl(var(--border))" },
    });
  }

  for (const child of node.children) {
    const childResult = flattenExplainPlanTree(child, node.id);
    nodes.push(...childResult.nodes);
    edges.push(...childResult.edges);
  }

  return { nodes, edges };
}

const elk = new ELK();

export async function computeExplainPlanLayout(
  nodes: Node<ExplainPlanNodeData>[],
  edges: Edge[],
): Promise<Node<ExplainPlanNodeData>[]> {
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
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const laid = await elk.layout(elkGraph);

  return nodes.map((node) => {
    const elkNode = laid.children?.find((child) => child.id === node.id);
    return {
      ...node,
      position: {
        x: elkNode?.x ?? 0,
        y: elkNode?.y ?? 0,
      },
    };
  });
}
