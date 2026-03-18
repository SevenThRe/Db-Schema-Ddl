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
  type ProcessingTaskResponse,
  type NameFixPreviewRequest,
  type NameFixApplyRequest,
  type NameFixRollbackRequest,
  type SchemaDiffPreviewRequest,
  type SchemaDiffConfirmRequest,
  type SchemaDiffAlterPreviewRequest,
} from "@shared/schema";
import { parseApiErrorResponse } from "@/lib/api-error";

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
    queryFn: async () => {
      const data = await fetchJson(api.files.list.path, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch files",
      });
      return api.files.list.responses[200].parse(data);
    },
  });
}

export function useWorkbookTemplates() {
  return useQuery({
    queryKey: [api.files.listTemplates.path],
    queryFn: async () => {
      const data = await fetchJson(api.files.listTemplates.path, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch workbook templates",
      });
      return api.files.listTemplates.responses[200].parse(data) as WorkbookTemplateVariant[];
    },
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      return fetchJson<UploadedFile & { taskId?: string; processing?: boolean }>(
        api.files.upload.path,
        {
          code: "REQUEST_FAILED",
          message: "Failed to upload file",
        },
        {
          method: api.files.upload.method,
          body: formData,
          // Don't set Content-Type header manually for FormData, browser does it with boundary
        },
      );
    },
    onSuccess: (data) => {
      if (isProcessingTaskReference(data)) {
        startTaskPolling(data.taskId, () => {
          void queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
        });
        return;
      }

      void queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
    },
  });
}

export function useCreateWorkbookFromTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateWorkbookFromTemplateRequest) => {
      const data = await fetchJson(api.files.createFromTemplate.path, {
        code: "REQUEST_FAILED",
        message: "Failed to create workbook from template",
      }, {
        method: api.files.createFromTemplate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      return api.files.createFromTemplate.responses[201].parse(data) as CreateWorkbookFromTemplateResponse;
    },
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
      const url = buildUrl(api.files.getSheets.path, { id: fileId });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch sheets",
      });
      return api.files.getSheets.responses[200].parse(await resolveDeferredTaskResult(data));
    },
    enabled: !!fileId,
  });
}

export function useSearchIndex(fileId: number | null) {
  return useQuery({
    queryKey: [api.files.getSearchIndex.path, fileId],
    queryFn: async () => {
      if (!fileId) return [];
      const url = buildUrl(api.files.getSearchIndex.path, { id: fileId });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch search index",
      });
      return api.files.getSearchIndex.responses[200].parse(data);
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
      const url = buildUrl(api.files.getTableInfo.path, { id: fileId, sheetName });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch table info",
      });
      return api.files.getTableInfo.responses[200].parse(await resolveDeferredTaskResult(data));
    },
    enabled: !!fileId && !!sheetName,
    retry: false, // Don't retry if sheet is invalid
  });
}

export function useGenerateDdl() {
  return useMutation({
    mutationFn: async (data: GenerateDdlRequest) => {
      const response = await fetchJson(api.ddl.generate.path, {
        code: "REQUEST_FAILED",
        message: "Failed to generate DDL",
      }, {
        method: api.ddl.generate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      return api.ddl.generate.responses[200].parse(response);
    },
  });
}

// --- Delete File ---

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: number) => {
      return fetchJson(`/api/files/${fileId}`, {
        code: "REQUEST_FAILED",
        message: "Failed to delete file",
      }, { method: "DELETE" });
    },
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
      return fetchJson<any[][]>(
        `/api/files/${fileId}/sheets/${encodeURIComponent(sheetName)}/data`,
        {
          code: "REQUEST_FAILED",
          message: "Failed to fetch sheet data",
        },
      );
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
    }) => {
      return fetchJson<TableInfo[]>(
        `/api/files/${params.fileId}/parse-region`,
        {
          code: "REQUEST_FAILED",
          message: "Failed to parse region",
        },
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheetName: params.sheetName,
            startRow: params.startRow,
            endRow: params.endRow,
            startCol: params.startCol,
            endCol: params.endCol,
          }),
        },
      );
    },
  });
}

// --- Settings ---

export function useSettings() {
  return useQuery({
    queryKey: [api.settings.get.path],
    queryFn: async () => {
      const data = await fetchJson(api.settings.get.path, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch settings",
      });
      return api.settings.get.responses[200].parse(data);
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: DdlSettings) => {
      const data = await fetchJson(api.settings.update.path, {
        code: "REQUEST_FAILED",
        message: "Failed to update settings",
      }, {
        method: api.settings.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      return api.settings.update.responses[200].parse(data);
    },
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
