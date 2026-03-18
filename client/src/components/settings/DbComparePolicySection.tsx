import { useEffect, useState } from "react";
import { ShieldCheck, Save } from "lucide-react";
import { useDbComparePolicy, useUpdateDbComparePolicy } from "@/hooks/use-db-management";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
            title: "DB Compare Policy",
            description: "rename / 等价阈值已保存。",
          });
        },
        onError: (error) => {
          toast({
            title: "DB Compare Policy",
            description: error instanceof Error ? error.message : "保存失败。",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">DB vs DB Permission Policy</CardTitle>
        </div>
        <CardDescription>
          默认全部人工确认。这里只开放两种低学习成本阈值：table rename 与 column rename。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tableRenameAutoAcceptThreshold">Table rename auto-accept threshold</Label>
            <Input
              id="tableRenameAutoAcceptThreshold"
              value={tableThreshold}
              onChange={(event) => setTableThreshold(event.target.value)}
              placeholder="留空 = manual"
              inputMode="decimal"
            />
            <p className="text-xs text-muted-foreground">
              例如 `0.95`。达到该置信度后，table rename 会在 compare 时自动接受。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="columnRenameAutoAcceptThreshold">Column rename auto-accept threshold</Label>
            <Input
              id="columnRenameAutoAcceptThreshold"
              value={columnThreshold}
              onChange={(event) => setColumnThreshold(event.target.value)}
              placeholder="留空 = manual"
              inputMode="decimal"
            />
            <p className="text-xs text-muted-foreground">
              例如 `0.98`。留空时，column rename 继续保持人工确认。
            </p>
          </div>
        </div>

        <Button type="button" onClick={handleSave} disabled={updatePolicy.isPending}>
          <Save className="mr-2 h-4 w-4" />
          保存 DB Compare Policy
        </Button>
      </CardContent>
    </Card>
  );
}
