import { cn } from "@/lib/utils";
import { ExplorerBadge } from "./connection-sidebar-explorer-badge";
import type {
  DbObjectKind,
  DbRoutineSchema,
  DbSequenceSchema,
  DbTriggerSchema,
  DbViewSchema,
} from "@shared/schema";

type InspectObjectHandler = (
  objectKind: DbObjectKind,
  objectName: string,
  options?: {
    signature?: string | null;
    parentObjectName?: string | null;
  },
) => void;

export interface ConnectionSidebarObjectFamilyListsProps {
  normalizedObjectFilter: string;
  visibleViews: DbViewSchema[];
  visibleRoutines: DbRoutineSchema[];
  visibleTriggers: DbTriggerSchema[];
  visibleSequences: DbSequenceSchema[];
  inspectedObjectKind?: DbObjectKind | null;
  inspectedObjectName?: string | null;
  inspectedObjectSignature?: string | null;
  inspectedParentObjectName?: string | null;
  onInspectObject?: InspectObjectHandler;
}

export function ConnectionSidebarObjectFamilyLists({
  normalizedObjectFilter,
  visibleViews,
  visibleRoutines,
  visibleTriggers,
  visibleSequences,
  inspectedObjectKind,
  inspectedObjectName,
  inspectedObjectSignature,
  inspectedParentObjectName,
  onInspectObject,
}: ConnectionSidebarObjectFamilyListsProps) {
  return (
    <>
      <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Views
      </div>
      {visibleViews.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
          {normalizedObjectFilter ? "No views match the filter" : "No views"}
        </div>
      ) : (
        <div className="px-1 pb-1">
          {visibleViews.map((view) => (
            <button
              key={view.name}
              type="button"
              className={cn(
                "w-full rounded-sm px-2 py-2 text-left text-[11px] hover:bg-muted/50",
                inspectedObjectKind === "view" &&
                  inspectedObjectName === view.name &&
                  "bg-muted font-medium",
              )}
              onClick={() => onInspectObject?.("view", view.name)}
              title={`Inspect ${view.name}`}
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                  {view.name}
                </div>
                <ExplorerBadge tone="success" className="shrink-0">
                  DDL
                </ExplorerBadge>
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {view.columns.length} columns
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Routines
      </div>
      {visibleRoutines.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
          {normalizedObjectFilter ? "No routines match the filter" : "No routines"}
        </div>
      ) : (
        <div className="px-1 pb-1">
          {visibleRoutines.map((routine) => {
            const routineObjectName = routine.signature
              ? `${routine.name}(${routine.signature})`
              : routine.name;
            const isRoutineInspected =
              inspectedObjectKind === routine.kind &&
              inspectedObjectName === routine.name &&
              (inspectedObjectSignature?.trim() ?? "") ===
                (routine.signature?.trim() ?? "");
            return (
              <button
                key={`${routine.kind}:${routineObjectName}`}
                type="button"
                className={cn(
                  "w-full rounded-sm px-2 py-2 text-left text-[11px] hover:bg-muted/50",
                  isRoutineInspected && "bg-muted font-medium",
                )}
                onClick={() =>
                  onInspectObject?.(routine.kind, routine.name, {
                    signature: routine.signature ?? null,
                  })
                }
                title={`Inspect ${routineObjectName}`}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                    {routine.name}
                  </div>
                  <ExplorerBadge tone="warning" className="shrink-0">
                    {routine.kind}
                  </ExplorerBadge>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {routine.signature ?? "signature unavailable"}
                  {routine.returnType ? ` -> ${routine.returnType}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Triggers
      </div>
      {visibleTriggers.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
          {normalizedObjectFilter ? "No triggers match the filter" : "No triggers"}
        </div>
      ) : (
        <div className="px-1 pb-1">
          {visibleTriggers.map((trigger) => {
            const isTriggerInspected =
              inspectedObjectKind === "trigger" &&
              inspectedObjectName === trigger.name &&
              (inspectedParentObjectName ?? "") === trigger.tableName;
            return (
              <button
                key={`${trigger.tableName}:${trigger.name}`}
                type="button"
                className={cn(
                  "w-full rounded-sm px-2 py-2 text-left text-[11px] hover:bg-muted/50",
                  isTriggerInspected && "bg-muted font-medium",
                )}
                onClick={() =>
                  onInspectObject?.("trigger", trigger.name, {
                    parentObjectName: trigger.tableName,
                  })
                }
                title={`Inspect ${trigger.name}`}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                    {trigger.name}
                  </div>
                  <ExplorerBadge tone="warning" className="shrink-0">
                    trigger
                  </ExplorerBadge>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {trigger.tableName} · {trigger.timing ?? "TIMING?"} · {trigger.event}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Sequences
      </div>
      {visibleSequences.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
          {normalizedObjectFilter ? "No sequences match the filter" : "No sequences"}
        </div>
      ) : (
        <div className="px-1 pb-1">
          {visibleSequences.map((sequence) => (
            <button
              key={sequence.name}
              type="button"
              className={cn(
                "w-full rounded-sm px-2 py-2 text-left text-[11px] hover:bg-muted/50",
                inspectedObjectKind === "sequence" &&
                  inspectedObjectName === sequence.name &&
                  "bg-muted font-medium",
              )}
              onClick={() => onInspectObject?.("sequence", sequence.name)}
              title={`Inspect ${sequence.name}`}
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                  {sequence.name}
                </div>
                <ExplorerBadge tone="warning" className="shrink-0">
                  sequence
                </ExplorerBadge>
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {sequence.comment ?? "Sequence DDL available via inspection pane"}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
