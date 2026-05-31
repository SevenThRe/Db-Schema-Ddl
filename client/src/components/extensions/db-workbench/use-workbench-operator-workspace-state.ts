import { useMemo, useRef, useState } from "react";
import { createDefaultDdlSettings } from "@shared/config";
import type {
  DbConnectionConfig,
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridEditSource,
  DbGridInsertedRowDraft,
  DbGridPrepareCommitResponse,
} from "@shared/schema";
import {
  createEmptyObjectInspectionState,
} from "./object-inspection-runtime";
import type { WorkbenchInspectionTarget } from "./workbench-session";
import type { HydratedConnectionSession } from "./workbench-session-hydration";
import {
  resolveRestoredActiveSchema,
} from "./workbench-session-runtime";

export function useWorkbenchOperatorWorkspaceState(input: {
  connection: DbConnectionConfig;
  initialSession: HydratedConnectionSession;
}) {
  const [inspectionState, setInspectionState] =
    useState(createEmptyObjectInspectionState);
  const [isInspectingObject, setIsInspectingObject] = useState(false);
  const objectInspection = inspectionState.inspection;
  const inspectError = inspectionState.error;

  const [pendingEditCells, setPendingEditCells] =
    useState<Record<string, DbGridEditPatchCell>>({});
  const [pendingDeleteRows, setPendingDeleteRows] =
    useState<Record<string, DbGridDeleteRowDraft>>({});
  const [pendingInsertedRows, setPendingInsertedRows] =
    useState<Record<string, DbGridInsertedRowDraft>>({});
  const [preparedGridPlan, setPreparedGridPlan] =
    useState<DbGridPrepareCommitResponse | null>(null);
  const [isPreparingGridCommit, setIsPreparingGridCommit] = useState(false);
  const [isCommittingGridEdit, setIsCommittingGridEdit] = useState(false);

  const [activeSchema, setActiveSchema] = useState<string>(() =>
    resolveRestoredActiveSchema({
      driver: input.connection.driver,
      restoredActiveSchema: input.initialSession.activeSchema,
      defaultSchema: input.connection.defaultSchema,
    }),
  );
  const [restoredInspectionTarget, setRestoredInspectionTarget] =
    useState<WorkbenchInspectionTarget | null>(
      input.initialSession.inspectionTarget,
    );
  const [lastGridEditSource, setLastGridEditSource] =
    useState<DbGridEditSource | null>(null);

  const defaultDdlSettings = useMemo(() => createDefaultDdlSettings(), []);
  const runtimeSchema =
    input.connection.driver === "postgres" ? activeSchema : undefined;

  const activeQueryRequestIdRef = useRef<string | null>(null);
  const activeExportRequestIdRef = useRef<string | null>(null);
  const liveVerificationRunKeyRef = useRef<string | null>(null);

  return {
    activeExportRequestIdRef,
    activeQueryRequestIdRef,
    activeSchema,
    defaultDdlSettings,
    inspectError,
    inspectionState,
    isCommittingGridEdit,
    isInspectingObject,
    isPreparingGridCommit,
    lastGridEditSource,
    liveVerificationRunKeyRef,
    objectInspection,
    pendingDeleteRows,
    pendingEditCells,
    pendingInsertedRows,
    preparedGridPlan,
    restoredInspectionTarget,
    runtimeSchema,
    setActiveSchema,
    setInspectionState,
    setIsCommittingGridEdit,
    setIsInspectingObject,
    setIsPreparingGridCommit,
    setLastGridEditSource,
    setPendingDeleteRows,
    setPendingEditCells,
    setPendingInsertedRows,
    setPreparedGridPlan,
    setRestoredInspectionTarget,
  };
}
