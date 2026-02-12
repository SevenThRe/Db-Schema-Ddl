import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { 
  type UploadedFile, 
  type TableInfo, 
  type GenerateDdlRequest 
} from "@shared/schema";

// --- File Management ---

export function useFiles() {
  return useQuery({
    queryKey: [api.files.list.path],
    queryFn: async () => {
      const res = await fetch(api.files.list.path);
      if (!res.ok) throw new Error("Failed to fetch files");
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
        const error = await res.json();
        throw new Error(error.message || "Failed to upload file");
      }
      return api.files.upload.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
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
      if (!res.ok) throw new Error("Failed to fetch sheets");
      return api.files.getSheets.responses[200].parse(await res.json());
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
        const error = await res.json();
        throw new Error(error.message || "Failed to fetch table info");
      }
      
      return api.files.getTableInfo.responses[200].parse(await res.json());
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
        const error = await res.json();
        throw new Error(error.message || "Failed to generate DDL");
      }

      return api.ddl.generate.responses[200].parse(await res.json());
    },
  });
}
