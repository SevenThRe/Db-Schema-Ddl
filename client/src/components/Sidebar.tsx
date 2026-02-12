import { useState } from "react";
import { Upload, FileSpreadsheet, Database, ChevronRight, Loader2 } from "lucide-react";
import { useFiles, useUploadFile } from "@/hooks/use-ddl";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface SidebarProps {
  selectedFileId: number | null;
  onSelectFile: (id: number) => void;
  className?: string;
}

export function Sidebar({ selectedFileId, onSelectFile, className }: SidebarProps) {
  const { data: files, isLoading } = useFiles();
  const { mutate: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    uploadFile(formData, {
      onSuccess: () => {
        toast({
          title: "File uploaded successfully",
          description: "You can now select it to generate DDL.",
        });
      },
      onError: (error) => {
        toast({
          title: "Upload failed",
          description: error.message,
          variant: "destructive",
        });
      },
    });
    
    // Reset input
    e.target.value = "";
  };

  return (
    <div className={cn("flex flex-col h-full bg-card border-r border-border", className)}>
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg tracking-tight">DDL Gen</h2>
            <p className="text-xs text-muted-foreground">Excel to SQL Tool</p>
          </div>
        </div>

        <div className="relative">
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
            disabled={isUploading}
          />
          <label htmlFor="file-upload" className="w-full block">
            <Button 
              variant="outline" 
              className="w-full border-dashed border-2 hover:border-primary/50 hover:bg-primary/5 transition-all"
              disabled={isUploading}
              asChild
            >
              <div className="cursor-pointer flex items-center gap-2">
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isUploading ? "Uploading..." : "Upload Excel"}
              </div>
            </Button>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 py-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Definition Files
          </h3>
        </div>
        
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-1 pb-4">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : files?.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm border-2 border-dashed rounded-lg mx-2">
                No files uploaded yet.
              </div>
            ) : (
              files?.map((file) => (
                <button
                  key={file.id}
                  onClick={() => onSelectFile(file.id)}
                  className={cn(
                    "w-full text-left flex items-center gap-3 p-3 rounded-lg transition-all duration-200 group relative overflow-hidden",
                    selectedFileId === file.id
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <FileSpreadsheet className={cn(
                    "w-5 h-5 shrink-0 transition-colors",
                    selectedFileId === file.id ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight mb-0.5">
                      {file.originalName}
                    </p>
                    <p className={cn(
                      "text-[10px] truncate",
                      selectedFileId === file.id ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}>
                      {new Date(file.uploadedAt!).toLocaleDateString()}
                    </p>
                  </div>
                  {selectedFileId === file.id && (
                    <ChevronRight className="w-4 h-4 text-primary-foreground animate-in fade-in slide-in-from-left-1 duration-300" />
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
