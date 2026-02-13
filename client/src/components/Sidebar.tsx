import { useState } from "react";
import { Upload, FileSpreadsheet, Database, ChevronRight, Loader2, PanelLeftClose, PanelLeft, Trash2, Settings } from "lucide-react";
import { useFiles, useUploadFile, useDeleteFile } from "@/hooks/use-ddl";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

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
  const [hoverFileId, setHoverFileId] = useState<number | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    uploadFile(formData, {
      onSuccess: () => {
        toast({ title: "File uploaded successfully" });
      },
      onError: (error) => {
        toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      },
    });
    e.target.value = "";
  };

  const handleDelete = (e: React.MouseEvent, fileId: number) => {
    e.stopPropagation();
    if (selectedFileId === fileId) {
      onSelectFile(null);
    }
    deleteFile(fileId, {
      onSuccess: () => {
        toast({ title: "File deleted" });
      },
    });
  };

  // Collapsed mini sidebar
  if (collapsed) {
    return (
      <div className={cn("flex flex-col h-full bg-card border-r border-border items-center py-4 gap-4 w-[52px] shrink-0 z-20", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-9 w-9">
              <PanelLeft className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar</TooltipContent>
        </Tooltip>
        <div className="h-px w-6 bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
              <Database className="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">DDL Gen</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-card border-r border-border w-[280px] shrink-0 z-20 shadow-xl", className)}>
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight">DDL Gen</h2>
              <p className="text-[10px] text-muted-foreground">Excel to SQL Tool</p>
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
          <label htmlFor="file-upload" className="w-full block">
            <Button
              variant="outline"
              className="w-full border-dashed border-2 hover:border-primary/50 hover:bg-primary/5 transition-all h-9 text-xs"
              disabled={isUploading}
              asChild
            >
              <div className="cursor-pointer flex items-center gap-2">
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {isUploading ? "Uploading..." : "Upload Excel"}
              </div>
            </Button>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Definition Files
          </h3>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-0.5 pb-4">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : files?.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs border-2 border-dashed rounded-lg mx-2">
                No files uploaded yet.
              </div>
            ) : (
              files?.map((file) => (
                <Tooltip key={file.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelectFile(file.id)}
                      onMouseEnter={() => setHoverFileId(file.id)}
                      onMouseLeave={() => setHoverFileId(null)}
                      className={cn(
                        "w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200 group relative",
                        selectedFileId === file.id
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      <FileSpreadsheet className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        selectedFileId === file.id ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"
                      )} />
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="text-xs font-medium truncate leading-tight mb-0.5">
                          {file.originalName}
                        </p>
                        <p className={cn(
                          "text-[10px]",
                          selectedFileId === file.id ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : ""}
                        </p>
                      </div>
                      {/* Delete button */}
                      {hoverFileId === file.id && selectedFileId !== file.id && (
                        <button
                          onClick={(e) => handleDelete(e, file.id)}
                          className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                          title="Delete file"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      {selectedFileId === file.id && hoverFileId === file.id && (
                        <button
                          onClick={(e) => handleDelete(e, file.id)}
                          className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-red-500/20 text-primary-foreground/70 hover:text-red-200 transition-colors"
                          title="Delete file"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      {selectedFileId === file.id && hoverFileId !== file.id && (
                        <ChevronRight className="w-3.5 h-3.5 text-primary-foreground/70 shrink-0" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[320px] break-all text-xs">
                    {file.originalName}
                  </TooltipContent>
                </Tooltip>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Settings button at the bottom */}
      <div className="p-3 border-t border-border/50">
        <Link href="/settings">
          <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-xs">
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Button>
        </Link>
      </div>
    </div>
  );
}
