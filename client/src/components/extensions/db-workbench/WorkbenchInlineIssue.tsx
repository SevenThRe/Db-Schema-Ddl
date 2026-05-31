import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function WorkbenchInlineIssue({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-border bg-background px-3 py-2">
      <Alert variant="destructive" className="rounded-md px-3 py-2">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="text-xs">{title}</AlertTitle>
        <AlertDescription className="text-xs">{description}</AlertDescription>
      </Alert>
    </div>
  );
}
