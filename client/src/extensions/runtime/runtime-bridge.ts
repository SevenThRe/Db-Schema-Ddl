import type { HostToRuntimeMessage, RuntimeInitPayload, RuntimeNavigationMessage, RuntimeReadyMessage, RuntimeToHostMessage } from "./protocol";
import {
  EXTENSION_RUNTIME_CLIENT_SOURCE,
  EXTENSION_RUNTIME_HOST_SOURCE,
} from "./protocol";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface ExtensionRuntimeBridge {
  start(): void;
  dispose(): void;
  onInit(callback: (payload: RuntimeInitPayload) => void): () => void;
  requestHost<T>(method: string, ...args: unknown[]): Promise<T>;
  openWorkbenchView(workbenchViewId?: string): void;
  selectSidebarView(sidebarViewId: string): void;
}

export function createExtensionRuntimeBridge(hostWindow: Window = window): ExtensionRuntimeBridge {
  let sequence = 0;
  const pending = new Map<string, PendingRequest>();
  const initListeners = new Set<(payload: RuntimeInitPayload) => void>();

  const post = (message: RuntimeToHostMessage) => {
    if (hostWindow.parent === hostWindow) {
      return;
    }
    hostWindow.parent.postMessage(message, "*");
  };

  const handleMessage = (event: MessageEvent<HostToRuntimeMessage>) => {
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== EXTENSION_RUNTIME_HOST_SOURCE) {
      return;
    }

    if (data.type === "init") {
      initListeners.forEach((listener) => listener(data.payload));
      return;
    }

    if (data.type === "host-call-result") {
      const request = pending.get(data.id);
      if (!request) {
        return;
      }
      pending.delete(data.id);
      if (data.ok) {
        request.resolve(data.result);
      } else {
        request.reject(new Error(data.error ?? "Runtime host call failed"));
      }
    }
  };

  return {
    start() {
      hostWindow.addEventListener("message", handleMessage as EventListener);
      const readyMessage: RuntimeReadyMessage = {
        source: EXTENSION_RUNTIME_CLIENT_SOURCE,
        type: "ready",
      };
      post(readyMessage);
    },
    dispose() {
      hostWindow.removeEventListener("message", handleMessage as EventListener);
      pending.forEach(({ reject }) => reject(new Error("Runtime bridge disposed")));
      pending.clear();
      initListeners.clear();
    },
    onInit(callback) {
      initListeners.add(callback);
      return () => {
        initListeners.delete(callback);
      };
    },
    requestHost<T>(method: string, ...args: unknown[]) {
      const id = `runtime-call-${++sequence}`;
      const payload: RuntimeToHostMessage = {
        source: EXTENSION_RUNTIME_CLIENT_SOURCE,
        type: "host-call",
        id,
        method,
        args,
      };

      return new Promise<T>((resolve, reject) => {
        pending.set(id, {
          resolve: (value) => resolve(value as T),
          reject,
        });
        post(payload);
      });
    },
    openWorkbenchView(workbenchViewId) {
      const payload: RuntimeNavigationMessage = {
        source: EXTENSION_RUNTIME_CLIENT_SOURCE,
        type: "navigation",
        action: "openWorkbenchView",
        workbenchViewId,
      };
      post(payload);
    },
    selectSidebarView(sidebarViewId) {
      const payload: RuntimeNavigationMessage = {
        source: EXTENSION_RUNTIME_CLIENT_SOURCE,
        type: "navigation",
        action: "selectSidebarView",
        sidebarViewId,
      };
      post(payload);
    },
  };
}
