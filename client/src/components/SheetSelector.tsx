import { useSheets } from "@/hooks/use-ddl";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Table, Loader2, AlertCircle, Filter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";

interface SheetSelectorProps {
  fileId: number | null;
  selectedSheet: string | null;
  onSelectSheet: (sheet: string) => void;
}

export function SheetSelector({ fileId, selectedSheet, onSelectSheet }: SheetSelectorProps) {
  const { data: sheets, isLoading, isError } = useSheets(fileId);
  const { t } = useTranslation();
  const [filterUndefined, setFilterUndefined] = useState(false);

  if (!fileId) return null;

  // Filter sheets based on filter state
  const filteredSheets = filterUndefined
    ? sheets?.filter((sheet: any) => sheet.hasTableDefinitions)
    : sheets;
  const definedSheetCount = sheets?.filter((sheet: any) => sheet.hasTableDefinitions).length ?? 0;

  return (
    <div className="flex h-full min-w-0 w-full flex-col bg-background">
      <div className="border-b border-border bg-background px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Table className="h-4 w-4 text-muted-foreground" />
              {t("sheet.selectSheet")}
            </h3>
          </div>
          <button
            onClick={() => setFilterUndefined(!filterUndefined)}
            aria-label={t("sheet.filterUndefined")}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
              filterUndefined
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/40"
            )}
            title={t("sheet.filterUndefined")}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          {filteredSheets?.length ?? 0} sheets · {definedSheetCount} parsed{filterUndefined ? " · filtered" : ""}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2">
          {isLoading ? (
             <div className="flex items-center justify-center border border-dashed border-border/70 bg-muted/10 p-8 text-muted-foreground">
               <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("sheet.loading")}
             </div>
           ) : isError ? (
            <div className="flex items-center gap-2 border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" /> {t("sheet.failed")}
            </div>
          ) : filteredSheets?.length === 0 ? (
            <div className="border border-dashed border-border/70 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
              {filterUndefined ? t("sheet.noDefinedSheets") : t("sheet.noSheets")}
            </div>
          ) : (
            <>
              {filteredSheets?.map((sheet: any) => (
                <button
                  key={sheet.name}
                  onClick={() => onSelectSheet(sheet.name)}
                  className={cn(
                    "grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 border border-transparent px-2.5 py-2 text-left text-xs transition-colors",
                    selectedSheet === sheet.name
                      ? "border-border bg-muted/40 text-foreground"
                      : !sheet.hasTableDefinitions
                      ? "text-foreground hover:bg-amber-50/40"
                      : "text-foreground hover:bg-muted/20"
                  )}
                >
                  <div
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full transition-colors",
                      selectedSheet === sheet.name
                        ? "bg-primary"
                        : !sheet.hasTableDefinitions
                          ? "bg-amber-500/70"
                          : "bg-muted-foreground/35"
                    )}
                  />
                  <div className="min-w-0">
                    <span className="block truncate text-[12px] font-medium">{sheet.name}</span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-[0.08em]",
                      sheet.hasTableDefinitions ? "text-emerald-700" : "text-amber-700",
                    )}
                  >
                    {sheet.hasTableDefinitions ? "parsed" : "raw"}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
