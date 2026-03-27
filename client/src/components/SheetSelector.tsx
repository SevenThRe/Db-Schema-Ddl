import { useSettings, useSheets } from "@/hooks/use-ddl";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Table, Loader2, AlertCircle, Filter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";

interface SheetSelectorProps {
  fileId: number | null;
  selectedSheet: string | null;
  onSelectSheet: (sheet: string) => void;
}

export function SheetSelector({ fileId, selectedSheet, onSelectSheet }: SheetSelectorProps) {
  const { data: sheets, isLoading, isError } = useSheets(fileId);
  const { data: settings } = useSettings();
  const { t } = useTranslation();
  const defaultFilterUndefined = settings?.hideSheetsWithoutDefinitions ?? true;
  const [filterUndefined, setFilterUndefined] = useState(defaultFilterUndefined);

  useEffect(() => {
    setFilterUndefined(defaultFilterUndefined);
  }, [defaultFilterUndefined]);

  if (!fileId) return null;

  // Filter sheets based on filter state
  const filteredSheets = filterUndefined
    ? sheets?.filter((sheet: any) => sheet.hasTableDefinitions)
    : sheets;
  const definedSheetCount = sheets?.filter((sheet: any) => sheet.hasTableDefinitions).length ?? 0;

  return (
    <div className="flex h-full min-w-0 w-full flex-col bg-transparent">
      <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <Table className="h-3.5 w-3.5" />
            </div>
            <h3 className="truncate text-sm font-medium text-slate-950 dark:text-slate-50">
              {t("sheet.selectSheet")}
            </h3>
          </div>
          <button
            onClick={() => setFilterUndefined(!filterUndefined)}
            aria-label={t("sheet.filterUndefined")}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              filterUndefined
                ? "border-primary bg-primary text-primary-foreground"
                : "border-slate-200 bg-white text-muted-foreground hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
            )}
            title={t("sheet.filterUndefined")}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-2 pl-9 text-xs leading-5 text-muted-foreground">
          {filterUndefined
            ? t("sheet.summaryFiltered", { total: filteredSheets?.length ?? 0, defined: definedSheetCount })
            : t("sheet.summary", { total: filteredSheets?.length ?? 0, defined: definedSheetCount })}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {isLoading ? (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/10 p-8 text-muted-foreground">
               <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("sheet.loading")}
             </div>
           ) : isError ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" /> {t("sheet.failed")}
            </div>
          ) : filteredSheets?.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
              {filterUndefined ? t("sheet.noDefinedSheets") : t("sheet.noSheets")}
            </div>
          ) : (
            <>
              {filteredSheets?.map((sheet: any) => (
                <button
                  key={sheet.name}
                  onClick={() => onSelectSheet(sheet.name)}
                  className={cn(
                    "grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors",
                    selectedSheet === sheet.name
                      ? "bg-slate-100 text-foreground dark:bg-slate-900"
                      : !sheet.hasTableDefinitions
                      ? "text-foreground hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                      : "text-foreground hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  )}
                >
                  <div className="flex h-7 w-7 items-center justify-center">
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
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-[12px] font-medium">{sheet.name}</span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-[0.08em]",
                      sheet.hasTableDefinitions ? "text-emerald-700" : "text-amber-700",
                    )}
                  >
                    {sheet.hasTableDefinitions ? t("sheet.parsedLabel") : t("sheet.rawLabel")}
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
