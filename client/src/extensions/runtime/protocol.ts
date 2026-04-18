import type { ResolvedExtension } from "@shared/extension-schema";

export const EXTENSION_RUNTIME_HOST_SOURCE = "dbtools-extension-host";
export const EXTENSION_RUNTIME_CLIENT_SOURCE = "dbtools-extension-runtime";

export interface RuntimeInitPayload {
  extension: ResolvedExtension;
  runtimeViewId: string;
  surfaceId: string;
  surfaceKind: "sidebar" | "workbench";
}

export interface RuntimeReadyMessage {
  source: typeof EXTENSION_RUNTIME_CLIENT_SOURCE;
  type: "ready";
}

export interface RuntimeHostCallMessage {
  source: typeof EXTENSION_RUNTIME_CLIENT_SOURCE;
  type: "host-call";
  id: string;
  method: string;
  args: unknown[];
}

export interface RuntimeNavigationMessage {
  source: typeof EXTENSION_RUNTIME_CLIENT_SOURCE;
  type: "navigation";
  action: "openWorkbenchView" | "selectSidebarView";
  workbenchViewId?: string;
  sidebarViewId?: string;
}

export interface HostInitMessage {
  source: typeof EXTENSION_RUNTIME_HOST_SOURCE;
  type: "init";
  payload: RuntimeInitPayload;
}

export interface HostCallResultMessage {
  source: typeof EXTENSION_RUNTIME_HOST_SOURCE;
  type: "host-call-result";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type RuntimeToHostMessage =
  | RuntimeReadyMessage
  | RuntimeHostCallMessage
  | RuntimeNavigationMessage;

export type HostToRuntimeMessage = HostInitMessage | HostCallResultMessage;
