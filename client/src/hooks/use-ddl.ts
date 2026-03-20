import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import {
  type UploadedFile,
  type TableInfo,
  type GenerateDdlRequest,
  type DdlSettings,
  type WorkbookTemplateVariant,
  type CreateWorkbookFromTemplateRequest,
  type CreateWorkbookFromTemplateResponse,
  type DdlImportPreviewRequest,
  type DdlImportExportRequest,
  type ProcessingTaskResponse,
  type NameFixPreviewRequest,
  type NameFixApplyRequest,
  type NameFixRollbackRequest,
  type SchemaDiffPreviewRequest,
  type SchemaDiffConfirmRequest,
  type SchemaDiffAlterPreviewRequest,
} from "@shared/schema";
import { parseApiErrorResponse } from "@/lib/api-error";
import { desktopBridge } from "@/lib/desktop-bridge";

const TASK_POLL_INTERVAL_MS = 500;

type RequestFailureFallback = {
  code: "REQUEST_FAILED";
  message: string;
};

interface ProcessingTaskReference {
  taskId: string;
  processing: boolean;
}

function isProcessingTaskReference(value: unknown): value is ProcessingTaskReference {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ProcessingTaskReference>;
  return typeof candidate.taskId === "string" && candidate.processing === true;
}

function isTaskRunning(task: ProcessingTaskResponse | null | undefined): boolean {
  return Boolean(task && (task.status === "pending" || task.status === "processing"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function fetchTask(taskId: string): Promise<ProcessingTaskResponse> {
  const taskUrl = buildUrl(api.tasks.get.path, { id: taskId });
  const taskData = await fetchJson(taskUrl, {
    code: "REQUEST_FAILED",
    message: "Failed to fetch task",
  });
  return api.tasks.get.responses[200].parse(taskData);
}

function startTaskPolling(taskId: string, onCompleted: () => void): void {
  const pollTask = async () => {
    const task = await fetchTask(taskId);
    if (task.status === "completed") {
      onCompleted();
      return;
    }
    if (isTaskRunning(task)) {
      setTimeout(() => {
        void pollTask();
      }, TASK_POLL_INTERVAL_MS);
    }
  };

  void pollTask();
}

async function resolveDeferredTaskResult<T>(
  data: T | ProcessingTaskReference,
): Promise<T> {
  if (!isProcessingTaskReference(data)) {
    return data;
  }

  while (true) {
    const task = await fetchTask(data.taskId);
    if (task.status === "completed" && task.result) {
      return task.result as T;
    }
    if (task.status === "failed") {
      throw new Error(task.error || "Task failed");
    }
    await sleep(TASK_POLL_INTERVAL_MS);
  }
}

// --- Task Management ---

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: [api.tasks.get.path, taskId],
    queryFn: async () => {
      if (!taskId) return null;
      return fetchTask(taskId);
    },
    enabled: !!taskId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return isTaskRunning(data) ? TASK_POLL_INTERVAL_MS : false;
    },
  });
}

// --- File Management ---

export function useFiles() {
  return useQuery({
    queryKey: [api.files.list.path],
    queryFn: async () => await desktopBridge.files.list(),
  });
}

export function useWorkbookTemplates() {
  return useQuery({
    queryKey: [api.files.listTemplates.path],
    queryFn: async () => await desktopBridge.files.listTemplates(),
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      return await desktopBridge.files.upload(file);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
    },
  });
}

export function useCreateWorkbookFromTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateWorkbookFromTemplateRequest) =>
      await desktopBridge.files.createFromTemplate(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
    },
  });
}

// --- Sheet Management ---

export function useSheets(fileId: number | null) {
  return useQuery({
    queryKey: [api.files.getSheets.path, fileId],
    queryFn: async () => {
      if (!fileId) return [];
      return await desktopBridge.files.getSheets(fileId);
    },
    enabled: !!fileId,
  });
}

export function useSearchIndex(fileId: number | null) {
  return useQuery({
    queryKey: [api.files.getSearchIndex.path, fileId],
    queryFn: async () => {
      if (!fileId) return [];
      return await desktopBridge.files.getSearchIndex(fileId);
    },
    enabled: !!fileId,
  });
}

// --- Table Info & DDL ---

export function useTableInfo(fileId: number | null, sheetName: string | null) {
  return useQuery({
    queryKey: [api.files.getTableInfo.path, fileId, sheetName],
    queryFn: async () => {
      if (!fileId || !sheetName) return null;
      return await desktopBridge.files.getTableInfo(fileId, sheetName);
    },
    enabled: !!fileId && !!sheetName,
    retry: false, // Don't retry if sheet is invalid
  });
}

export function useGenerateDdl() {
  return useMutation({
    mutationFn: async (data: GenerateDdlRequest) => await desktopBridge.ddl.generate(data),
  });
}

export function usePreviewDdlImport() {
  return useMutation({
    mutationFn: async (request: DdlImportPreviewRequest) => {
      const data = await fetchJson(api.ddl.previewImport.path, {
        code: "REQUEST_FAILED",
        message: "Failed to preview DDL import",
      }, {
        method: api.ddl.previewImport.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      return api.ddl.previewImport.responses[200].parse(data);
    },
  });
}

export function useExportWorkbookFromDdl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: DdlImportExportRequest) => {
      const data = await fetchJson(api.ddl.exportWorkbook.path, {
        code: "REQUEST_FAILED",
        message: "Failed to export workbook from DDL",
      }, {
        method: api.ddl.exportWorkbook.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      return api.ddl.exportWorkbook.responses[201].parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
      void queryClient.invalidateQueries({ queryKey: [api.settings.get.path] });
    },
  });
}

// --- Delete File ---

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: number) => await desktopBridge.files.remove(fileId),
    onMutate: async (fileId: number) => {
      await queryClient.cancelQueries({ queryKey: [api.files.list.path] });
      const previousFiles = queryClient.getQueryData<UploadedFile[]>([api.files.list.path]) ?? [];

      queryClient.setQueryData(
        [api.files.list.path],
        previousFiles.filter((file) => file.id !== fileId),
      );

      return { previousFiles, fileId };
    },
    onError: (_error, _fileId, context) => {
      if (context?.previousFiles) {
        queryClient.setQueryData([api.files.list.path], context.previousFiles);
      }
    },
    onSuccess: (_data, deletedFileId) => {
      queryClient.removeQueries({
        predicate: (query) => {
          const [queryPath, queryFileId] = query.queryKey;
          if (queryFileId !== deletedFileId) {
            return false;
          }
          return (
            queryPath === api.files.getSheets.path ||
            queryPath === api.files.getTableInfo.path ||
            queryPath === api.files.getSearchIndex.path ||
            queryPath === "sheetData"
          );
        },
      });
      queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
    },
  });
}

// --- Sheet Raw Data (for spreadsheet viewer) ---

export function useSheetData(fileId: number | null, sheetName: string | null) {
  return useQuery({
    queryKey: ["sheetData", fileId, sheetName],
    queryFn: async () => {
      if (!fileId || !sheetName) return null;
      return await desktopBridge.files.getSheetData(fileId, sheetName);
    },
    enabled: !!fileId && !!sheetName,
    retry: false,
    staleTime: 5 * 60 * 1000, // cache 5 min
  });
}

// --- Parse Region ---

export function useParseRegion() {
  return useMutation({
    mutationFn: async (params: {
      fileId: number;
      sheetName: string;
      startRow: number;
      endRow: number;
      startCol: number;
      endCol: number;
    }) => await desktopBridge.files.parseRegion(params),
  });
}

// --- Settings ---

export function useSettings() {
  return useQuery({
    queryKey: [api.settings.get.path],
    queryFn: async () => await desktopBridge.settings.get(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: DdlSettings) => await desktopBridge.settings.update(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.settings.get.path] });
    },
  });
}

// --- Name Fix ---

export function useNameFixPreview() {
  return useMutation({
    mutationFn: async (request: NameFixPreviewRequest) => {
      const data = await fetchJson(api.nameFix.preview.path, {
        code: "REQUEST_FAILED",
        message: "Failed to preview name fixes",
      }, {
        method: api.nameFix.preview.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return api.nameFix.preview.responses[200].parse(data);
    },
  });
}

export function useApplyNameFix() {
  return useMutation({
    mutationFn: async (request: NameFixApplyRequest) => {
      const data = await fetchJson(api.nameFix.apply.path, {
        code: "REQUEST_FAILED",
        message: "Failed to apply name fixes",
      }, {
        method: api.nameFix.apply.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return api.nameFix.apply.responses[200].parse(data);
    },
  });
}

export function useNameFixJob(jobId: string | null) {
  return useQuery({
    queryKey: [api.nameFix.getJob.path, jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const url = buildUrl(api.nameFix.getJob.path, { id: jobId });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch name-fix job",
      });
      return api.nameFix.getJob.responses[200].parse(data);
    },
    enabled: Boolean(jobId),
  });
}

export function useRollbackNameFix() {
  return useMutation({
    mutationFn: async (request: NameFixRollbackRequest) => {
      const data = await fetchJson(api.nameFix.rollback.path, {
        code: "REQUEST_FAILED",
        message: "Failed to rollback name-fix job",
      }, {
        method: api.nameFix.rollback.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return api.nameFix.rollback.responses[200].parse(data);
    },
  });
}

// --- Schema Diff ---

export function useSchemaDiffHistory(newFileId: number | null) {
  return useQuery({
    queryKey: [api.diff.history.path, newFileId],
    queryFn: async () => {
      if (!newFileId) return null;
      const url = buildUrl(api.diff.history.path, { newFileId });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to load diff history",
      });
      return api.diff.history.responses[200].parse(data);
    },
    enabled: Boolean(newFileId),
  });
}

export function useSchemaDiffPreview() {
  return useMutation({
    mutationFn: async (request: SchemaDiffPreviewRequest) => {
      const data = await fetchJson(api.diff.preview.path, {
        code: "REQUEST_FAILED",
        message: "Failed to preview schema diff",
      }, {
        method: api.diff.preview.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return api.diff.preview.responses[200].parse(data);
    },
  });
}

export function useConfirmSchemaDiffRenames() {
  return useMutation({
    mutationFn: async (request: SchemaDiffConfirmRequest) => {
      const data = await fetchJson(api.diff.confirm.path, {
        code: "REQUEST_FAILED",
        message: "Failed to confirm rename suggestions",
      }, {
        method: api.diff.confirm.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return api.diff.confirm.responses[200].parse(data);
    },
  });
}

export function useSchemaDiffAlterPreview() {
  return useMutation({
    mutationFn: async (request: SchemaDiffAlterPreviewRequest) => {
      const data = await fetchJson(api.diff.alterPreview.path, {
        code: "REQUEST_FAILED",
        message: "Failed to preview alter SQL",
      }, {
        method: api.diff.alterPreview.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return api.diff.alterPreview.responses[200].parse(data);
    },
  });
}

export function useSchemaDiffAlterExport() {
  return useMutation({
    mutationFn: async (request: SchemaDiffAlterPreviewRequest) => {
      const res = await fetchResponse(api.diff.alterExport.path, {
        code: "REQUEST_FAILED",
        message: "Failed to export alter SQL",
      }, {
        method: api.diff.alterExport.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const blob = await res.blob();
      return {
        blob,
        contentType: res.headers.get("Content-Type"),
        contentDisposition: res.headers.get("Content-Disposition"),
      };
    },
  });
}
