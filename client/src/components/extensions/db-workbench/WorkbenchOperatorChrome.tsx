import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DbConnectionConfig, DdlSettings } from "@shared/schema";

export interface WorkbenchOperatorChromeProps {
  connection: DbConnectionConfig;
  runtimeSchema: string | null;
  driverLabel: string;
  workbenchContextLabel: string;
  onManageConnections: () => void;
}

export interface WorkbenchSqlToolStripProps {
  connectionLabel: string;
  savedSnippetCount: number;
  queryHistoryCount: number;
  recentQueryCount: number;
  sqlMemoryPatternCount: number;
  sqlMemoryGroundedCount: number;
  sqlCopilotProvider: DdlSettings["sqlCopilotProvider"];
  sqlCopilotEnabled: boolean;
  onOpenSqlLibrary: () => void;
  onSaveSnippet: () => void;
  onOpenSqlMemory: () => void;
  onOpenSqlCopilot: () => void;
}

function WorkbenchEnvironmentBand({
  connection,
}: {
  connection: DbConnectionConfig;
}) {
  const env = connection.environment;
  if (!env) return null;

  const envConfig: Record<
    string,
    { label: string; bgClass: string; fgClass: string }
  > = {
    prod: {
      label: "PRODUCTION",
      bgClass: "bg-[hsl(var(--env-prod))]",
      fgClass: "text-[hsl(var(--env-prod-fg))]",
    },
    test: {
      label: "TEST",
      bgClass: "bg-[hsl(var(--env-test))]",
      fgClass: "text-[hsl(var(--env-test-fg))]",
    },
    dev: {
      label: "DEV",
      bgClass: "bg-[hsl(var(--env-dev))]",
      fgClass: "text-[hsl(var(--env-dev-fg))]",
    },
  };

  const config = envConfig[env];
  if (!config) return null;

  return (
    <div
      className={cn(
        "flex h-[28px] w-full items-center justify-center gap-1.5 text-xs font-semibold",
        config.bgClass,
        config.fgClass,
      )}
    >
      <span>{config.label}</span>
      {connection.readonly && (
        <>
          <Lock className="h-3 w-3" />
          <span>READ-ONLY</span>
        </>
      )}
    </div>
  );
}

export function WorkbenchOperatorChrome({
  connection,
  runtimeSchema,
  driverLabel,
  workbenchContextLabel,
  onManageConnections,
}: WorkbenchOperatorChromeProps) {
  return (
    <>
      <WorkbenchEnvironmentBand connection={connection} />

      <div className="shrink-0 border-b border-border bg-panel-muted/40 px-3 py-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Primary DB workspace
        </p>
      </div>

      <div className="shrink-0 border-b border-border bg-background px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-xs font-semibold text-foreground">
                {connection.name || connection.database}
              </p>
              <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                {driverLabel}
              </Badge>
              {connection.environment ? (
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  {connection.environment}
                </Badge>
              ) : null}
              {connection.readonly ? (
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  readonly
                </Badge>
              ) : null}
              {runtimeSchema ? (
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                  schema:{runtimeSchema}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {workbenchContextLabel}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 text-xs"
            onClick={onManageConnections}
          >
            Connection Center
          </Button>
        </div>
      </div>
    </>
  );
}

export function WorkbenchSqlToolStrip({
  connectionLabel,
  savedSnippetCount,
  queryHistoryCount,
  recentQueryCount,
  sqlMemoryPatternCount,
  sqlMemoryGroundedCount,
  sqlCopilotProvider,
  sqlCopilotEnabled,
  onOpenSqlLibrary,
  onSaveSnippet,
  onOpenSqlMemory,
  onOpenSqlCopilot,
}: WorkbenchSqlToolStripProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel-muted/70 px-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onOpenSqlLibrary}
      >
        SQL library
      </Button>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 text-xs"
        onClick={onSaveSnippet}
      >
        Save snippet
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onOpenSqlMemory}
      >
        SQL memory
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onOpenSqlCopilot}
      >
        SQL copilot
      </Button>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          {savedSnippetCount} snippet{savedSnippetCount === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          {queryHistoryCount} history
        </Badge>
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          {recentQueryCount} recent
        </Badge>
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          {sqlMemoryPatternCount} patterns
        </Badge>
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          {sqlMemoryGroundedCount} grounded
        </Badge>
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          {sqlCopilotProvider}
          {sqlCopilotEnabled ? "" : " disabled"}
        </Badge>
        <span className="truncate">
          {connectionLabel}: connection-scoped tabs, drafts, history, snippets,
          SQL memory, and local copilot prompt grounding. Preview before
          replacing the active tab or opening a new one.
        </span>
      </div>
    </div>
  );
}
