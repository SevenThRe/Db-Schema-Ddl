import { useSheets } from "@/hooks/use-ddl";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Table, Loader2, AlertCircle, Filter } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
  const prefersReducedMotion = useReducedMotion();

  if (!fileId) return null;

  // Filter sheets based on filter state
  const filteredSheets = filterUndefined
    ? sheets?.filter((sheet: any) => sheet.hasTableDefinitions)
    : sheets;
  const definedSheetCount = sheets?.filter((sheet: any) => sheet.hasTableDefinitions).length ?? 0;

  return (
    <div className="flex h-full min-w-0 w-full flex-col bg-[linear-gradient(180deg,hsl(var(--panel-muted)/0.85),hsl(var(--background)/0.92))]">
      <div className="border-b border-white/70 bg-white/70 px-3 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="section-kicker">Sheet Navigator</p>
            <h3 className="mt-1 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--workspace-ink))]">
              <Table className="h-4 w-4 text-primary" />
              {t("sheet.selectSheet")}
            </h3>
          </div>
          <button
            onClick={() => setFilterUndefined(!filterUndefined)}
            aria-label={t("sheet.filterUndefined")}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
              filterUndefined
                ? "border-primary/70 bg-primary text-primary-foreground"
                : "border-white/70 bg-white/80 text-muted-foreground hover:bg-muted"
            )}
            title={t("sheet.filterUndefined")}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-full border-white/80 bg-white/82 px-2.5 py-1 text-[10px] font-medium">
            {filteredSheets?.length ?? 0} visible
          </Badge>
          <Badge variant="outline" className="rounded-full border-white/80 bg-white/82 px-2.5 py-1 text-[10px] font-medium">
            {definedSheetCount} parsed
          </Badge>
          {filterUndefined ? (
            <Badge className="rounded-full px-2.5 py-1 text-[10px]">defined only</Badge>
          ) : null}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {isLoading ? (
             <div className="flex items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-white/70 p-8 text-muted-foreground">
               <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("sheet.loading")}
             </div>
          ) : isError ? (
            <div className="flex items-center gap-2 rounded-[22px] border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" /> {t("sheet.failed")}
            </div>
          ) : filteredSheets?.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border/70 bg-white/70 p-8 text-center text-sm text-muted-foreground">
              {filterUndefined ? t("sheet.noDefinedSheets") : t("sheet.noSheets")}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredSheets?.map((sheet: any, idx: number) => (
                <motion.button
                  key={sheet.name}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -10 }}
                  animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
                  transition={prefersReducedMotion ? undefined : { delay: idx * 0.02 }}
                  onClick={() => onSelectSheet(sheet.name)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[20px] border px-3 py-3 text-left text-xs transition-all duration-200",
                    selectedSheet === sheet.name
                      ? "border-primary/30 bg-[linear-gradient(135deg,hsl(var(--primary))/0.14,hsl(var(--primary))/0.05)] text-primary shadow-[0_18px_36px_-24px_hsl(var(--primary)/0.55)]"
                      : !sheet.hasTableDefinitions
                      ? "border-amber-300/25 bg-amber-50/60 text-muted-foreground hover:text-foreground"
                      : "border-white/70 bg-white/78 text-muted-foreground hover:bg-white hover:text-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 h-2 w-2 shrink-0 rounded-full transition-colors",
                      selectedSheet === sheet.name
                        ? "bg-primary"
                        : !sheet.hasTableDefinitions
                          ? "bg-amber-500/70"
                          : "bg-muted-foreground/35"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{sheet.name}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-2 py-0 text-[9px] uppercase tracking-[0.18em]",
                          sheet.hasTableDefinitions
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                            : "border-amber-500/20 bg-amber-500/10 text-amber-700",
                        )}
                      >
                        {sheet.hasTableDefinitions ? "parsed" : "raw"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {sheet.hasTableDefinitions
                        ? "包含可识别的表结构定义，可直接进入预览与生成。"
                        : "当前工作表未识别到完整定义，适合人工检查或回到原始表格查看。"}
                    </p>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
