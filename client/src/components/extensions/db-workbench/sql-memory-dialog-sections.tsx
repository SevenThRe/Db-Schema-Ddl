import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type {
  SqlMemoryRetentionSettings,
  SqlWorkbenchMemoryState,
} from "./sql-memory";
import type {
  MemoryCategory,
  SqlMemoryDialogScope,
} from "./sql-memory-dialog-model";

interface SqlMemoryDialogContentProps {
  memory: SqlWorkbenchMemoryState;
  connectionLabel: string;
  activeSchema: string | null;
  scope: SqlMemoryDialogScope;
  onRetentionChange: (
    key: keyof SqlMemoryRetentionSettings,
    checked: boolean,
  ) => void;
  onClearCategory: (category: MemoryCategory) => void;
  onClearCurrentSchema: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function SqlMemoryDialogContent({
  memory,
  connectionLabel,
  activeSchema,
  scope,
  onRetentionChange,
  onClearCategory,
  onClearCurrentSchema,
  onClearAll,
  onClose,
}: SqlMemoryDialogContentProps) {
  return (
    <DialogContent className="max-w-6xl overflow-hidden p-0">
      <div className="flex max-h-[80vh] flex-col">
        <SqlMemoryDialogHeader connectionLabel={connectionLabel} />
        <SqlMemorySummaryBar memory={memory} activeSchema={activeSchema} />

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_320px] divide-x divide-border">
          <ScrollArea className="min-h-0">
            <SqlMemoryLists memory={memory} scope={scope} />
          </ScrollArea>

          <SqlMemoryRetentionPanel
            memory={memory}
            onRetentionChange={onRetentionChange}
            onClearCategory={onClearCategory}
            onClearCurrentSchema={onClearCurrentSchema}
          />
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <div className="flex w-full items-center justify-between gap-3">
            <Button type="button" variant="destructive" onClick={onClearAll}>
              Clear all memory
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

function SqlMemoryDialogHeader({
  connectionLabel,
}: {
  connectionLabel: string;
}) {
  return (
    <DialogHeader className="border-b border-border px-5 py-4">
      <DialogTitle>SQL memory</DialogTitle>
      <DialogDescription>
        Inspect the local query memory that powers adaptive SQL ranking for{" "}
        {connectionLabel}. Only safe pattern metadata and value-shape summaries
        are persisted by default, not raw result sets.
      </DialogDescription>
    </DialogHeader>
  );
}

function SqlMemorySummaryBar({
  memory,
  activeSchema,
}: {
  memory: SqlWorkbenchMemoryState;
  activeSchema: string | null;
}) {
  return (
    <div className="border-b border-border px-5 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <SqlMemoryCountBadge>
          {memory.acceptedSuggestions.length} accepted suggestions
        </SqlMemoryCountBadge>
        <SqlMemoryCountBadge>
          {memory.queryPatterns.length} query patterns
        </SqlMemoryCountBadge>
        <SqlMemoryCountBadge>
          {memory.valueProfiles.length} value profiles
        </SqlMemoryCountBadge>
        {activeSchema ? (
          <SqlMemoryCountBadge>Scope: {activeSchema}</SqlMemoryCountBadge>
        ) : null}
      </div>
    </div>
  );
}

function SqlMemoryLists({
  memory,
  scope,
}: {
  memory: SqlWorkbenchMemoryState;
  scope: SqlMemoryDialogScope;
}) {
  return (
    <div className="space-y-5 p-4">
      <SqlMemoryAcceptedSuggestionsSection
        memory={memory}
        acceptedInScopeCount={scope.acceptedInScope.length}
      />
      <SqlMemoryQueryPatternsSection
        memory={memory}
        patternsInScopeCount={scope.patternsInScope.length}
      />
      <SqlMemoryValueProfilesSection
        memory={memory}
        valueProfilesInScopeCount={scope.valueProfilesInScope.length}
      />
    </div>
  );
}

function SqlMemoryAcceptedSuggestionsSection({
  memory,
  acceptedInScopeCount,
}: {
  memory: SqlWorkbenchMemoryState;
  acceptedInScopeCount: number;
}) {
  return (
    <section className="space-y-2">
      <SqlMemorySectionHeader
        title="Accepted suggestions"
        description="Completion choices explicitly accepted inside the SQL editor."
        countLabel={`${acceptedInScopeCount} in scope`}
      />
      <div className="space-y-2">
        {memory.acceptedSuggestions.slice(0, 12).map((entry) => (
          <div
            key={entry.key}
            className="rounded-sm border border-border bg-background px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{entry.label}</span>
              <SqlMemoryCountBadge>{entry.kind}</SqlMemoryCountBadge>
              <SqlMemoryCountBadge>{entry.count}x</SqlMemoryCountBadge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {entry.schema ? <span>{entry.schema}</span> : null}
              {entry.relation ? <span>{entry.relation}</span> : null}
              {entry.column ? <span>{entry.column}</span> : null}
              <span>{entry.lastAcceptedAt.replace("T", " ").slice(0, 16)}</span>
            </div>
          </div>
        ))}
        {memory.acceptedSuggestions.length === 0 ? (
          <SqlMemoryEmptyState message="No accepted completion memory has been captured yet." />
        ) : null}
      </div>
    </section>
  );
}

function SqlMemoryQueryPatternsSection({
  memory,
  patternsInScopeCount,
}: {
  memory: SqlWorkbenchMemoryState;
  patternsInScopeCount: number;
}) {
  return (
    <section className="space-y-2">
      <SqlMemorySectionHeader
        title="Query patterns"
        description="Reusable statement skeletons and grounded relation usage from successful runs."
        countLabel={`${patternsInScopeCount} in scope`}
      />
      <div className="space-y-2">
        {memory.queryPatterns.slice(0, 12).map((entry) => (
          <div
            key={entry.key}
            className="rounded-sm border border-border bg-background px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {entry.summary}
              </span>
              <SqlMemoryCountBadge>{entry.statementKind}</SqlMemoryCountBadge>
              <SqlMemoryCountBadge>{entry.count}x</SqlMemoryCountBadge>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {entry.relationKeys.length} relation refs ·{" "}
              {entry.columnKeys.length} column refs
              {entry.schema ? ` · ${entry.schema}` : ""}
            </div>
          </div>
        ))}
        {memory.queryPatterns.length === 0 ? (
          <SqlMemoryEmptyState message="No successful-query pattern memory has been captured yet." />
        ) : null}
      </div>
    </section>
  );
}

function SqlMemoryValueProfilesSection({
  memory,
  valueProfilesInScopeCount,
}: {
  memory: SqlWorkbenchMemoryState;
  valueProfilesInScopeCount: number;
}) {
  return (
    <section className="space-y-2">
      <SqlMemorySectionHeader
        title="Value grounding"
        description="Safe column-shape summaries derived from result batches. Raw row values are not stored."
        countLabel={`${valueProfilesInScopeCount} in scope`}
      />
      <div className="space-y-2">
        {memory.valueProfiles.slice(0, 16).map((entry) => (
          <div
            key={entry.key}
            className="rounded-sm border border-border bg-background px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {entry.relation}.{entry.column}
              </span>
              <SqlMemoryCountBadge>{entry.sampleCount} samples</SqlMemoryCountBadge>
              {entry.nullCount > 0 ? (
                <SqlMemoryCountBadge>{entry.nullCount} null</SqlMemoryCountBadge>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.exampleHints.slice(0, 5).map((hint) => (
                <SqlMemoryCountBadge key={`${entry.key}:${hint}`}>
                  {hint}
                </SqlMemoryCountBadge>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {entry.schema}
            </div>
          </div>
        ))}
        {memory.valueProfiles.length === 0 ? (
          <SqlMemoryEmptyState message="No value-shape grounding has been captured yet." />
        ) : null}
      </div>
    </section>
  );
}

function SqlMemoryRetentionPanel({
  memory,
  onRetentionChange,
  onClearCategory,
  onClearCurrentSchema,
}: {
  memory: SqlWorkbenchMemoryState;
  onRetentionChange: (
    key: keyof SqlMemoryRetentionSettings,
    checked: boolean,
  ) => void;
  onClearCategory: (category: MemoryCategory) => void;
  onClearCurrentSchema: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col bg-muted/20">
      <div className="border-b border-border px-4 py-4">
        <h3 className="text-sm font-semibold">Retention controls</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Capture can be paused per category. Existing memory remains active
          until cleared.
        </p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <SqlMemoryRetentionToggle
          title="Accepted suggestions"
          description="Track which completion items operators intentionally accept."
          checked={memory.retention.trackAcceptedSuggestions}
          onCheckedChange={(checked) =>
            onRetentionChange("trackAcceptedSuggestions", checked)
          }
        />
        <SqlMemoryRetentionToggle
          title="Query patterns"
          description="Store normalized statement patterns and grounded relation usage from successful runs."
          checked={memory.retention.trackQueryPatterns}
          onCheckedChange={(checked) =>
            onRetentionChange("trackQueryPatterns", checked)
          }
        />
        <SqlMemoryRetentionToggle
          title="Value grounding"
          description="Persist only safe value-shape summaries such as uuid-like, email-like, timestamp-like, or numeric."
          checked={memory.retention.captureValueProfiles}
          onCheckedChange={(checked) =>
            onRetentionChange("captureValueProfiles", checked)
          }
        />

        <div className="rounded-sm border border-border bg-background p-3">
          <div className="text-sm font-medium">Clear memory</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Remove memory globally or just for the current schema scope.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onClearCurrentSchema}
            >
              Clear current schema
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onClearCategory("acceptedSuggestions")}
            >
              Clear suggestions
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onClearCategory("queryPatterns")}
            >
              Clear patterns
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onClearCategory("valueProfiles")}
            >
              Clear values
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SqlMemoryRetentionToggle({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {description}
          </div>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

function SqlMemorySectionHeader({
  title,
  description,
  countLabel,
}: {
  title: string;
  description: string;
  countLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <SqlMemoryCountBadge>{countLabel}</SqlMemoryCountBadge>
    </div>
  );
}

function SqlMemoryCountBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
      {children}
    </Badge>
  );
}

function SqlMemoryEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
      {message}
    </div>
  );
}
