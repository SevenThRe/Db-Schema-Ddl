import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResultGridToolbar({
  filterText,
  onFilterTextChange,
  isRowWindowTruncated,
  isEditEnabled,
  filteredCount,
  loadedCount,
  pendingInsertedCount,
  retainedCount,
  totalLabel,
  selectedLoadedIndex,
  onAddInsertedRow,
}: {
  filterText: string;
  onFilterTextChange: (value: string) => void;
  isRowWindowTruncated: boolean;
  isEditEnabled: boolean;
  filteredCount: number;
  loadedCount: number;
  pendingInsertedCount: number;
  retainedCount: number;
  totalLabel: string;
  selectedLoadedIndex?: number;
  onAddInsertedRow: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-2 py-1.5">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filterText}
          onChange={(event) => onFilterTextChange(event.target.value)}
          placeholder={isRowWindowTruncated ? "Filter retained rows" : "Filter loaded rows"}
          className="h-7 pl-7 pr-7 text-xs"
        />
        {filterText ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onFilterTextChange("")}
            aria-label="Clear filter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onAddInsertedRow}
        disabled={!isEditEnabled}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add row draft
      </Button>
      <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
        <span>{filteredCount.toLocaleString()} shown</span>
        <span>{loadedCount.toLocaleString()} loaded</span>
        {pendingInsertedCount > 0 ? (
          <span className="font-medium text-sky-700 dark:text-sky-300">
            {pendingInsertedCount.toLocaleString()} draft
          </span>
        ) : null}
        {isRowWindowTruncated ? (
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Retaining latest {retainedCount.toLocaleString()} rows
          </span>
        ) : null}
        <span>{totalLabel}</span>
        {selectedLoadedIndex ? (
          <span className="font-medium text-foreground">
            Row {selectedLoadedIndex.toLocaleString()} selected
          </span>
        ) : null}
      </div>
    </div>
  );
}
