import { useEffect, useMemo, useState } from "react";
import type { WorkbookTemplateVariant } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TemplateCreateDialogProps {
  open: boolean;
  templates: WorkbookTemplateVariant[];
  isLoading: boolean;
  isCreating: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: { templateId: WorkbookTemplateVariant["id"]; originalName?: string }) => void;
}

export function TemplateCreateDialog({
  open,
  templates,
  isLoading,
  isCreating,
  onOpenChange,
  onCreate,
}: TemplateCreateDialogProps) {
  const initialTemplateId = templates[0]?.id ?? null;
  const [selectedTemplateId, setSelectedTemplateId] = useState<WorkbookTemplateVariant["id"] | null>(null);
  const [customName, setCustomName] = useState("");

  const activeTemplate = useMemo(() => {
    const fallbackId = selectedTemplateId ?? initialTemplateId;
    return templates.find((template) => template.id === fallbackId) ?? null;
  }, [initialTemplateId, selectedTemplateId, templates]);

  useEffect(() => {
    if (!open) {
      setCustomName("");
      setSelectedTemplateId(null);
    }
  }, [open]);

  const handleCreate = () => {
    if (!activeTemplate) {
      return;
    }

    onCreate({
      templateId: activeTemplate.id,
      originalName: customName.trim() || activeTemplate.suggestedFileName,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>从模板创建</DialogTitle>
          <DialogDescription>
            选择一个官方内置模板。创建后系统会立即做 round-trip 自检，只有能被当前 parser 稳定识别的模板才会进入文件列表。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => {
              const selected = activeTemplate?.id === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40 hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{template.label}</span>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      Format {template.parserFormat}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {template.description}
                  </p>
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    默认文件名：{template.suggestedFileName}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground" htmlFor="template-original-name">
              新文件名
            </label>
            <Input
              id="template-original-name"
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              placeholder={activeTemplate?.suggestedFileName ?? "template.xlsx"}
              disabled={isCreating}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              留空会使用官方默认文件名，并自动生成一个真实的 `.xlsx` 文件后加入左侧文件列表。
            </p>
          </div>

          {isLoading ? (
            <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
              正在加载模板列表...
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={!activeTemplate || isCreating || isLoading}>
            {isCreating ? "正在创建..." : "创建模板文件"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
