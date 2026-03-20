import { useEffect, useState } from "react";
import { ShieldCheck, Save } from "lucide-react";
import { useDbComparePolicy, useUpdateDbComparePolicy } from "@/hooks/use-db-management";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function parseThresholdInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(1, parsed));
}

function formatThreshold(value?: number): string {
  return value == null ? "" : String(value);
}

export function DbComparePolicySection() {
  const { toast } = useToast();
  const { data: policy } = useDbComparePolicy();
  const updatePolicy = useUpdateDbComparePolicy();
  const [tableThreshold, setTableThreshold] = useState("");
  const [columnThreshold, setColumnThreshold] = useState("");

  useEffect(() => {
    setTableThreshold(formatThreshold(policy?.tableRenameAutoAcceptThreshold));
    setColumnThreshold(formatThreshold(policy?.columnRenameAutoAcceptThreshold));
  }, [policy?.columnRenameAutoAcceptThreshold, policy?.tableRenameAutoAcceptThreshold]);

  const handleSave = () => {
    updatePolicy.mutate(
      {
        tableRenameAutoAcceptThreshold: parseThresholdInput(tableThreshold),
        columnRenameAutoAcceptThreshold: parseThresholdInput(columnThreshold),
      },
      {
        onSuccess: () => {
          toast({
            title: "库对库策略",
            description: "命名 / 等价阈值已保存。",
          });
        },
        onError: (error) => {
          toast({
            title: "库对库策略",
            description: error instanceof Error ? error.message : "保存失败。",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <section className="border border-border bg-background">
      <div className="flex min-h-12 items-center gap-2 border-b border-border px-4 py-3">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">库对库自动确认策略</h2>
      </div>
      <div className="space-y-4 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          默认全部人工确认。这里只开放两种低学习成本阈值：表命名建议与字段命名建议。
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tableRenameAutoAcceptThreshold">表命名自动接受阈值</Label>
            <Input
              id="tableRenameAutoAcceptThreshold"
              value={tableThreshold}
              onChange={(event) => setTableThreshold(event.target.value)}
              placeholder="留空 = 手动确认"
              inputMode="decimal"
            />
            <p className="text-xs text-muted-foreground">
              例如 `0.95`。达到该置信度后，表命名建议会在比较时自动接受。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="columnRenameAutoAcceptThreshold">字段命名自动接受阈值</Label>
            <Input
              id="columnRenameAutoAcceptThreshold"
              value={columnThreshold}
              onChange={(event) => setColumnThreshold(event.target.value)}
              placeholder="留空 = 手动确认"
              inputMode="decimal"
            />
            <p className="text-xs text-muted-foreground">
              例如 `0.98`。留空时，字段命名建议继续保持人工确认。
            </p>
          </div>
        </div>

        <Button type="button" onClick={handleSave} disabled={updatePolicy.isPending} size="sm" className="h-8 rounded-sm px-3">
          <Save className="mr-2 h-4 w-4" />
          保存库对库策略
        </Button>
      </div>
    </section>
  );
}
