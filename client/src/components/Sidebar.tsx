import { useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Database, Loader2, PanelLeftClose, PanelLeft, Trash2, Settings } from "lucide-react";
import { useFiles, useUploadFile, useDeleteFile } from "@/hooks/use-ddl";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface SidebarProps {
  selectedFileId: number | null;
  onSelectFile: (id: number | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function Sidebar({ selectedFileId, onSelectFile, collapsed, onToggleCollapse, className }: SidebarProps) {
  const { data: files, isLoading } = useFiles();
  const { mutate: uploadFile, isPending: isUploading } = useUploadFile();
  const { mutate: deleteFile } = useDeleteFile();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [hoverFileId, setHoverFileId] = useState<number | null>(null);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<{ id: number; name: string } | null>(null);
  const [isDragOverUpload, setIsDragOverUpload] = useState(false);
  const dragEnterDepthRef = useRef(0);

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
      second: "2-digit",
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

  // Collapsed mini sidebar
  if (collapsed) {
    return (
      <div className={cn("flex flex-col h-full bg-background border-r border-border/60 w-[92px] shrink-0 z-20", className)}>
        <div className="px-2 py-2 border-b border-border/60 flex flex-col items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8 rounded-md">
                <PanelLeft className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("sidebar.expandSidebar")}</TooltipContent>
          </Tooltip>

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload-collapsed"
            disabled={isUploading}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <label htmlFor="file-upload-collapsed" className="block">
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-md" disabled={isUploading} asChild>
                  <div className="cursor-pointer">
                    {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  </div>
                </Button>
              </label>
            </TooltipTrigger>
            <TooltipContent side="right">{t("sidebar.uploadExcel")}</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="flex-1 px-1.5 py-1.5">
          <div className="space-y-1">
            {isLoading ? (
              [1, 2, 3].map((item) => (
                <div key={item} className="h-11 rounded-md bg-muted/50 animate-pulse" />
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
                          "w-full rounded-md border px-1 py-1.5 flex flex-col items-center gap-1 transition-colors",
                          selectedFileId === file.id
                            ? "bg-primary/90 border-primary/50 text-primary-foreground"
                            : "border-transparent hover:bg-muted/60 text-foreground",
                        )}
                      >
                        <FileSpreadsheet className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          selectedFileId === file.id ? "text-primary-foreground" : "text-muted-foreground",
                        )} />
                        <span className={cn(
                          "w-full text-center text-[10px] leading-tight truncate",
                          selectedFileId === file.id ? "text-primary-foreground/95" : "text-muted-foreground",
                        )}>
                          {meta && meta.versionCount > 1
                            ? `${getCompactFileLabel(file.originalName)} v${meta.versionNumber}`
                            : getCompactFileLabel(file.originalName)}
                        </span>
                      </button>
                      <button
                        onClick={(e) => requestDelete(e, file.id, file.originalName)}
                        className={cn(
                          "absolute top-0.5 right-0.5 h-4 w-4 rounded flex items-center justify-center transition-opacity",
                          selectedFileId === file.id
                            ? "text-primary-foreground/80 hover:bg-red-500/30 hover:text-red-100"
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

        <div className="px-2 py-2 border-t border-border/60 flex flex-col items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/settings">
                <Button variant="ghost" size="icon" className="h-8 w-8">
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
      </div>
    );
  }

  return (
    <div
      className={cn("relative flex flex-col h-full bg-background border-r border-border/60 w-[280px] shrink-0 z-20", className)}
      onDragEnter={handleUploadDragEnter}
      onDragOver={handleUploadDragOver}
      onDragLeave={handleUploadDragLeave}
      onDrop={handleUploadDrop}
    >
      <div className="px-3 py-2.5 border-b border-border/60 bg-background/80">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 bg-primary/10 rounded-md flex items-center justify-center text-primary">
              <Database className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="font-semibold text-xs tracking-wide uppercase">{t("app.title")}</h2>
              <p className="text-[10px] text-muted-foreground">{t("app.subtitle")}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>

        <div className="relative">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
            disabled={isUploading}
          />
          <label
            htmlFor="file-upload"
            className="w-full block"
          >
            <Button
              variant="outline"
              className={cn(
                "w-full border-dashed border-[1.5px] hover:border-primary/50 hover:bg-primary/5 transition-all h-9 text-xs rounded-md",
                isDragOverUpload && "border-primary bg-primary/10 text-primary",
              )}
              disabled={isUploading}
              asChild
            >
              <div className="cursor-pointer flex items-center gap-2">
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {isUploading ? t("sidebar.uploading") : t("sidebar.uploadExcel")}
              </div>
            </Button>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 py-2">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t("sidebar.definitionFiles")}
          </h3>
        </div>

        <ScrollArea className="flex-1 px-1.5">
          <div className="space-y-0.5 pb-3">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : sortedFiles.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs border-2 border-dashed rounded-lg mx-2">
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
                        "group grid grid-cols-[minmax(0,1fr)_26px] items-center gap-1 rounded-md border transition-all duration-200",
                        selectedFileId === file.id
                          ? "bg-primary/90 border-primary/50 text-primary-foreground"
                          : "bg-background border-transparent hover:bg-muted/60 text-foreground"
                      )}
                    >
                      <button
                        onClick={() => onSelectFile(file.id)}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 min-w-0"
                      >
                        <FileSpreadsheet className={cn(
                          "w-3.5 h-3.5 shrink-0 transition-colors",
                          selectedFileId === file.id ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"
                        )} />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-[11px] font-medium truncate leading-tight mb-0.5 flex items-center gap-1.5">
                            {file.originalName}
                            {meta && meta.versionCount > 1 ? (
                              <span
                                className={cn(
                                  "text-[9px] px-1 py-0 rounded border leading-tight",
                                  selectedFileId === file.id
                                    ? "border-primary-foreground/40 text-primary-foreground/90"
                                    : "border-border text-muted-foreground",
                                )}
                              >
                                v{meta.versionNumber}
                              </span>
                            ) : null}
                          </p>
                          <p className={cn(
                            "text-[10px]",
                            selectedFileId === file.id ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {uploadedAtLabel}
                            {meta?.shortHash ? ` · #${meta.shortHash}` : ""}
                          </p>
                        </div>
                      </button>

                      <div className="h-full pr-1 flex items-center justify-center">
                        <button
                          onClick={(e) => requestDelete(e, file.id, file.originalName)}
                        className={cn(
                            "h-5 w-5 flex items-center justify-center rounded transition-all",
                            selectedFileId === file.id
                              ? "text-primary-foreground/80 hover:text-red-200 hover:bg-red-500/20"
                              : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10",
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
      <div className="p-2.5 border-t border-border/50 space-y-1.5">
        <Link href="/settings">
          <Button variant="ghost" className="w-full justify-start gap-2 h-8 text-xs">
            <Settings className="w-3.5 h-3.5" />
            {t("sidebar.settings")}
          </Button>
        </Link>
        <LanguageSwitcher />
      </div>

      {isDragOverUpload ? (
        <div className="pointer-events-none absolute inset-0 z-40 bg-primary/8 backdrop-blur-[1px] border-2 border-dashed border-primary rounded-sm">
          <div className="h-full w-full flex items-center justify-center p-4">
            <div className="rounded-md bg-background/90 border border-primary/50 px-4 py-3 text-center shadow-md">
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
    </div>
  );
}
