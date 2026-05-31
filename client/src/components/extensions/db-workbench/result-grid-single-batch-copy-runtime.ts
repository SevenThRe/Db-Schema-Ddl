import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import type { DbQueryColumn } from "@shared/schema";
import { writeClipboardText } from "./result-grid-clipboard";
import {
  buildSelectedRowJson,
  buildSelectedRowTsv,
} from "./result-grid-copy-model";
import {
  formatCellValue,
  type GridCellValue,
  type GridRowView,
} from "./result-grid-row-model";

export interface ResultGridSingleBatchCopyActionsInput {
  selectedRowData: GridRowView | null;
  columns: DbQueryColumn[];
}

export function useResultGridSingleBatchCopyActions({
  selectedRowData,
  columns,
}: ResultGridSingleBatchCopyActionsInput) {
  const { toast } = useToast();

  const copyText = useCallback(
    async (text: string, successTitle: string) => {
      try {
        await writeClipboardText(text);
        toast({ title: successTitle, variant: "success" });
      } catch (error) {
        toast({
          title: "复制失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const handleCopyRowJson = useCallback(() => {
    if (!selectedRowData) return;
    void copyText(buildSelectedRowJson(selectedRowData, columns), "已复制当前行 JSON");
  }, [columns, copyText, selectedRowData]);

  const handleCopyRowTsv = useCallback(() => {
    if (!selectedRowData) return;
    void copyText(buildSelectedRowTsv(selectedRowData, columns), "已复制当前行 TSV");
  }, [columns, copyText, selectedRowData]);

  const handleCopyCell = useCallback(
    (column: DbQueryColumn, value: GridCellValue) => {
      void copyText(formatCellValue(value), `已复制 ${column.name}`);
    },
    [copyText],
  );

  return {
    handleCopyRowJson,
    handleCopyRowTsv,
    handleCopyCell,
  };
}
