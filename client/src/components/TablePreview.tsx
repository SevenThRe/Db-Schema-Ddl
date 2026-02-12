import { useTableInfo } from "@/hooks/use-ddl";
import { Loader2, AlertTriangle, Key } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface TablePreviewProps {
  fileId: number | null;
  sheetName: string | null;
}

export function TablePreview({ fileId, sheetName }: TablePreviewProps) {
  const { data: info, isLoading, error } = useTableInfo(fileId, sheetName);

  if (!fileId || !sheetName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Table className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <p>Select a sheet to preview table definition</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
        <p>Parsing table definition...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-500">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Invalid Table Definition</h3>
        <p className="text-muted-foreground text-sm">
          {error.message || "Could not extract valid table information from this sheet."}
        </p>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border bg-card/50">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            {info.logicalTableName || "Untitled Table"}
            <Badge variant="outline" className="font-mono font-normal text-xs text-muted-foreground">
              {info.physicalTableName || "NO_PHYSICAL_NAME"}
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground">
            {info.columns.length} columns defined in sheet <span className="font-medium text-foreground">{sheetName}</span>
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 w-full bg-background/30">
        <div className="p-6">
          <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[50px]">No.</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Logical Name</TableHead>
                  <TableHead>Physical Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="w-[80px] text-center">Null</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {info.columns.map((col, idx) => (
                  <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs text-muted-foreground">{col.no || idx + 1}</TableCell>
                    <TableCell>
                      {col.isPk && (
                        <Key className="w-3.5 h-3.5 text-amber-500 rotate-45" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{col.logicalName}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{col.physicalName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase font-bold tracking-wider">
                        {col.dataType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{col.size}</TableCell>
                    <TableCell className="text-center">
                      {col.notNull ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-red-400" title="Not Null" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" title="Nullable" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
