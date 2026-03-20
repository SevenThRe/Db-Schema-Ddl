import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { normalizeElectronBoundaryErrorMessage } from "@shared/desktop-runtime";
import type {
  ExtensionCatalogRelease,
  ExtensionHostState,
  ExtensionId,
  ExtensionLifecycleState,
} from "@shared/schema";
import { parseApiErrorResponse } from "@/lib/api-error";
import { desktopBridge } from "@/lib/desktop-bridge";

type RequestFailureFallback = {
  code: "REQUEST_FAILED";
  message: string;
};

const ACTIVE_LIFECYCLE_STAGES = new Set<ExtensionLifecycleState["stage"]>([
  "checking",
  "downloading",
  "verifying",
  "installing",
  "uninstalling",
]);

async function fetchResponse(
  input: RequestInfo | URL,
  fallback: RequestFailureFallback,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok) {
    throw await parseApiErrorResponse(res, fallback);
  }
  return res;
}

async function fetchJson<T>(
  input: RequestInfo | URL,
  fallback: RequestFailureFallback,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchResponse(input, fallback, init);
  return (await res.json()) as T;
}

function extensionQueryKey(extensionId?: ExtensionId) {
  return extensionId ? [api.extensions.get.path, extensionId] : [api.extensions.list.path];
}

function normalizeElectronExtensionError(error: unknown, fallbackMessage: string): Error {
  return new Error(normalizeElectronBoundaryErrorMessage(error, fallbackMessage));
}

function shouldPollLifecycle(extension?: ExtensionHostState | null): boolean {
  return extension?.lifecycle ? ACTIVE_LIFECYCLE_STAGES.has(extension.lifecycle.stage) : false;
}

async function callElectronExtension<T>(
  action: (api: NonNullable<Window["electronAPI"]>["extensions"]) => Promise<T>,
  fallbackMessage: string,
): Promise<T> {
  if (!window.electronAPI?.extensions) {
    throw new Error(fallbackMessage);
  }
  try {
    return await action(window.electronAPI.extensions);
  } catch (error) {
    throw normalizeElectronExtensionError(error, fallbackMessage);
  }
}

export function useExtensions() {
  const capabilities = desktopBridge.getCapabilities();
  return useQuery({
    queryKey: [api.extensions.list.path],
    queryFn: async () => {
      if (!capabilities.features.extensions) {
        return [] as ExtensionHostState[];
      }
      const data = await fetchJson(api.extensions.list.path, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch extensions",
      });
      return api.extensions.list.responses[200].parse(data);
    },
    enabled: capabilities.features.extensions,
    refetchInterval: (query) => {
      const extensions = query.state.data as ExtensionHostState[] | undefined;
      return extensions?.some((extension) => shouldPollLifecycle(extension)) ? 1000 : false;
    },
  });
}

export function useExtension(extensionId: ExtensionId) {
  const capabilities = desktopBridge.getCapabilities();
  return useQuery({
    queryKey: extensionQueryKey(extensionId),
    queryFn: async () => {
      if (!capabilities.features.extensions) {
        return null;
      }
      const url = buildUrl(api.extensions.get.path, { id: extensionId });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch extension",
      });
      return api.extensions.get.responses[200].parse(data);
    },
    enabled: capabilities.features.extensions,
    refetchInterval: (query) => {
      const extension = query.state.data as ExtensionHostState | undefined;
      return shouldPollLifecycle(extension) ? 1000 : false;
    },
  });
}

export function useExtensionCatalog(extensionId: ExtensionId) {
  const capabilities = desktopBridge.getCapabilities();
  return useQuery({
    queryKey: [api.extensions.catalog.path, extensionId],
    queryFn: async () => {
      if (!capabilities.features.extensions) {
        return null;
      }
      const url = buildUrl(api.extensions.catalog.path, { id: extensionId });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch extension catalog",
      });
      return api.extensions.catalog.responses[200].parse(data);
    },
    enabled: capabilities.features.extensions,
  });
}

export function useExtensionLifecycle(extensionId: ExtensionId) {
  const capabilities = desktopBridge.getCapabilities();
  return useQuery({
    queryKey: [api.extensions.lifecycle.path, extensionId],
    queryFn: async () => {
      if (!capabilities.features.extensions) {
        return null;
      }
      const url = buildUrl(api.extensions.lifecycle.path, { id: extensionId });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch extension lifecycle state",
      });
      return api.extensions.lifecycle.responses[200].parse(data);
    },
    enabled: capabilities.features.extensions,
    refetchInterval: (query) => {
      const lifecycle = query.state.data as ExtensionLifecycleState | null | undefined;
      return lifecycle && ACTIVE_LIFECYCLE_STAGES.has(lifecycle.stage) ? 1000 : false;
    },
  });
}

function invalidateExtensionQueries(queryClient: ReturnType<typeof useQueryClient>, extensionId: ExtensionId) {
  void queryClient.invalidateQueries({ queryKey: [api.extensions.list.path] });
  void queryClient.invalidateQueries({ queryKey: extensionQueryKey(extensionId) });
  void queryClient.invalidateQueries({ queryKey: [api.extensions.catalog.path, extensionId] });
  void queryClient.invalidateQueries({ queryKey: [api.extensions.lifecycle.path, extensionId] });
}

function createToggleMutation(targetEnabled: boolean) {
  return function useToggleInstalledExtension() {
    const queryClient = useQueryClient();
    const route = targetEnabled ? api.extensions.enable : api.extensions.disable;

    return useMutation({
      mutationFn: async (extensionId: ExtensionId) => {
        const url = buildUrl(route.path, { id: extensionId });
        const data = await fetchJson<ExtensionHostState>(
          url,
          {
            code: "REQUEST_FAILED",
            message: targetEnabled ? "Failed to enable extension" : "Failed to disable extension",
          },
          {
            method: route.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ extensionId, action: targetEnabled ? "enable" : "disable" }),
          },
        );
        return route.responses[200].parse(data);
      },
      onSuccess: (extension, extensionId) => {
        void queryClient.setQueryData(extensionQueryKey(extension.extensionId), extension);
        invalidateExtensionQueries(queryClient, extensionId);
      },
    });
  };
}

export const useEnableExtension = createToggleMutation(true);
export const useDisableExtension = createToggleMutation(false);

export function useRefreshExtensionCatalog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (extensionId: ExtensionId) => {
      return await callElectronExtension<ExtensionCatalogRelease | null>(
        (electronExtensions) => electronExtensions.getCatalog(extensionId, true),
        "当前环境暂不支持检查扩展更新。",
      );
    },
    onSuccess: (_result, extensionId) => {
      invalidateExtensionQueries(queryClient, extensionId);
    },
  });
}

export function useStartExtensionInstall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (extensionId: ExtensionId) => {
      return await callElectronExtension<ExtensionLifecycleState | null>(
        (electronExtensions) => electronExtensions.startInstall(extensionId),
        "当前环境暂不支持下载官方扩展。",
      );
    },
    onSuccess: (_result, extensionId) => {
      invalidateExtensionQueries(queryClient, extensionId);
    },
  });
}

export function useUninstallExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (extensionId: ExtensionId) => {
      return await callElectronExtension<ExtensionLifecycleState | null>(
        (electronExtensions) => electronExtensions.uninstall(extensionId),
        "当前环境暂不支持卸载官方扩展。",
      );
    },
    onSuccess: (_result, extensionId) => {
      invalidateExtensionQueries(queryClient, extensionId);
    },
  });
}
