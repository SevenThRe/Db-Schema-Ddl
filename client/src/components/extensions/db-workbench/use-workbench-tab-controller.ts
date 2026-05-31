import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { QueryTab } from "./query-tabs-storage";
import {
  createWorkbenchTabController,
  type WorkbenchTabController,
} from "./workbench-tab-controller";

export interface UseWorkbenchTabControllerInput {
  activeTabId: string;
  connectionId: string;
  setActiveTabId: (tabId: string) => void;
  setTabs: Dispatch<SetStateAction<QueryTab[]>>;
}

export function useWorkbenchTabController(
  input: UseWorkbenchTabControllerInput,
): WorkbenchTabController {
  return useMemo(
    () =>
      createWorkbenchTabController({
        activeTabId: input.activeTabId,
        connectionId: input.connectionId,
        setActiveTabId: input.setActiveTabId,
        setTabs: input.setTabs,
      }),
    [
      input.activeTabId,
      input.connectionId,
      input.setActiveTabId,
      input.setTabs,
    ],
  );
}
