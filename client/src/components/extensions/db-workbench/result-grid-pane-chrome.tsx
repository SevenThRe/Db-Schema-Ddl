import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function ResultGridLoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="text-xs text-muted-foreground">Running...</span>
    </div>
  );
}

export function ResultGridEmptyState({
  stopOnError,
  onStopOnErrorChange,
}: {
  stopOnError: boolean;
  onStopOnErrorChange: (value: boolean) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">
            Run a query to see results here.
          </p>
          <p className="text-[10px] text-muted-foreground">
            Result batches, row inspection, load more, and export actions stay attached to the
            active statement in this connection-scoped session.
          </p>
        </div>
      </div>
      <ResultGridStopOnErrorBar
        id="stop-on-error-empty"
        stopOnError={stopOnError}
        onStopOnErrorChange={onStopOnErrorChange}
      />
    </div>
  );
}

export function ResultGridStopOnErrorBar({
  id,
  stopOnError,
  onStopOnErrorChange,
}: {
  id: string;
  stopOnError: boolean;
  onStopOnErrorChange: (value: boolean) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-panel-muted px-3 py-1">
      <Switch
        id={id}
        checked={stopOnError}
        onCheckedChange={onStopOnErrorChange}
      />
      <Label htmlFor={id} className="cursor-pointer text-xs">
        Stop on error
      </Label>
    </div>
  );
}
