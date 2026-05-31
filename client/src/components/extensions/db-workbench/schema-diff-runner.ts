import type { Dispatch, SetStateAction } from "react";
import type {
  DbSchemaDiffResult,
  DbSchemaSnapshot,
} from "@shared/schema";
import {
  createEmptySchemaDiffState,
  createSchemaDiffFailureState,
  createSchemaDiffSuccessState,
  type SchemaDiffNotice,
  type SchemaDiffWorkspaceState,
} from "./schema-diff-runtime";

export interface RunSchemaDiffPreviewInput {
  sourceConnectionId: string;
  targetConnectionId: string | null | undefined;
  introspect: (connectionId: string) => Promise<DbSchemaSnapshot>;
  diff: (
    sourceConnectionId: string,
    targetConnectionId: string,
  ) => Promise<DbSchemaDiffResult>;
  setResultTab: () => void;
  beginCompare: () => void;
  applyState: (state: SchemaDiffWorkspaceState) => void;
  showNotification: (notice: SchemaDiffNotice) => void;
  finishCompare: () => void;
}

export interface SchemaDiffStateActions {
  setResultTab: () => void;
  setTargetConnectionId: (connectionId: string) => void;
  applyTargetConnectionId: Dispatch<SetStateAction<string>>;
  beginCompare: () => void;
  applyState: (state: SchemaDiffWorkspaceState) => void;
  resetState: () => void;
  finishCompare: () => void;
}

export function createSchemaDiffStateActions(input: {
  setResultTab: () => void;
  setSchemaDiffTargetConnectionId: Dispatch<SetStateAction<string>>;
  setIsSchemaDiffing: (isDiffing: boolean) => void;
  setSchemaDiffState: (state: SchemaDiffWorkspaceState) => void;
}): SchemaDiffStateActions {
  return {
    setResultTab: input.setResultTab,
    setTargetConnectionId: input.setSchemaDiffTargetConnectionId,
    applyTargetConnectionId: input.setSchemaDiffTargetConnectionId,
    beginCompare: () => input.setIsSchemaDiffing(true),
    applyState: input.setSchemaDiffState,
    resetState: () => input.setSchemaDiffState(createEmptySchemaDiffState()),
    finishCompare: () => input.setIsSchemaDiffing(false),
  };
}

export type SchemaDiffPreviewResult = {
  sourceSnapshot: DbSchemaSnapshot;
  targetSnapshot: DbSchemaSnapshot;
  result: DbSchemaDiffResult;
};

export async function runSchemaDiffPreview(
  input: RunSchemaDiffPreviewInput,
): Promise<SchemaDiffPreviewResult | null> {
  if (!input.targetConnectionId) {
    input.applyState(
      createEmptySchemaDiffState("Select a target connection before compare."),
    );
    return null;
  }

  input.beginCompare();
  input.applyState(createEmptySchemaDiffState());
  input.setResultTab();

  try {
    const [sourceSnapshot, targetSnapshot, result] = await Promise.all([
      input.introspect(input.sourceConnectionId),
      input.introspect(input.targetConnectionId),
      input.diff(input.sourceConnectionId, input.targetConnectionId),
    ]);
    input.applyState(
      createSchemaDiffSuccessState({
        sourceSnapshot,
        targetSnapshot,
        result,
      }),
    );
    return { sourceSnapshot, targetSnapshot, result };
  } catch (error) {
    const failure = createSchemaDiffFailureState(error);
    input.applyState(failure.state);
    input.showNotification(failure.notice);
    return null;
  } finally {
    input.finishCompare();
  }
}
