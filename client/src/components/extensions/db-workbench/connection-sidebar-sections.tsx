import { RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ConnectionSidebarObjectExplorerHeader({
  isSchemaLoading,
  onRefreshSchema,
}: {
  isSchemaLoading: boolean;
  onRefreshSchema?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Object Explorer
        </span>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
          Schemas · Tables · Views · Routines · Triggers · Sequences
        </p>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
          Inspect DDL: tables, views, routines, triggers, PostgreSQL sequences,
          indexes, and foreign keys.
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onRefreshSchema}
        disabled={isSchemaLoading}
        aria-label="Refresh schema"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isSchemaLoading && "animate-spin")} />
      </Button>
    </div>
  );
}

export function ConnectionSidebarObjectFilter({
  objectFilter,
  onObjectFilterChange,
  onClearObjectFilter,
}: {
  objectFilter: string;
  onObjectFilterChange: (value: string) => void;
  onClearObjectFilter: () => void;
}) {
  return (
    <div className="relative px-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={objectFilter}
        onChange={(event) => onObjectFilterChange(event.target.value)}
        placeholder="Search tables, views, routines, triggers, sequences"
        className="h-8 pl-8 pr-8 text-[12px]"
        aria-label="Search tables, views, routines, triggers, sequences, columns, indexes, and foreign keys"
      />
      {objectFilter ? (
        <button
          type="button"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
          onClick={onClearObjectFilter}
          aria-label="Clear object filter"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
