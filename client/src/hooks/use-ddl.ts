import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type UploadedFile,
  type GenerateDdlRequest,
  type DdlSettings,
  type CreateWorkbookFromTemplateRequest,
  type DdlImportPreviewRequest,
  type DdlImportExportRequest,
  type NameFixPreviewRequest,
  type NameFixApplyRequest,
  type SchemaDiffPreviewRequest,
  type SchemaDiffConfirmRequest,
  type SchemaDiffAlterPreviewRequest,
} from "@shared/schema";
import { desktopBridge } from "@/lib/desktop-bridge";

// --- File Management ---

export function useFiles() {
  return useQuery({
    queryKey: ["/api/files"],
    queryFn: async () => await desktopBridge.files.list(),
  });
}

export function useWorkbookTemplates() {
  return useQuery({
    queryKey: ["/api/files/templates"],
    queryFn: async () => await desktopBridge.files.listTemplates(),
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => await desktopBridge.files.upload(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

export function useCreateWorkbookFromTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateWorkbookFromTemplateRequest) =>
      await desktopBridge.files.createFromTemplate(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

// --- Sheet Management ---

export function useSheets(fileId: number | null) {
  return useQuery({
    queryKey: ["/api/files/:id/sheets", fileId],
    queryFn: async () => {
      if (!fileId) return [];
      return await desktopBridge.files.getSheets(fileId);
    },
    enabled: !!fileId,
  });
}

export function useSearchIndex(fileId: number | null) {
  return useQuery({
    queryKey: ["/api/files/:id/search-index", fileId],
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
    queryKey: ["/api/files/:id/sheets/:sheetName", fileId, sheetName],
    queryFn: async () => {
      if (!fileId || !sheetName) return null;
      return await desktopBridge.files.getTableInfo(fileId, sheetName);
    },
    enabled: !!fileId && !!sheetName,
    retry: false,
  });
}

export function useGenerateDdl() {
  return useMutation({
    mutationFn: async (data: GenerateDdlRequest) => await desktopBridge.ddl.generate(data),
  });
}

export function usePreviewDdlImport() {
  return useMutation({
    mutationFn: async (request: DdlImportPreviewRequest) =>
      await desktopBridge.ddl.importPreview(request),
  });
}

export function useExportWorkbookFromDdl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: DdlImportExportRequest) =>
      await desktopBridge.ddl.exportWorkbook(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });
}

// --- Delete File ---

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: number) => await desktopBridge.files.remove(fileId),
    onMutate: async (fileId: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/files"] });
      const previousFiles = queryClient.getQueryData<UploadedFile[]>(["/api/files"]) ?? [];
      queryClient.setQueryData(
        ["/api/files"],
        previousFiles.filter((file) => file.id !== fileId),
      );
      return { previousFiles, fileId };
    },
    onError: (_error, _fileId, context) => {
      if (context?.previousFiles) {
        queryClient.setQueryData(["/api/files"], context.previousFiles);
      }
    },
    onSuccess: (_data, deletedFileId) => {
      queryClient.removeQueries({
        predicate: (query) => {
          const [queryPath, queryFileId] = query.queryKey;
          if (queryFileId !== deletedFileId) return false;
          return (
            queryPath === "/api/files/:id/sheets" ||
            queryPath === "/api/files/:id/sheets/:sheetName" ||
            queryPath === "/api/files/:id/search-index" ||
            queryPath === "sheetData"
          );
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
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
    staleTime: 5 * 60 * 1000,
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
    queryKey: ["/api/settings"],
    queryFn: async () => await desktopBridge.settings.get(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: DdlSettings) => await desktopBridge.settings.update(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });
}

// --- Name Fix ---

export function useNameFixPreview() {
  return useMutation({
    mutationFn: async (request: NameFixPreviewRequest) =>
      await desktopBridge.nameFix.preview(request),
  });
}

export function useApplyNameFix() {
  return useMutation({
    mutationFn: async (request: NameFixApplyRequest) =>
      await desktopBridge.nameFix.apply(request),
  });
}

// --- Schema Diff ---

export function useSchemaDiffPreview() {
  return useMutation({
    mutationFn: async (request: SchemaDiffPreviewRequest) =>
      await desktopBridge.diff.preview(request),
  });
}

export function useConfirmSchemaDiffRenames() {
  return useMutation({
    mutationFn: async (request: SchemaDiffConfirmRequest) =>
      await desktopBridge.diff.confirm(request),
  });
}

export function useSchemaDiffAlterPreview() {
  return useMutation({
    mutationFn: async (request: SchemaDiffAlterPreviewRequest) =>
      await desktopBridge.diff.alterPreview(request),
  });
}
