import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DbQueryBatchResult } from "@shared/schema";

export function BatchTabs({
  batches,
  activeIndex,
  onSelect,
}: {
  batches: DbQueryBatchResult[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  if (batches.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="Statement results"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-panel-muted px-2 py-1"
    >
      {batches.map((batch, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-selected={index === activeIndex}
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={() => onSelect(index)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs transition-colors",
            index === activeIndex
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {batch.error ? <XCircle className="h-3 w-3 text-destructive" /> : null}
          <span>Statement {index + 1}</span>
          <span className="text-[10px] text-muted-foreground">
            {batch.elapsedMs}ms
          </span>
        </button>
      ))}
    </div>
  );
}

export function ScriptRunSummary({
  batches,
  activeIndex,
  onSelect,
}: {
  batches: DbQueryBatchResult[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (batches.length <= 1) return null;

  const failedIndexes = batches
    .map((batch, index) => (batch.error ? index : -1))
    .filter((index) => index >= 0);
  const successCount = batches.length - failedIndexes.length;
  const firstFailedIndex = failedIndexes[0];
  const firstFailedBatch =
    typeof firstFailedIndex === "number" ? batches[firstFailedIndex] : null;

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">
            Script summary
          </span>
          <span className="text-muted-foreground">
            {batches.length} statements
          </span>
          <span className="text-emerald-700 dark:text-emerald-300">
            {successCount} succeeded
          </span>
          {failedIndexes.length > 0 ? (
            <span className="text-destructive">
              {failedIndexes.length} failed
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {firstFailedBatch
            ? `First failure: statement ${firstFailedIndex + 1} · ${firstFailedBatch.error}`
            : "All statements completed without statement-level failures."}
        </p>
      </div>
      {firstFailedBatch ? (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => onSelect(firstFailedIndex)}
          disabled={activeIndex === firstFailedIndex}
        >
          Jump to failed statement
        </Button>
      ) : null}
    </div>
  );
}
