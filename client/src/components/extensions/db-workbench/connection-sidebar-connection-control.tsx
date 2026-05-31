import {
  ChevronDown,
  Lock,
  Star,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  DbConnectionConfig,
  DbEnvironment,
} from "@shared/schema";

const ENV_DOT_CLASS: Record<DbEnvironment, string> = {
  prod: "bg-[hsl(var(--env-prod))]",
  test: "bg-[hsl(var(--env-test))]",
  dev: "bg-[hsl(var(--env-dev))]",
};

const ENV_TEXT_CLASS: Record<DbEnvironment, string> = {
  prod: "text-[hsl(var(--env-prod))]",
  test: "text-[hsl(var(--env-test))]",
  dev: "text-[hsl(var(--env-dev))]",
};

const DRIVER_LABEL: Record<string, string> = {
  mysql: "MySQL",
  postgres: "PostgreSQL",
};

function EnvDot({
  environment,
}: {
  environment: DbEnvironment | undefined;
}) {
  if (!environment) return null;

  return (
    <div
      className={cn("h-2 w-2 shrink-0 rounded-full", ENV_DOT_CLASS[environment])}
      aria-label={`Environment: ${environment}`}
    />
  );
}

interface ConnectionSidebarConnectionControlProps {
  connection: DbConnectionConfig;
  connections: DbConnectionConfig[];
  onSwitchConnection: (id: string) => void;
  switchOpen: boolean;
  onSwitchOpenChange: (open: boolean) => void;
  isPostgres: boolean;
  activeSchema: string;
  schemaSelectOptions: string[];
  isSchemaListLoading: boolean;
  onSchemaChange?: (schema: string) => void;
  hasExplorerData: boolean;
  filteredSummary: string;
  connectionStateLabel: string;
  connectionStateClass: string;
}

export function ConnectionSidebarConnectionControl({
  connection,
  connections,
  onSwitchConnection,
  switchOpen,
  onSwitchOpenChange,
  isPostgres,
  activeSchema,
  schemaSelectOptions,
  isSchemaListLoading,
  onSchemaChange,
  hasExplorerData,
  filteredSummary,
  connectionStateLabel,
  connectionStateClass,
}: ConnectionSidebarConnectionControlProps) {
  const env = connection.environment;
  const driverLabel = DRIVER_LABEL[connection.driver] ?? connection.driver;

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <EnvDot environment={env} />
          <span className="max-w-[156px] truncate text-[13px] font-semibold text-sidebar-foreground">
            {connection.name || connection.database}
          </span>
          {connection.favorite ? (
            <Star
              size={12}
              className="shrink-0 fill-amber-400 text-amber-500"
              aria-label="Favorite connection"
            />
          ) : null}
          {connection.readonly ? (
            <Lock
              size={12}
              className="shrink-0 text-muted-foreground"
              aria-label="Read-only connection"
            />
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {env ? (
            <span
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.08em]",
                ENV_TEXT_CLASS[env],
              )}
            >
              {env}
            </span>
          ) : null}
          <span className="text-[11px] text-muted-foreground">{driverLabel}</span>
        </div>

        <span className="truncate text-[11px] text-muted-foreground">
          {connection.database}
        </span>

        {connection.groupName ? (
          <span className="truncate text-[11px] text-muted-foreground">
            Group · {connection.groupName}
          </span>
        ) : null}

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.08em]",
              connectionStateClass,
            )}
          >
            {connectionStateLabel}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {hasExplorerData ? filteredSummary : "schema pending"}
          </span>
        </div>
      </div>

      <Separator />

      <button
        type="button"
        className="flex items-center gap-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => onSwitchOpenChange(!switchOpen)}
        aria-expanded={switchOpen}
      >
        <span>Switch connection</span>
        <ChevronDown
          size={12}
          className={cn("transition-transform", switchOpen && "rotate-180")}
        />
      </button>

      {switchOpen ? (
        <ScrollArea className="max-h-[200px] rounded-md border border-border bg-background">
          <div className="flex flex-col py-1">
            {connections.map((conn) => (
              <button
                key={conn.id}
                type="button"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-muted",
                  conn.id === connection.id && "bg-muted font-semibold",
                )}
                onClick={() => {
                  onSwitchConnection(conn.id);
                  onSwitchOpenChange(false);
                }}
              >
                <EnvDot environment={conn.environment} />
                {conn.favorite ? (
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />
                ) : null}
                <span className="flex-1 truncate">{conn.name || conn.database}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {DRIVER_LABEL[conn.driver] ?? conn.driver}
                </span>
              </button>
            ))}
            {connections.length === 0 ? (
              <span className="px-2.5 py-2 text-[11px] text-muted-foreground">
                No connections saved
              </span>
            ) : null}
          </div>
        </ScrollArea>
      ) : null}

      <Separator />

      {isPostgres ? (
        <>
          <div className="flex items-center gap-2 px-1">
            <label
              htmlFor={`schema-select-${connection.id}`}
              className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            >
              Schema
            </label>
            <select
              id={`schema-select-${connection.id}`}
              value={activeSchema}
              className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-0 text-xs"
              disabled={isSchemaListLoading}
              onChange={(event) => onSchemaChange?.(event.target.value)}
            >
              {schemaSelectOptions.map((schemaName) => (
                <option key={schemaName} value={schemaName}>
                  {schemaName}
                </option>
              ))}
            </select>
          </div>
          <Separator />
        </>
      ) : null}
    </>
  );
}
