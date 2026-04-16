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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { SqlParameterDefinition, SqlParameterInputValue } from "./sql-parameters";

export interface SqlParametersDialogProps {
  open: boolean;
  parameters: SqlParameterDefinition[];
  values: Record<string, SqlParameterInputValue>;
  renderedSqlPreview: string;
  onValueChange: (name: string, rawValue: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SqlParametersDialog({
  open,
  parameters,
  values,
  renderedSqlPreview,
  onValueChange,
  onConfirm,
  onCancel,
}: SqlParametersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <div className="flex max-h-[78vh] flex-col">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Review SQL parameters</DialogTitle>
            <DialogDescription>
              Provide values for named placeholders before this query runs in the current
              connection session. Values render as SQL literals by default. Prefix with <code>=</code>{" "}
              to insert a raw SQL expression such as <code>=NOW()</code> or{" "}
              <code>=CURRENT_DATE</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] divide-x divide-border">
            <ScrollArea className="min-h-0">
              <div className="space-y-4 p-5">
                {parameters.map((parameter) => (
                  <div key={parameter.name} className="space-y-2 rounded-sm border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor={`sql-param-${parameter.name}`} className="font-medium">
                        :{parameter.name}
                      </Label>
                      <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                        {parameter.occurrences.length} occurrence
                        {parameter.occurrences.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <Input
                      id={`sql-param-${parameter.name}`}
                      value={values[parameter.name]?.rawValue ?? ""}
                      onChange={(event) => onValueChange(parameter.name, event.target.value)}
                      placeholder="value, NULL, 42, or =NOW()"
                      autoFocus={parameter.name === parameters[0]?.name}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex min-h-0 flex-col">
              <div className="border-b border-border px-5 py-3">
                <div className="text-sm font-semibold">Rendered SQL preview</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  This rendered SQL still goes through the existing dangerous-SQL confirmation and
                  execution flow for the active connection.
                </p>
              </div>
              <div className="min-h-0 flex-1 p-4">
                <Textarea
                  value={renderedSqlPreview}
                  readOnly
                  className="h-full min-h-[320px] resize-none font-mono text-xs leading-6"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm}>
              Continue with rendered SQL
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
