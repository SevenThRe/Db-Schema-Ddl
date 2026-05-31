import type {
  DbGridEditPatchCell,
  DbQueryColumn,
} from "@shared/schema";
import {
  parseEditedValue,
  parseInsertedValue,
  type GridCellValue,
  type GridRowView,
} from "./result-grid-row-model";

export type GridEditCommitPlan =
  | { kind: "ignore" }
  | {
      kind: "insert";
      rowDraftId: string;
      columnName: string;
      nextValue: GridCellValue | undefined;
    }
  | {
      kind: "patch";
      patch: DbGridEditPatchCell;
    }
  | {
      kind: "missing-primary-key";
      title: string;
      description: string;
    };

export interface BuildGridEditCommitPlanInput {
  isEditEnabled: boolean;
  rowView: GridRowView;
  column: DbQueryColumn;
  columnIndex: number;
  nextRawValue: string;
  primaryKeySet: ReadonlySet<string>;
  pendingEditLookup: Map<string, Map<string, DbGridEditPatchCell>>;
}

export function buildGridEditCommitPlan({
  isEditEnabled,
  rowView,
  column,
  columnIndex,
  nextRawValue,
  primaryKeySet,
  pendingEditLookup,
}: BuildGridEditCommitPlanInput): GridEditCommitPlan {
  if (!isEditEnabled) {
    return { kind: "ignore" };
  }

  if (rowView.kind === "insert-draft") {
    const parsedValue = parseInsertedValue(nextRawValue);
    return {
      kind: "insert",
      rowDraftId: rowView.rowDraftId,
      columnName: column.name,
      nextValue: parsedValue.kind === "value" ? parsedValue.value : undefined,
    };
  }

  if (rowView.isPendingDelete || primaryKeySet.has(column.name)) {
    return { kind: "ignore" };
  }

  if (!rowView.rowPrimaryKey || !rowView.rowPkTuple) {
    return {
      kind: "missing-primary-key",
      title: "Cannot edit row",
      description: "Primary key column mapping is incomplete for this batch.",
    };
  }

  const existingPatch = pendingEditLookup
    .get(rowView.rowPkTuple)
    ?.get(column.name);
  const beforeValue = existingPatch?.beforeValue ?? rowView.row.values[columnIndex] ?? null;
  const nextValue = parseEditedValue(beforeValue, nextRawValue);

  return {
    kind: "patch",
    patch: {
      rowPrimaryKey: rowView.rowPrimaryKey,
      rowPkTuple: rowView.rowPkTuple,
      columnName: column.name,
      beforeValue,
      nextValue,
    },
  };
}
