import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DbBackgroundJobSummary } from "@shared/schema";
import { jobCenterStatusTone } from "./job-center-model";

export function JobCenterStatusBadge({
  status,
}: {
  status: DbBackgroundJobSummary["status"];
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-sm border-0 text-[10px]", jobCenterStatusTone(status))}
    >
      {status}
    </Badge>
  );
}

export function JobCenterEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-sm border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
      {message}
    </div>
  );
}
