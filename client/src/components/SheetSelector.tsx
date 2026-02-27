import { useSheets } from "@/hooks/use-ddl";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Table, Loader2, AlertCircle, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

  return (
    <div className="w-full bg-background border-r border-border/60 flex flex-col h-full min-w-0">
      <div className="px-3 py-2 border-b border-border/60 bg-background/80">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-xs tracking-wide uppercase flex items-center gap-1.5 text-foreground">
            <Table className="w-3.5 h-3.5 text-primary" />
            {t("sheet.selectSheet")}
          </h3>
          <button
            onClick={() => setFilterUndefined(!filterUndefined)}
            className={cn(
              "h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors border",
              filterUndefined
                ? "bg-primary text-primary-foreground border-primary/70"
                : "hover:bg-muted text-muted-foreground border-transparent"
            )}
            title={t("sheet.filterUndefined")}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {isLoading ? (
             <div className="flex items-center justify-center p-8 text-muted-foreground">
               <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("sheet.loading")}
             </div>
          ) : isError ? (
            <div className="p-4 text-red-500 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {t("sheet.failed")}
            </div>
          ) : filteredSheets?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {filterUndefined ? t("sheet.noDefinedSheets") : t("sheet.noSheets")}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredSheets?.map((sheet: any, idx: number) => (
                <motion.button
                  key={sheet.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  onClick={() => onSelectSheet(sheet.name)}
                  className={cn(
                    "w-full text-left px-2.5 py-2 rounded-md text-xs transition-all duration-200 flex items-center gap-2 border",
                    selectedSheet === sheet.name
                      ? "bg-primary/10 border-primary/40 text-primary font-medium"
                      : !sheet.hasTableDefinitions
                      ? "hover:bg-muted text-muted-foreground hover:text-foreground bg-amber-50/40 dark:bg-amber-950/20 border-amber-300/20 dark:border-amber-700/30"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    selectedSheet === sheet.name
                      ? "bg-primary"
                      : !sheet.hasTableDefinitions
                      ? "bg-amber-500/50"
                      : "bg-muted-foreground/30"
                  )} />
                  <span className="truncate">{sheet.name}</span>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
