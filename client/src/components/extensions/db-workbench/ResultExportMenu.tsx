import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DbQueryBatchResult } from "@shared/schema";

export type ExportFormat = "json" | "csv" | "markdown" | "sql-insert";
export type ExportScope = "current_page" | "loaded_rows" | "full_result";

export interface ResultExportMenuProps {
  batch: DbQueryBatchResult;
  onExport: (scope: ExportScope, format: ExportFormat) => void;
  isExporting?: boolean;
  supportsFullResultExport?: boolean;
}

const FORMAT_OPTIONS: { label: string; value: ExportFormat }[] = [
  { label: "CSV", value: "csv" },
  { label: "JSON", value: "json" },
  { label: "Markdown", value: "markdown" },
  { label: "SQL INSERT", value: "sql-insert" },
];

export function ResultExportMenu({
  batch,
  onExport,
  isExporting = false,
  supportsFullResultExport = false,
}: ResultExportMenuProps) {
  const loadedRows = batch.rows.length.toLocaleString();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex h-6 items-center gap-1.5 px-2 text-xs"
          disabled={isExporting}
        >
          <Download className="h-3 w-3" />
          <span>{isExporting ? "Exporting..." : "Export"}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-semibold">
          Current page
        </DropdownMenuLabel>
        <div className="px-2 py-1 text-[10px] text-muted-foreground">
          Export rows currently visible in this page.
        </div>
        <DropdownMenuSeparator />
        {FORMAT_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={`current-page-${opt.value}`}
            className="text-xs"
            onClick={() => onExport("current_page", opt.value)}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-semibold">
          Loaded rows
        </DropdownMenuLabel>
        <div className="px-2 py-1 text-[10px] text-muted-foreground">
          Export {loadedRows} loaded rows from this result tab.
        </div>
        <DropdownMenuSeparator />
        {FORMAT_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={`loaded-rows-${opt.value}`}
            className="text-xs"
            onClick={() => onExport("loaded_rows", opt.value)}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-semibold">
          Full result
        </DropdownMenuLabel>
        <div className="px-2 py-1 text-[10px] text-muted-foreground">
          {supportsFullResultExport
            ? "Re-runs query on backend runtime. Large exports can be truncated."
            : "Only single pageable SELECT-style results support full result export."}
        </div>
        <DropdownMenuSeparator />
        {FORMAT_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={`full-result-${opt.value}`}
            className="text-xs"
            disabled={!supportsFullResultExport}
            onClick={() => onExport("full_result", opt.value)}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
