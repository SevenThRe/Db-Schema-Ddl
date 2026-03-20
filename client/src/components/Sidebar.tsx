import { useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Database, Loader2, PanelLeftClose, PanelLeft, Trash2, Settings, BookOpen, ChevronDown, FilePlus2 } from "lucide-react";
import type { CreateWorkbookFromTemplateRequest, ExtensionHostState } from "@shared/schema";
import { useCreateWorkbookFromTemplate, useDeleteFile, useFiles, useUploadFile, useWorkbookTemplates } from "@/hooks/use-ddl";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { translateApiError } from "@/lib/api-error";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { TemplateCreateDialog } from "./templates/TemplateCreateDialog";

interface SidebarProps {
  selectedFileId: number | null;
  onSelectFile: (id: number | null) => void;
  dbManagementState: ExtensionHostState | null;
  dbManagementSelected: boolean;
  onSelectDbManagement: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function Sidebar({
  selectedFileId,
  onSelectFile,
  dbManagementState,
  dbManagementSelected,
  onSelectDbManagement,
  collapsed,
  onToggleCollapse,
  className,
}: SidebarProps) {
  const docsUrl = "https://seventhre.github.io/Db-Schema-Ddl/docs/manual-architecture";
  const { data: files, isLoading } = useFiles();
  const { mutate: uploadFile, isPending: isUploading } = useUploadFile();
  const { mutate: deleteFile } = useDeleteFile();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [hoverFileId, setHoverFileId] = useState<number | null>(null);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<{ id: number; name: string } | null>(null);
  const [isDragOverUpload, setIsDragOverUpload] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const dragEnterDepthRef = useRef(0);
  const { data: workbookTemplates = [], isLoading: isTemplatesLoading } = useWorkbookTemplates();
  const { mutate: createWorkbookFromTemplate, isPending: isCreatingTemplate } = useCreateWorkbookFromTemplate();

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

  const sortedFiles = useMemo(() => {
    if (!files) {
      return [];
    }
    return [...files].sort((a, b) => {
      const tA = parseUploadedAt(a.uploadedAt)?.getTime() ?? 0;
      const tB = parseUploadedAt(b.uploadedAt)?.getTime() ?? 0;
      if (tA !== tB) {
        return tB - tA;
      }
      return b.id - a.id;
    });
  }, [files]);

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

  const uploadSelectedFile = (file?: File | null) => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    if (typeof file.lastModified === "number" && file.lastModified > 0) {
      formData.append("sourceModifiedAt", String(file.lastModified));
    }

    uploadFile(formData, {
      onSuccess: (data: any) => {
        if (data.isDuplicate) {
          toast({
            title: t("toast.duplicateFile"),
            description: t("toast.duplicateFileDesc"),
            variant: "default"
          });
        } else {
          toast({ title: t("toast.fileUploaded") });
        }
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

  const requestDelete = (e: React.MouseEvent, fileId: number, fileName: string) => {
    e.stopPropagation();
    setPendingDeleteFile({ id: fileId, name: fileName });
  };

  const confirmDelete = () => {
    if (!pendingDeleteFile) return;
    const deletingFileId = pendingDeleteFile.id;
    deleteFile(deletingFileId, {
      onSuccess: () => {
        toast({ title: t("toast.fileDeleted") });
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

  const openDocs = async () => {
    try {
      if (window.electronAPI?.openExternal) {
        const opened = await window.electronAPI.openExternal(docsUrl);
        if (opened) return;
      }
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

  const dbManagementStatus = dbManagementState?.status ?? "not_installed";
  const dbManagementBadgeLabel =
    dbManagementState?.updateAvailable
      ? "可更新"
      : dbManagementState?.lifecycle?.stage === "failed"
        ? "需重试"
        : dbManagementStatus === "not_installed"
      ? "扩展"
      : dbManagementStatus === "disabled"
        ? "已禁用"
        : dbManagementStatus === "incompatible"
          ? "需要更新"
          : "官方扩展";

  const dbManagementButtonClass = cn(
    "w-full border border-transparent transition-colors",
    dbManagementSelected && dbManagementStatus === "enabled"
      ? "border-border bg-muted/40 text-foreground"
      : dbManagementStatus === "not_installed"
        ? "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
        : dbManagementStatus === "incompatible"
          ? "text-amber-900 hover:bg-amber-500/10 dark:text-amber-200"
          : dbManagementStatus === "disabled"
            ? "text-foreground hover:bg-muted/20"
            : "text-foreground hover:bg-muted/20",
  );

  const renderDbManagementEntry = (compact: boolean) => {
    if (compact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSelectDbManagement}
              className={cn(
                "relative flex w-full flex-col items-center gap-1 rounded-sm border px-1 py-1.5 transition-colors",
                dbManagementButtonClass,
              )}
            >
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span className="w-full text-center text-[10px] leading-tight">DB</span>
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary/80" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[240px] text-xs">
            <div className="space-y-1">
              <div className="font-medium">DB 管理</div>
              <div className="text-[10px] opacity-80">{dbManagementBadgeLabel}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <button
        type="button"
        onClick={onSelectDbManagement}
        className={cn(
          "grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 text-left text-xs",
          dbManagementButtonClass,
        )}
      >
        <Database className="h-4 w-4 text-muted-foreground" />
        <span className="min-w-0 truncate text-[12px] font-medium">DB 管理</span>
        <span className="text-[10px] text-muted-foreground">{dbManagementBadgeLabel}</span>
      </button>
    );
  };

  const renderUploadActionMenu = (compact: boolean) => {
    if (compact) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-sm" disabled={isUploading}>
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
              "h-8 w-full justify-between rounded-sm border border-dashed bg-background text-[11px] transition-all hover:border-primary/50 hover:bg-muted/20",
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
      <div className={cn("z-20 flex h-full w-[92px] shrink-0 flex-col border-r border-border bg-background", className)}>
        <div className="flex flex-col items-center gap-1.5 border-b border-border px-2 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8 rounded-sm" aria-label={t("sidebar.expandSidebar")}>
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
            {renderDbManagementEntry(true)}
            {isLoading ? (
              [1, 2, 3].map((item) => (
                <div key={item} className="h-11 rounded-sm bg-muted/40 animate-pulse" />
              ))
            ) : sortedFiles.length === 0 ? (
              <div className="px-1 py-2 text-center text-[10px] text-muted-foreground leading-snug">
                {t("sidebar.noFilesYet")}
              </div>
            ) : (
              sortedFiles.map((file) => {
                const meta = fileVersionMetaById.get(file.id);
                return (
                <Tooltip key={file.id}>
                  <TooltipTrigger asChild>
                    <div className="relative group">
                      <button
                        onClick={() => onSelectFile(file.id)}
                        className={cn(
                          "flex w-full flex-col items-center gap-1 border border-transparent px-1 py-1.5 transition-colors",
                          selectedFileId === file.id
                            ? "border-border bg-muted/40 text-foreground"
                            : "text-foreground hover:bg-muted/30",
                        )}
                      >
                        <FileSpreadsheet className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          selectedFileId === file.id ? "text-foreground" : "text-muted-foreground",
                        )} />
                        <span className={cn(
                          "w-full text-center text-[10px] leading-tight truncate",
                          selectedFileId === file.id ? "text-foreground" : "text-muted-foreground",
                        )}>
                          {meta && meta.versionCount > 1
                            ? `${getCompactFileLabel(file.originalName)} v${meta.versionNumber}`
                            : getCompactFileLabel(file.originalName)}
                        </span>
                      </button>
                        <button
                          onClick={(e) => requestDelete(e, file.id, file.originalName)}
                          className={cn(
                          "absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm transition-opacity",
                          selectedFileId === file.id
                            ? "text-muted-foreground hover:bg-red-500/15 hover:text-red-500"
                            : "text-muted-foreground/70 hover:bg-red-500/15 hover:text-red-500",
                          selectedFileId === file.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                        title={t("sidebar.deleteFile")}
                        aria-label={t("sidebar.deleteFile")}
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[320px] break-all text-xs">
                    <div className="space-y-1">
                      <div>{file.originalName}</div>
                      <div className="text-[10px] opacity-80">
                        {meta && meta.versionCount > 1 ? `v${meta.versionNumber}/${meta.versionCount} · ` : ""}
                        {formatUploadedAt(file.uploadedAt)}
                        {meta?.shortHash ? ` · #${meta.shortHash}` : ""}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )})
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-col items-center gap-1.5 border-t border-border px-2 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-sm" onClick={openDocs}>
                <BookOpen className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("sidebar.docs")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/settings">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-sm">
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

        {templateDialog}
      </div>
    );
  }

  return (
    <div
      className={cn("relative z-20 flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-background", className)}
      onDragEnter={handleUploadDragEnter}
      onDragOver={handleUploadDragOver}
      onDragLeave={handleUploadDragLeave}
      onDrop={handleUploadDrop}
    >
      <div className="border-b border-border bg-background px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold text-foreground">{t("app.title")}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8 rounded-sm text-muted-foreground" aria-label={t("sidebar.collapseSidebar")}>
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

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 py-2 space-y-2">
          <div>{renderDbManagementEntry(false)}</div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("sidebar.definitionFiles")}
            </h3>
            <span className="text-[10px] text-muted-foreground">{sortedFiles.length}</span>
          </div>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 pb-3">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-sm bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : sortedFiles.length === 0 ? (
              <div className="mx-1 border border-dashed border-border/70 bg-muted/10 p-4 text-center text-xs text-muted-foreground">
                {t("sidebar.noFilesYet")}
              </div>
            ) : (
              sortedFiles.map((file) => {
                const meta = fileVersionMetaById.get(file.id);
                const uploadedAtLabel = formatUploadedAt(file.uploadedAt);
                return (
                <Tooltip key={file.id}>
                  <TooltipTrigger asChild>
                    <div
                      onMouseEnter={() => setHoverFileId(file.id)}
                      onMouseLeave={() => setHoverFileId(null)}
                      className={cn(
                        "group grid grid-cols-[minmax(0,1fr)_26px] items-center gap-1 border border-transparent transition-colors duration-150",
                        selectedFileId === file.id
                          ? "border-border bg-muted/40 text-foreground"
                          : "bg-background text-foreground hover:bg-muted/20"
                      )}
                    >
                      <button
                        onClick={() => onSelectFile(file.id)}
                        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
                      >
                        <FileSpreadsheet className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-colors",
                          selectedFileId === file.id ? "text-foreground" : "text-muted-foreground"
                        )} />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-[11px] font-medium truncate leading-tight mb-0.5 flex items-center gap-1.5">
                            {file.originalName}
                            {meta && meta.versionCount > 1 ? (
                              <span
                                className={cn(
                                  "text-[9px] leading-tight",
                                  "text-muted-foreground",
                                )}
                              >
                                v{meta.versionNumber}
                              </span>
                            ) : null}
                          </p>
                          <p className={cn(
                            "text-[10px]",
                            selectedFileId === file.id ? "text-foreground/80" : "text-muted-foreground"
                          )}>
                            {uploadedAtLabel}
                          </p>
                        </div>
                      </button>

                      <div className="h-full pr-1 flex items-center justify-center">
                        <button
                          onClick={(e) => requestDelete(e, file.id, file.originalName)}
                        className={cn(
                            "h-6 w-6 flex items-center justify-center rounded-sm transition-all",
                            "text-muted-foreground hover:text-red-500 hover:bg-red-500/10",
                            hoverFileId === file.id || selectedFileId === file.id
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

      {/* Settings and Language Switcher at the bottom */}
      <div className="space-y-1.5 border-t border-border bg-background p-2">
        <Button variant="ghost" className="h-8 w-full justify-start gap-2 rounded-sm text-xs" onClick={openDocs}>
          <BookOpen className="w-3.5 h-3.5" />
          {t("sidebar.docs")}
        </Button>
        <Link href="/settings">
          <Button variant="ghost" className="h-8 w-full justify-start gap-2 rounded-sm text-xs">
            <Settings className="w-3.5 h-3.5" />
            {t("sidebar.settings")}
          </Button>
        </Link>
        <LanguageSwitcher />
      </div>

      {isDragOverUpload ? (
        <div className="pointer-events-none absolute inset-0 z-40 border-2 border-dashed border-primary bg-primary/8">
          <div className="h-full w-full flex items-center justify-center p-4">
            <div className="border border-primary/50 bg-background px-4 py-3 text-center">
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
              Are you sure you want to delete this file?
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
    </div>
  );
}
