import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import {
  type UploadedFile,
  type TableInfo,
  type GenerateDdlRequest,
  type DdlSettings,
  type ProcessingTask,
  type NameFixPreviewRequest,
  type NameFixApplyRequest,
  type NameFixRollbackRequest,
} from "@shared/schema";
import { parseApiErrorResponse } from "@/lib/api-error";

// --- Task Management ---

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: [api.tasks.get.path, taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const url = buildUrl(api.tasks.get.path, { id: taskId });
      const res = await fetch(url);
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to fetch task",
        });
      }
      return api.tasks.get.responses[200].parse(await res.json());
    },
    enabled: !!taskId,
    refetchInterval: (query) => {
      // Poll every 500ms while task is pending or processing
      const data = query.state.data;
      if (data && (data.status === 'pending' || data.status === 'processing')) {
        return 500;
      }
      return false; // Stop polling when completed or failed
    },
  });
}

// --- File Management ---

export function useFiles() {
  return useQuery({
    queryKey: [api.files.list.path],
    queryFn: async () => {
      const res = await fetch(api.files.list.path);
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to fetch files",
        });
      }
      return api.files.list.responses[200].parse(await res.json());
    },
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(api.files.upload.path, {
        method: api.files.upload.method,
        body: formData,
        // Don't set Content-Type header manually for FormData, browser does it with boundary
      });

      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to upload file",
        });
      }
      return await res.json() as UploadedFile & { taskId?: string; processing?: boolean };
    },
    onSuccess: (data) => {
      // If file is processing, set up polling to refresh file list when done
      if (data.taskId && data.processing) {
        const pollTask = async () => {
          const taskUrl = buildUrl(api.tasks.get.path, { id: data.taskId! });
          const taskRes = await fetch(taskUrl);
          if (taskRes.ok) {
            const task = await taskRes.json() as ProcessingTask;
            if (task.status === 'completed') {
              queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
            } else if (task.status === 'processing' || task.status === 'pending') {
              setTimeout(pollTask, 500);
            }
          } else {
            throw await parseApiErrorResponse(taskRes, {
              code: "REQUEST_FAILED",
              message: "Failed to fetch task",
            });
          }
        };
        pollTask();
      } else {
        queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
      }
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
      const res = await fetch(url);
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to fetch sheets",
        });
      }
      const data = await res.json();

      // Check if response is a task (for large files)
      if (data.taskId && data.processing) {
        // Poll for task completion
        const pollTask = async (): Promise<any> => {
          const taskUrl = buildUrl(api.tasks.get.path, { id: data.taskId });
          const taskRes = await fetch(taskUrl);
          if (!taskRes.ok) {
            throw await parseApiErrorResponse(taskRes, {
              code: "REQUEST_FAILED",
              message: "Failed to fetch task",
            });
          }
          const task = await taskRes.json() as ProcessingTask;

          if (task.status === 'completed' && task.result) {
            return task.result;
          } else if (task.status === 'failed') {
            throw new Error(task.error || "Task failed");
          } else {
            // Still processing, wait and poll again
            await new Promise(resolve => setTimeout(resolve, 500));
            return pollTask();
          }
        };

        return pollTask();
      }

      return api.files.getSheets.responses[200].parse(data);
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
      const res = await fetch(url);
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to fetch search index",
        });
      }
      return api.files.getSearchIndex.responses[200].parse(await res.json());
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
      const res = await fetch(url);

      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to fetch table info",
        });
      }

      const data = await res.json();

      // Check if response is a task (for async processing)
      if (data.taskId && data.processing) {
        // Poll for task completion
        const pollTask = async (): Promise<any> => {
          const taskUrl = buildUrl(api.tasks.get.path, { id: data.taskId });
          const taskRes = await fetch(taskUrl);
          if (!taskRes.ok) {
            throw await parseApiErrorResponse(taskRes, {
              code: "REQUEST_FAILED",
              message: "Failed to fetch task",
            });
          }
          const task = await taskRes.json() as ProcessingTask;

          if (task.status === 'completed' && task.result) {
            return task.result;
          } else if (task.status === 'failed') {
            throw new Error(task.error || "Task failed");
          } else {
            // Still processing, wait and poll again
            await new Promise(resolve => setTimeout(resolve, 500));
            return pollTask();
          }
        };

        return pollTask();
      }

      return api.files.getTableInfo.responses[200].parse(data);
    },
    enabled: !!fileId && !!sheetName,
    retry: false, // Don't retry if sheet is invalid
  });
}

export function useGenerateDdl() {
  return useMutation({
    mutationFn: async (data: GenerateDdlRequest) => {
      const res = await fetch(api.ddl.generate.path, {
        method: api.ddl.generate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to generate DDL",
        });
      }

      return api.ddl.generate.responses[200].parse(await res.json());
    },
  });
}

// --- Delete File ---

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: number) => {
      const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to delete file",
        });
      }
      return res.json();
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
      const res = await fetch(`/api/files/${fileId}/sheets/${encodeURIComponent(sheetName)}/data`);
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to fetch sheet data",
        });
      }
      return (await res.json()) as any[][];
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
      const res = await fetch(`/api/files/${params.fileId}/parse-region`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: params.sheetName,
          startRow: params.startRow,
          endRow: params.endRow,
          startCol: params.startCol,
          endCol: params.endCol,
        }),
      });
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to parse region",
        });
      }
      return (await res.json()) as TableInfo[];
    },
  });
}

// --- Settings ---

export function useSettings() {
  return useQuery({
    queryKey: [api.settings.get.path],
    queryFn: async () => {
      const res = await fetch(api.settings.get.path);
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to fetch settings",
        });
      }
      return api.settings.get.responses[200].parse(await res.json());
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: DdlSettings) => {
      const res = await fetch(api.settings.update.path, {
        method: api.settings.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to update settings",
        });
      }
      return api.settings.update.responses[200].parse(await res.json());
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
      const res = await fetch(api.nameFix.preview.path, {
        method: api.nameFix.preview.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to preview name fixes",
        });
      }
      return api.nameFix.preview.responses[200].parse(await res.json());
    },
  });
}

export function useApplyNameFix() {
  return useMutation({
    mutationFn: async (request: NameFixApplyRequest) => {
      const res = await fetch(api.nameFix.apply.path, {
        method: api.nameFix.apply.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to apply name fixes",
        });
      }
      return api.nameFix.apply.responses[200].parse(await res.json());
    },
  });
}

export function useNameFixJob(jobId: string | null) {
  return useQuery({
    queryKey: [api.nameFix.getJob.path, jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const url = buildUrl(api.nameFix.getJob.path, { id: jobId });
      const res = await fetch(url);
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to fetch name-fix job",
        });
      }
      return api.nameFix.getJob.responses[200].parse(await res.json());
    },
    enabled: Boolean(jobId),
  });
}

export function useRollbackNameFix() {
  return useMutation({
    mutationFn: async (request: NameFixRollbackRequest) => {
      const res = await fetch(api.nameFix.rollback.path, {
        method: api.nameFix.rollback.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        throw await parseApiErrorResponse(res, {
          code: "REQUEST_FAILED",
          message: "Failed to rollback name-fix job",
        });
      }
      return api.nameFix.rollback.responses[200].parse(await res.json());
    },
  });
}
