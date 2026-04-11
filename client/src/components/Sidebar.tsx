import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Database, Loader2, PanelLeftClose, PanelLeft, Trash2, Settings, BookOpen, ChevronDown, FilePlus2, Puzzle, ArrowDownAZ } from "lucide-react";
import type { CreateWorkbookFromTemplateRequest } from "@shared/schema";
import { useCreateWorkbookFromTemplate, useDeleteFile, useFiles, useSheets, useUploadFile, useWorkbookTemplates } from "@/hooks/use-ddl";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { translateApiError } from "@/lib/api-error";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { TemplateCreateDialog } from "./templates/TemplateCreateDialog";
import { desktopBridge } from "@/lib/desktop-bridge";
import { useExtensionHost } from "@/extensions/host-context";
import type { MainSurface } from "@/extensions/host-api";
import * as LucideIcons from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface SidebarProps {
  selectedFileId: number | null;
  selectedFileIds?: Set<number>;
  selectedSheet?: string | null;
  onSelectFile: (id: number | null) => void;
  onSelectedFileIdsChange?: (next: Set<number>) => void;
  onSelectSheetForFile?: (fileId: number, sheetName: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeSurface?: MainSurface;
  onNavigate?: (surface: MainSurface) => void;
  className?: string;
}

/** lucide-react アイコン名から動的にコンポーネントを取得 */
function getLucideIcon(name?: string): LucideIcons.LucideIcon | null {
  if (!name) return null;
  const icon = (LucideIcons as Record<string, unknown>)[name];
  return typeof icon === "function" ? (icon as LucideIcons.LucideIcon) : null;
}

export function Sidebar({
  selectedFileId,
  selectedFileIds,
  selectedSheet,
  onSelectFile,
  onSelectedFileIdsChange,
  onSelectSheetForFile,
  collapsed,
  onToggleCollapse,
  activeSurface,
  onNavigate,
  className,
}: SidebarProps) {
  const docsUrl = "https://seventhre.github.io/Db-Schema-Ddl/docs/manual-architecture";
  const { data: files, isLoading } = useFiles();
  const { mutate: uploadFile, isPending: isUploading } = useUploadFile();
  const deleteFileMutation = useDeleteFile();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [hoverFileId, setHoverFileId] = useState<number | null>(null);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<{ id: number; name: string } | null>(null);
  const [isDragOverUpload, setIsDragOverUpload] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [sheetPickerFileId, setSheetPickerFileId] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [selectionMode, setSelectionMode] = useState(false);
  const [pendingBatchDeleteIds, setPendingBatchDeleteIds] = useState<number[] | null>(null);
  const desktopCapabilities = desktopBridge.getCapabilities();
  const { navigation: extNavItems } = useExtensionHost();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const dragEnterDepthRef = useRef(0);
  const { data: workbookTemplates = [], isLoading: isTemplatesLoading } = useWorkbookTemplates();
  const { mutate: createWorkbookFromTemplate, isPending: isCreatingTemplate } = useCreateWorkbookFromTemplate();
  const { data: sheetPickerSheets, isLoading: isSheetPickerLoading } = useSheets(sheetPickerFileId);

  const parseUploadedAt = (uploadedAt?: string | Date | null): Date | null => {
    if (!uploadedAt) {
      return null;
    }
    if (uploadedAt instanceof Date) {
      return Number.isNaN(uploadedAt.getTime()) ? null : uploadedAt;
    }
    // SQLite CURRENT_TIMESTAMP format is UTC but lacks timezone info:
    // "YYYY-MM-DD HH:mm:ss". Parse as UTC explicitly.
    const sqliteUtcPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    const normalized = sqliteUtcPattern.test(uploadedAt)
      ? uploadedAt.replace(" ", "T") + "Z"
      : uploadedAt;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const fileVersionMetaById = useMemo(() => {
    const map = new Map<number, { versionNumber: number; versionCount: number; shortHash: string }>();
    if (!files || files.length === 0) {
      return map;
    }

    const groups = new Map<string, typeof files>();
    files.forEach((file) => {
      const key = file.originalName;
      const list = groups.get(key) ?? [];
      list.push(file);
      groups.set(key, list);
    });

    groups.forEach((groupFiles) => {
      const ordered = [...groupFiles].sort((a, b) => {
        const tA = parseUploadedAt(a.uploadedAt)?.getTime() ?? 0;
        const tB = parseUploadedAt(b.uploadedAt)?.getTime() ?? 0;
        if (tA !== tB) {
          return tA - tB;
        }
        return a.id - b.id;
      });
      const count = ordered.length;
      ordered.forEach((file, index) => {
        map.set(file.id, {
          versionNumber: index + 1,
          versionCount: count,
          shortHash: (file.fileHash ?? "").slice(0, 8),
        });
      });
    });

    return map;
  }, [files]);

  const effectiveSelectedFileIds = selectedFileIds ?? new Set<number>(selectedFileId != null ? [selectedFileId] : []);

  const sortedFiles = useMemo(() => {
    if (!files) {
      return [];
    }
    const ranked = [...files].sort((a, b) => {
      const tA = parseUploadedAt(a.uploadedAt)?.getTime() ?? 0;
      const tB = parseUploadedAt(b.uploadedAt)?.getTime() ?? 0;
      if (tA !== tB) {
        return tB - tA;
      }
      return b.id - a.id;
    });
    if (sortMode === "name") {
      ranked.sort((a, b) => a.originalName.localeCompare(b.originalName, undefined, { numeric: true, sensitivity: "base" }));
    }
    return ranked;
  }, [files, sortMode]);

  const formatUploadedAt = (uploadedAt?: string | Date | null) => {
    const date = parseUploadedAt(uploadedAt);
    if (!date) {
      return "";
    }
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const isFileDrag = (e: React.DragEvent<HTMLElement>) => e.dataTransfer.types.includes("Files");
  const getCompactFileLabel = (fileName: string) => {
    const withoutExtension = fileName.replace(/\.[^.]+$/, "");
    if (withoutExtension.length <= 7) return withoutExtension;
    return `${withoutExtension.slice(0, 6)}…`;
  };
  const sheetPickerFile = useMemo(
    () => sortedFiles.find((file) => file.id === sheetPickerFileId) ?? null,
    [sheetPickerFileId, sortedFiles],
  );
  useEffect(() => {
    if (!sheetPickerFileId) {
      return;
    }
    const stillExists = sortedFiles.some((file) => file.id === sheetPickerFileId);
    if (!stillExists) {
      setSheetPickerFileId(null);
    }
  }, [sheetPickerFileId, sortedFiles]);

  const uploadSelectedFile = (file?: File | null) => {
    if (!file) return;
    uploadFile(file, {
      onSuccess: () => {
        toast({ title: t("toast.fileUploaded"), variant: "success" });
      },
      onError: (error) => {
        const translated = translateApiError(error, t, { includeIssues: false });
        toast({
          title: t("toast.uploadFailed"),
          description: translated.description,
          variant: "destructive",
        });
      },
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    uploadSelectedFile(e.target.files?.[0]);
    e.target.value = "";
  };

  const triggerUploadPicker = () => {
    if (isUploading) return;
    uploadInputRef.current?.click();
  };

  const handleCreateTemplate = (payload: CreateWorkbookFromTemplateRequest) => {
    createWorkbookFromTemplate(payload, {
      onSuccess: (result) => {
        setTemplateDialogOpen(false);
        onSelectFile(result.file.id);
        toast({
          title: "模板文件已创建",
          description: `${result.file.originalName} 已通过 round-trip 自检并加入文件列表。`,
          variant: "success",
        });
      },
      onError: (error) => {
        const translated = translateApiError(error, t, { includeIssues: false });
        toast({
          title: "模板创建失败",
          description: translated.description,
          variant: "destructive",
        });
      },
    });
  };

  const handleUploadDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading) return;
    if (!isFileDrag(e)) return;
    dragEnterDepthRef.current += 1;
    setIsDragOverUpload(true);
  };

  const handleUploadDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading) return;
    if (!isFileDrag(e)) return;
    e.dataTransfer.dropEffect = "copy";
  };

  const handleUploadDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragEnterDepthRef.current > 0) {
      dragEnterDepthRef.current -= 1;
    }
    if (dragEnterDepthRef.current === 0) {
      setIsDragOverUpload(false);
    }
  };

  const handleUploadDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragEnterDepthRef.current = 0;
    setIsDragOverUpload(false);
    if (isUploading) return;

    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    uploadSelectedFile(droppedFile);
  };

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const handleWindowDragEnter = (event: DragEvent) => {
      if (event.defaultPrevented) return;
      if (isUploading || !hasFiles(event)) return;
      event.preventDefault();
      setIsDragOverUpload(true);
    };

    const handleWindowDragOver = (event: DragEvent) => {
      if (event.defaultPrevented) return;
      if (isUploading || !hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      if (!isDragOverUpload) {
        setIsDragOverUpload(true);
      }
    };

    const handleWindowDragLeave = (event: DragEvent) => {
      if (event.defaultPrevented) return;
      if (!hasFiles(event)) return;
      if (event.clientX === 0 && event.clientY === 0) {
        setIsDragOverUpload(false);
      }
    };

    const handleWindowDrop = (event: DragEvent) => {
      if (event.defaultPrevented) return;
      if (!hasFiles(event)) return;
      event.preventDefault();
      setIsDragOverUpload(false);
      dragEnterDepthRef.current = 0;
      if (isUploading) return;
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      uploadSelectedFile(file);
    };

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [isDragOverUpload, isUploading]);

  const requestDelete = (e: React.MouseEvent, fileId: number, fileName: string) => {
    e.stopPropagation();
    setPendingDeleteFile({ id: fileId, name: fileName });
  };

  const confirmDelete = () => {
    if (!pendingDeleteFile) return;
    const deletingFileId = pendingDeleteFile.id;
    deleteFileMutation.mutate(deletingFileId, {
      onSuccess: () => {
        toast({ title: t("toast.fileDeleted"), variant: "success" });
      },
      onError: (error) => {
        const translated = translateApiError(error, t, { includeIssues: false });
        toast({
          title: t("errors.api.FILE_DELETE_FAILED.title"),
          description: translated.description,
          variant: "destructive",
        });
      },
      onSettled: () => {
        setPendingDeleteFile(null);
      },
    });
    if (selectedFileId === deletingFileId) {
      onSelectFile(null);
    }
  };

  const handleFileSelection = (fileId: number, options?: { multiKey?: boolean }) => {
    if (selectionMode) {
      const next = new Set(effectiveSelectedFileIds);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      onSelectedFileIdsChange?.(next);
      return;
    }

    if (options?.multiKey) {
      const next = new Set(effectiveSelectedFileIds);
      if (next.has(fileId)) {
        next.delete(fileId);
        const fallbackFileId = Array.from(next).at(-1) ?? null;
        onSelectedFileIdsChange?.(next);
        onSelectFile(fallbackFileId);
        return;
      } else {
        next.add(fileId);
        onSelectedFileIdsChange?.(next);
        onSelectFile(fileId);
        return;
      }
    }

    onSelectedFileIdsChange?.(new Set<number>([fileId]));
    onSelectFile(fileId);
  };

  const handleSelectionModeToggle = () => {
    setSelectionMode((prev) => {
      const next = !prev;
      if (next) {
        onSelectedFileIdsChange?.(new Set<number>(selectedFileId != null ? [selectedFileId] : []));
      } else {
        onSelectedFileIdsChange?.(new Set<number>(selectedFileId != null ? [selectedFileId] : []));
      }
      return next;
    });
  };

  const handleBatchDelete = () => {
    const ids = Array.from(effectiveSelectedFileIds).filter((id) =>
      sortedFiles.some((file) => file.id === id),
    );
    if (ids.length === 0) {
      return;
    }
    setPendingBatchDeleteIds(ids);
  };

  const confirmBatchDelete = async () => {
    const ids = pendingBatchDeleteIds ?? [];
    if (ids.length === 0) {
      return;
    }
    for (const fileId of ids) {
      if (!sortedFiles.some((file) => file.id === fileId)) {
        continue;
      }
      try {
        await deleteFileMutation.mutateAsync(fileId);
      } catch (error) {
        const translated = translateApiError(error, t, { includeIssues: false });
        toast({
          title: t("errors.api.FILE_DELETE_FAILED.title"),
          description: translated.description,
          variant: "destructive",
        });
        setPendingBatchDeleteIds(null);
        return;
      }
    }

    onSelectedFileIdsChange?.(new Set());
    if (selectedFileId != null && ids.includes(selectedFileId)) {
      onSelectFile(null);
    }
    setSelectionMode(false);
    setPendingBatchDeleteIds(null);
    toast({ title: t("toast.fileDeleted"), variant: "success" });
  };

  const openDocs = async () => {
    try {
      const opened = await desktopBridge.openExternal(docsUrl);
      if (opened) return;
    } catch {
      // Fallback to browser navigation below.
    }

    const openedWindow = window.open(docsUrl, "_blank", "noopener,noreferrer");
    if (!openedWindow) {
      toast({
        title: t("sidebar.docs"),
        description: "Popup blocked. Please allow popups for this site.",
        variant: "destructive",
      });
    }
  };


  const renderUploadActionMenu = (compact: boolean) => {
    if (compact) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-md" disabled={isUploading}>
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-48">
            <DropdownMenuItem onClick={triggerUploadPicker}>
              <Upload className="w-4 h-4" />
              上传 Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTemplateDialogOpen(true)}>
              <FilePlus2 className="w-4 h-4" />
              从模板创建
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-8 w-full justify-between rounded-md border border-dashed bg-background text-xs transition-all hover:border-primary/50 hover:bg-muted/20",
              isDragOverUpload && "border-primary bg-primary/10 text-primary",
            )}
            disabled={isUploading}
          >
            <span className="flex items-center gap-2">
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {isUploading ? t("sidebar.uploading") : t("sidebar.uploadExcel")}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          <DropdownMenuItem onClick={triggerUploadPicker}>
            <Upload className="w-4 h-4" />
            上传 Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTemplateDialogOpen(true)}>
            <FilePlus2 className="w-4 h-4" />
            从模板创建
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const selectedCount = effectiveSelectedFileIds.size;
  const renderExtensionWorkspaceButton = (
    item: (typeof extNavItems)[number],
    compact: boolean,
  ) => {
    const Icon = getLucideIcon(item.icon) ?? Puzzle;
    const isActive =
      activeSurface?.kind === "extension" &&
      activeSurface.extensionId === item.extensionId &&
      activeSurface.panelId === item.panelId;

    if (compact) {
      return (
        <Tooltip key={`${item.extensionId}:${item.id}`}>
          <TooltipTrigger asChild>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-md"
              onClick={() =>
                onNavigate?.({
                  kind: "extension",
                  extensionId: item.extensionId,
                  panelId: item.panelId,
                })
              }
            >
              <Icon className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Button
        key={`${item.extensionId}:${item.id}`}
        variant={isActive ? "secondary" : "ghost"}
        className="h-8 w-full justify-start gap-2 rounded-md text-xs"
        onClick={() =>
          onNavigate?.({
            kind: "extension",
            extensionId: item.extensionId,
            panelId: item.panelId,
          })
        }
      >
        <Icon className="w-3.5 h-3.5" />
        {item.label}
      </Button>
    );
  };

  const templateDialog = (
    <TemplateCreateDialog
      open={templateDialogOpen}
      templates={workbookTemplates}
      isLoading={isTemplatesLoading}
      isCreating={isCreatingTemplate}
      onOpenChange={setTemplateDialogOpen}
      onCreate={handleCreateTemplate}
    />
  );

  // Collapsed mini sidebar
  if (collapsed) {
    return (
      <div className={cn("z-20 flex h-full w-[92px] shrink-0 flex-col border-r border-border bg-background dark:bg-[#1e1e1e]", className)}>
        <div className="flex flex-col items-center gap-1.5 border-b border-border px-2 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8 rounded-md" aria-label={t("sidebar.expandSidebar")}>
                <PanelLeft className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("sidebar.expandSidebar")}</TooltipContent>
          </Tooltip>

          <input
            ref={uploadInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
            disabled={isUploading}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <div>{renderUploadActionMenu(true)}</div>
            </TooltipTrigger>
            <TooltipContent side="right">上传 Excel / 从模板创建</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="flex-1 px-1.5 py-1.5">
          <div className="space-y-1">
            {isLoading ? (
              [1, 2, 3].map((item) => (
                <div key={item} className="h-11 rounded-md bg-muted/40 animate-pulse" />
              ))
            ) : sortedFiles.length === 0 ? (
              <div className="px-1 py-2 text-center text-[10px] text-muted-foreground leading-snug">
                {t("sidebar.noFilesYet")}
              </div>
            ) : (
              sortedFiles.map((file) => {
                const meta = fileVersionMetaById.get(file.id);
                return (
                <ContextMenu key={file.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ContextMenuTrigger asChild>
                        <div className="relative group">
                          <button
                            onClick={(event) => handleFileSelection(file.id, { multiKey: event.ctrlKey || event.metaKey })}
                            className={cn(
                              "flex w-full flex-col items-center gap-1 border border-transparent px-1 py-1.5 transition-colors",
                              effectiveSelectedFileIds.has(file.id)
                                ? "border-border bg-muted/40 text-foreground"
                                : "text-foreground hover:bg-muted/30",
                            )}
                          >
                            <FileSpreadsheet className={cn(
                              "w-3.5 h-3.5 shrink-0",
                              effectiveSelectedFileIds.has(file.id) ? "text-foreground" : "text-muted-foreground",
                            )} />
                            <span className={cn(
                              "w-full text-center text-[10px] leading-tight truncate",
                              effectiveSelectedFileIds.has(file.id) ? "text-foreground" : "text-muted-foreground",
                            )}>
                              {meta && meta.versionCount > 1
                                ? `${getCompactFileLabel(file.originalName)} v${meta.versionNumber}`
                                : getCompactFileLabel(file.originalName)}
                            </span>
                          </button>
                          <button
                            onClick={(e) => requestDelete(e, file.id, file.originalName)}
                            className={cn(
                              "absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-md transition-opacity",
                              effectiveSelectedFileIds.has(file.id)
                                ? "text-muted-foreground hover:bg-red-500/15 hover:text-red-500"
                                : "text-muted-foreground/70 hover:bg-red-500/15 hover:text-red-500",
                              effectiveSelectedFileIds.has(file.id)
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100",
                            )}
                            title={t("sidebar.deleteFile")}
                            aria-label={t("sidebar.deleteFile")}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </ContextMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[320px] break-all text-xs">
                      <div className="space-y-1">
                        <div>{file.originalName}</div>
                        <div className="text-[10px] opacity-80">
                          {meta && meta.versionCount > 1 ? `v${meta.versionNumber}/${meta.versionCount} · ` : ""}
                          {formatUploadedAt(file.uploadedAt)}
                          {meta?.shortHash ? ` · #${meta.shortHash}` : ""}
                        </div>
                        <div className="text-[10px] opacity-80">{t("sidebar.rightClickSheetHint")}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <ContextMenuContent className="w-44 rounded-lg border-slate-200/90 p-1.5 dark:border-[#2d2d2d] dark:bg-[#1e1e1e]">
                    <ContextMenuLabel className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-[#808080]">
                      File
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() => handleFileSelection(file.id)}
                      className="rounded-md px-2 py-1.5 text-xs"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500 dark:text-[#808080]" />
                      {t("sidebar.openFile")}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => setSheetPickerFileId(file.id)}
                      className="rounded-md px-2 py-1.5 text-xs"
                    >
                      <Database className="h-3.5 w-3.5 text-slate-500 dark:text-[#808080]" />
                      {t("sheet.selectSheet")}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )})
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-col items-center gap-1.5 border-t border-border px-2 py-2">
          {/* 有効な拡張が Contribution で宣言したナビゲーション */}
          {extNavItems.map((item) => renderExtensionWorkspaceButton(item, true))}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md" onClick={openDocs}>
                <BookOpen className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("sidebar.docs")}</TooltipContent>
          </Tooltip>
          {desktopCapabilities.features.extensions ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={activeSurface?.kind === "extensions" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded-md"
                  onClick={() => onNavigate?.({ kind: "extensions" })}
                >
                  <Puzzle className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("extensions.navLabel")}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/settings">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t("sidebar.settings")}</TooltipContent>
          </Tooltip>
          <div className="scale-[0.9] origin-center">
            <LanguageSwitcher />
          </div>
      </div>

      <Dialog open={sheetPickerFileId != null} onOpenChange={(open) => !open && setSheetPickerFileId(null)}>
        <DialogContent className="max-w-sm overflow-hidden border-slate-200/90 p-0 shadow-2xl dark:border-[#2d2d2d] dark:bg-[#1e1e1e]">
          <DialogHeader className="border-b border-slate-200/80 px-4 py-2.5 dark:border-[#2d2d2d]">
            <DialogTitle className="truncate text-xs font-medium text-slate-600 dark:text-[#cccccc]">
              {sheetPickerFile?.originalName ?? t("sheet.selectSheet")}
            </DialogTitle>
          </DialogHeader>
          <Command className="rounded-none border-none shadow-none">
            <CommandInput placeholder={t("search.placeholder")} className="border-0 focus:ring-0" />
            <CommandList className="max-h-[320px]">
              {isSheetPickerLoading ? (
                <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("sheet.loading")}
                </div>
              ) : (
                <>
                  <CommandEmpty>{t("sheet.noSheets")}</CommandEmpty>
                  <CommandGroup heading={t("sheet.selectSheet")}>
                    {(sheetPickerSheets ?? []).map((sheet: any) => {
                      const sheetName = typeof sheet === "string" ? sheet : sheet?.name;
                      if (!sheetName) return null;
                      const isCurrent = sheetPickerFileId === selectedFileId && selectedSheet === sheetName;
                      return (
                        <CommandItem
                          key={sheetName}
                          value={sheetName}
                          onSelect={() => {
                            if (sheetPickerFileId != null) {
                              onSelectSheetForFile?.(sheetPickerFileId, sheetName);
                            }
                            setSheetPickerFileId(null);
                          }}
                          className="cursor-pointer rounded-md px-2 py-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium">{sheetName}</div>
                          </div>
                          {isCurrent ? (
                            <span className="rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-[#2d2d2d] dark:bg-[#161616] dark:text-[#888888]">
                              current
                            </span>
                          ) : null}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {templateDialog}
    </div>
    );
  }

  return (
    <div
      className={cn("workspace-panel relative z-20 flex h-full w-[268px] shrink-0 flex-col", className)}
      onDragEnter={handleUploadDragEnter}
      onDragOver={handleUploadDragOver}
      onDragLeave={handleUploadDragLeave}
      onDrop={handleUploadDrop}
    >
      <div className="border-b border-slate-200/80 bg-slate-50/75 px-3 py-3 dark:border-[#2d2d2d] dark:bg-[#1e1e1e]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200/90 bg-white text-slate-500 dark:border-[#2d2d2d] dark:bg-[#161616] dark:text-[#888888]">
                <Database className="h-4 w-4" />
              </div>
              <h2 className="truncate text-[16px] font-semibold leading-none text-slate-950 dark:text-[#cccccc]">{t("app.title")}</h2>
            </div>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-[#888888]">
              Excel schema in, review and DDL out.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8 rounded-md text-muted-foreground" aria-label={t("sidebar.collapseSidebar")}>
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>

        <div className="relative">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
            disabled={isUploading}
          />
          {renderUploadActionMenu(false)}
        </div>

      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="space-y-2 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white text-slate-500 dark:border-[#2d2d2d] dark:bg-[#161616] dark:text-[#888888]">
                <FileSpreadsheet className="h-3.5 w-3.5" />
              </div>
              <h3 className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-[#888888]">
                {t("sidebar.definitionFiles")}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant={selectionMode ? "secondary" : "outline"}
                size="sm"
                className="h-7 rounded-md px-2 text-[10px]"
                onClick={handleSelectionModeToggle}
              >
                {selectionMode
                  ? t("common.cancel")
                  : t("sidebar.batchSelectMode", { defaultValue: "批量选择" })}
              </Button>
              {selectionMode && selectedCount > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-md px-2 text-[10px]"
                  onClick={handleBatchDelete}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  {t("sidebar.deleteSelected")} ({selectedCount})
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 rounded-md px-2 text-[10px]">
                    <ArrowDownAZ className="mr-1 h-3 w-3" />
                    {sortMode === "recent" ? t("sidebar.sortRecent") : t("sidebar.sortName")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => setSortMode("recent")}>{t("sidebar.sortRecent")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortMode("name")}>{t("sidebar.sortName")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="rounded-md border border-slate-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:border-[#2d2d2d] dark:bg-[#161616] dark:text-[#888888]">
                {sortedFiles.length}
              </span>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-0.5 pb-3">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : sortedFiles.length === 0 ? (
              <div className="mx-1 rounded-xl border border-dashed border-slate-300/80 bg-gradient-to-b from-slate-50/95 to-white p-5 text-center text-xs text-slate-500 shadow-sm dark:border-[#2d2d2d] dark:from-[#1e1e1e] dark:to-[#161616] dark:text-[#888888]">
                {t("sidebar.noFilesYet")}
              </div>
            ) : (
              sortedFiles.map((file, index) => {
                const meta = fileVersionMetaById.get(file.id);
                const uploadedAtLabel = formatUploadedAt(file.uploadedAt);
                return (
                <Tooltip key={file.id}>
                  <TooltipTrigger asChild>
                    <div
                      onMouseEnter={() => setHoverFileId(file.id)}
                      onMouseLeave={() => setHoverFileId(null)}
                      style={{ animationDelay: `${Math.min(index * 30, 180)}ms` }}
                      className={cn(
                        "animate-enter group relative overflow-hidden rounded-lg border border-transparent transition-all duration-150",
                        effectiveSelectedFileIds.has(file.id)
                          ? "border-slate-200/90 bg-gradient-to-r from-blue-50 via-white to-white text-foreground shadow-sm dark:border-[#2d2d2d] dark:from-[#242424] dark:via-[#1e1e1e] dark:to-[#1e1e1e]"
                          : "text-foreground hover:border-slate-200/70 hover:bg-slate-50/90 dark:text-[#888888] dark:hover:border-[#2d2d2d] dark:hover:bg-[#242424] dark:hover:text-white"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute inset-y-2 left-0.5 w-1 rounded-full transition-colors",
                          effectiveSelectedFileIds.has(file.id) ? "bg-blue-500/90 dark:bg-[#007acc]" : "bg-transparent",
                        )}
                      />
                      <button
                        onClick={(event) => handleFileSelection(file.id, { multiKey: event.ctrlKey || event.metaKey })}
                        className={cn(
                          "grid w-full min-w-0 items-start gap-3 px-3 py-2 text-left",
                          selectionMode ? "grid-cols-[auto_auto_minmax(0,1fr)]" : "grid-cols-[auto_minmax(0,1fr)]",
                        )}
                      >
                        {selectionMode ? (
                          <div className="mt-1 flex items-center">
                            <Checkbox
                              checked={effectiveSelectedFileIds.has(file.id)}
                              aria-label={t("sidebar.selectFileForBatch", {
                                defaultValue: "选择 {{name}}",
                                name: file.originalName,
                              })}
                            />
                          </div>
                        ) : null}
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white text-slate-500 dark:border-[#2d2d2d] dark:bg-[#161616] dark:text-[#888888]">
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className={cn("mb-0.5 flex items-center gap-1.5 truncate text-xs font-medium leading-tight", effectiveSelectedFileIds.has(file.id) ? "dark:text-white" : "dark:text-[#cccccc]")}>
                            {file.originalName}
                            {meta && meta.versionCount > 1 ? (
                              <span
                                className={cn(
                                  "text-[9px] leading-tight",
                                  "border-slate-200 text-slate-500 dark:border-[#333333] dark:text-[#808080]",
                                )}
                              >
                                v{meta.versionNumber}
                              </span>
                            ) : null}
                          </p>
                          <p className={cn("text-[10px]", effectiveSelectedFileIds.has(file.id) ? "text-slate-600 dark:text-[#cccccc]" : "text-muted-foreground dark:text-[#888888]")}>
                            {uploadedAtLabel || t("sidebar.timestampUnavailable")}
                          </p>
                          <div className="mt-1 text-[10px] text-slate-500 dark:text-[#888888]">
                            {meta?.shortHash ? `#${meta.shortHash}` : ""}
                          </div>
                        </div>
                      </button>

                      <div className="absolute right-2 top-2 flex items-center justify-center">
                        <button
                          onClick={(e) => requestDelete(e, file.id, file.originalName)}
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-md transition-all",
                            "text-muted-foreground hover:text-red-500 hover:bg-red-500/10",
                            hoverFileId === file.id || effectiveSelectedFileIds.has(file.id)
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-90"
                          )}
                          title={t("sidebar.deleteFile")}
                          aria-label={t("sidebar.deleteFile")}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[320px] break-all text-xs">
                    <div className="space-y-1">
                      <div>{file.originalName}</div>
                      <div className="text-[10px] opacity-80">
                        {meta && meta.versionCount > 1 ? `v${meta.versionNumber}/${meta.versionCount} · ` : ""}
                        {uploadedAtLabel}
                        {meta?.shortHash ? ` · #${meta.shortHash}` : ""}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )})
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ナビゲーション + ユーティリティ下部セクション */}
      <div className="space-y-1.5 border-t border-slate-200/80 bg-slate-50/80 p-2 dark:border-[#2d2d2d] dark:bg-[#1e1e1e]">
        {/* 有効な拡張が Contribution で宣言したナビゲーション */}
        {extNavItems.map((item) => renderExtensionWorkspaceButton(item, false))}
        <Button variant="ghost" className="h-8 w-full justify-start gap-2 rounded-md text-xs" onClick={openDocs}>
          <BookOpen className="w-3.5 h-3.5" />
          {t("sidebar.docs")}
        </Button>
        {desktopCapabilities.features.extensions ? (
          <Button
            variant={activeSurface?.kind === "extensions" ? "secondary" : "ghost"}
            className="h-8 w-full justify-start gap-2 rounded-md text-xs"
            onClick={() => onNavigate?.({ kind: "extensions" })}
          >
            <Puzzle className="w-3.5 h-3.5" />
            {t("extensions.navLabel")}
          </Button>
        ) : null}
        <Link href="/settings">
          <Button variant="ghost" className="h-8 w-full justify-start gap-2 rounded-md text-xs">
            <Settings className="w-3.5 h-3.5" />
            {t("sidebar.settings")}
          </Button>
        </Link>
        <LanguageSwitcher />
      </div>

      {isDragOverUpload ? (
        <div className="pointer-events-none absolute inset-0 z-40 border-2 border-dashed border-primary bg-primary/8 backdrop-blur-[2px]">
          <div className="h-full w-full flex items-center justify-center p-4">
            <div className="rounded-2xl border border-primary/40 bg-white/95 px-5 py-4 text-center shadow-xl dark:bg-[#1e1e1e]">
              <div className="text-sm font-semibold text-primary">{t("sidebar.dropExcelToUpload")}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("sidebar.dropFileHint")}</div>
            </div>
          </div>
        </div>
      ) : null}

      <AlertDialog open={!!pendingDeleteFile} onOpenChange={(open) => !open && setPendingDeleteFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.deleteFile")}</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {t("sidebar.deleteConfirm")}
              {pendingDeleteFile ? (
                <span className="block mt-2 font-mono text-xs text-foreground/80">{pendingDeleteFile.name}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {t("sidebar.deleteFile")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {templateDialog}
      <AlertDialog
        open={!!pendingBatchDeleteIds?.length}
        onOpenChange={(open) => !open && setPendingBatchDeleteIds(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.deleteSelected")}</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {t("sidebar.batchDeleteConfirm", {
                defaultValue: "确认删除已选择的 {{count}} 个文件吗？",
                count: pendingBatchDeleteIds?.length ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmBatchDelete()}
            >
              {t("sidebar.deleteSelected")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
