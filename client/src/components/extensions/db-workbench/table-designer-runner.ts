import type { DbDriver, DbTableSchema } from "@shared/schema";
import { planTableDesignApply } from "./table-designer-apply";

// Pure orchestration for the visual table designer dialog: open/close state and
// the apply flow. Following the workbench's runner convention, all side effects
// are injected so the flow is unit-testable without React or a live database.

export interface TableDesignerTarget {
  driver: DbDriver;
  schemaName?: string;
  readonly: boolean;
  /** null = designing a brand-new table; otherwise editing this introspected table. */
  sourceSchema: DbTableSchema | null;
}

export interface TableDesignerNotice {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

export interface TableDesignerStateActions {
  openForNewTable: (target: Omit<TableDesignerTarget, "sourceSchema">) => void;
  openForExistingTable: (
    target: Omit<TableDesignerTarget, "sourceSchema"> & { sourceSchema: DbTableSchema },
  ) => void;
  close: () => void;
}

export function createTableDesignerStateActions(input: {
  setOpen: (open: boolean) => void;
  setTarget: (target: TableDesignerTarget | null) => void;
}): TableDesignerStateActions {
  const openWith = (target: TableDesignerTarget) => {
    input.setTarget(target);
    input.setOpen(true);
  };
  return {
    openForNewTable: (target) => openWith({ ...target, sourceSchema: null }),
    openForExistingTable: (target) => openWith(target),
    close: () => {
      input.setOpen(false);
      input.setTarget(null);
    },
  };
}

export type ApplyTableDesignResult = "blocked" | "applied";

export interface RunApplyTableDesignInput {
  script: string;
  readonly: boolean;
  /**
   * Hands the DDL script to the existing execution pipeline, which performs its
   * own dangerous-SQL confirmation. Resolves once the script has been submitted.
   */
  executeScript: (sql: string) => Promise<unknown>;
  notify: (notice: TableDesignerNotice) => void;
  closeDesigner: () => void;
  /** Re-introspect after a structure change so the UI reflects the new shape. */
  refreshSchema?: () => void | Promise<unknown>;
}

export async function runApplyTableDesign(
  input: RunApplyTableDesignInput,
): Promise<ApplyTableDesignResult> {
  const plan = planTableDesignApply({ script: input.script, readonly: input.readonly });

  if (!plan.allowed) {
    input.notify({
      title: "无法应用结构变更",
      description: plan.blockedReason,
      variant: "destructive",
    });
    return "blocked";
  }

  await input.executeScript(plan.script);
  input.closeDesigner();
  if (input.refreshSchema) {
    await input.refreshSchema();
  }
  return "applied";
}
