import { useEffect, useMemo, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AlertCircle, Blocks, PackageX } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDesktopCapabilities } from "@/lib/desktop-capabilities";
import type { ResolvedExtension } from "@shared/extension-schema";
import { useHostApiFor } from "./host-context";
import { dispatchRuntimeHostCall } from "./runtime/host-dispatch";
import type {
  HostCallResultMessage,
  HostInitMessage,
  RuntimeHostCallMessage,
  RuntimeNavigationMessage,
  RuntimeReadyMessage,
} from "./runtime/protocol";
import {
  EXTENSION_RUNTIME_CLIENT_SOURCE,
  EXTENSION_RUNTIME_HOST_SOURCE,
} from "./runtime/protocol";

interface ExtensionRuntimeFrameProps {
  extension: ResolvedExtension;
  runtimeViewId: string;
  surfaceId: string;
  surfaceKind: "sidebar" | "workbench";
  title: string;
  className?: string;
  onOpenWorkbenchView?: (workbenchViewId?: string) => void;
  onSelectSidebarView?: (sidebarViewId: string) => void;
}

function surfaceStatusCopy(status: NonNullable<ResolvedExtension["uiMount"]>["status"]): string {
  switch (status) {
    case "missing":
      return "The installed UI bundle entry for this extension could not be found on disk.";
    case "invalid":
      return "This extension declared runtime UI, but its bundle metadata is incomplete or invalid.";
    case "incompatible":
      return "This extension UI bundle targets a different runtime API version and cannot be mounted yet.";
    case "ready":
      return "The extension bundle is ready to load.";
    default:
      return "The extension runtime bundle is not ready.";
  }
}

export function ExtensionRuntimeFrame({
  extension,
  runtimeViewId,
  surfaceId,
  surfaceKind,
  title,
  className,
  onOpenWorkbenchView,
  onSelectSidebarView,
}: ExtensionRuntimeFrameProps) {
  const runtime = getDesktopCapabilities().runtime;
  const uiMount = extension.uiMount;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hostApi = useHostApiFor(extension.manifest.id);

  const src = useMemo(() => {
    if (runtime !== "tauri" || !uiMount?.entryPath || uiMount.status !== "ready") {
      return null;
    }

    try {
      const url = new URL(convertFileSrc(uiMount.entryPath));
      url.searchParams.set("extensionId", extension.manifest.id);
      url.searchParams.set("surfaceKind", surfaceKind);
      url.searchParams.set("surfaceId", surfaceId);
      url.searchParams.set("runtimeViewId", runtimeViewId);
      return url.toString();
    } catch (error) {
      console.error("[ExtensionRuntimeFrame] Failed to build runtime bundle URL", error);
      return null;
    }
  }, [extension.manifest.id, runtime, runtimeViewId, surfaceId, surfaceKind, uiMount?.entryPath, uiMount?.status]);

  useEffect(() => {
    if (!src) {
      return;
    }

    const postToRuntime = (message: HostInitMessage | HostCallResultMessage) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow) {
        return;
      }
      frameWindow.postMessage(message, "*");
    };

    const sendInit = () => {
      const initMessage: HostInitMessage = {
        source: EXTENSION_RUNTIME_HOST_SOURCE,
        type: "init",
        payload: {
          extension,
          runtimeViewId,
          surfaceId,
          surfaceKind,
        },
      };
      postToRuntime(initMessage);
    };

    const handleMessage = (event: MessageEvent<RuntimeReadyMessage | RuntimeHostCallMessage | RuntimeNavigationMessage>) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== "object" || data.source !== EXTENSION_RUNTIME_CLIENT_SOURCE) {
        return;
      }

      if (data.type === "ready") {
        sendInit();
        return;
      }

      if (data.type === "navigation") {
        if (data.action === "openWorkbenchView") {
          onOpenWorkbenchView?.(data.workbenchViewId);
        }
        if (data.action === "selectSidebarView" && data.sidebarViewId) {
          onSelectSidebarView?.(data.sidebarViewId);
        }
        return;
      }

      if (data.type === "host-call") {
        void dispatchRuntimeHostCall(hostApi, data.method, data.args)
          .then((result) => {
            const message: HostCallResultMessage = {
              source: EXTENSION_RUNTIME_HOST_SOURCE,
              type: "host-call-result",
              id: data.id,
              ok: true,
              result,
            };
            postToRuntime(message);
          })
          .catch((error) => {
            const message: HostCallResultMessage = {
              source: EXTENSION_RUNTIME_HOST_SOURCE,
              type: "host-call-result",
              id: data.id,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            };
            postToRuntime(message);
          });
      }
    };

    window.addEventListener("message", handleMessage as EventListener);
    return () => {
      window.removeEventListener("message", handleMessage as EventListener);
    };
  }, [
    extension,
    hostApi,
    onOpenWorkbenchView,
    onSelectSidebarView,
    runtimeViewId,
    src,
    surfaceId,
    surfaceKind,
  ]);

  if (runtime !== "tauri") {
    return (
      <div className={cn("flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-200/80 bg-slate-50/70 p-6 text-center dark:border-slate-800 dark:bg-slate-950/60", className)}>
        <Blocks className="h-8 w-8 text-slate-400" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Runtime UI bundle mounting is only available inside the Tauri desktop shell.
          </p>
        </div>
      </div>
    );
  }

  if (!uiMount) {
    return (
      <div className={cn("flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-amber-200 bg-amber-50/80 p-6 text-center dark:border-amber-900/80 dark:bg-amber-950/40", className)}>
        <AlertCircle className="h-8 w-8 text-amber-500" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            This extension surface declared runtime UI, but no `uiBundle` was resolved for the installed extension.
          </p>
        </div>
      </div>
    );
  }

  if (uiMount.status !== "ready" || !src) {
    const message =
      uiMount.error ??
      (uiMount.status === "ready" && !src
        ? "The extension runtime bundle URL could not be constructed for this surface."
        : surfaceStatusCopy(uiMount.status));
    return (
      <div className={cn("flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-200/80 bg-slate-50/70 p-6 text-center dark:border-slate-800 dark:bg-slate-950/60", className)}>
        <PackageX className="h-8 w-8 text-slate-400" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full w-full overflow-hidden rounded-md border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950", className)}>
      <iframe
        ref={iframeRef}
        title={title}
        src={src}
        className="h-full w-full border-0 bg-white dark:bg-slate-950"
        sandbox="allow-scripts allow-forms"
        referrerPolicy="no-referrer"
        onLoad={() => {
          const frameWindow = iframeRef.current?.contentWindow;
          if (!frameWindow) {
            return;
          }
          const initMessage: HostInitMessage = {
            source: EXTENSION_RUNTIME_HOST_SOURCE,
            type: "init",
            payload: {
              extension,
              runtimeViewId,
              surfaceId,
              surfaceKind,
            },
          };
          frameWindow.postMessage(initMessage, "*");
        }}
      />
    </div>
  );
}
