import { useSheets } from "@/hooks/use-ddl";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Table, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

interface SheetSelectorProps {
  fileId: number | null;
  selectedSheet: string | null;
  onSelectSheet: (sheet: string) => void;
}

export function SheetSelector({ fileId, selectedSheet, onSelectSheet }: SheetSelectorProps) {
  const { data: sheets, isLoading, isError } = useSheets(fileId);
  const { t } = useTranslation();

  if (!fileId) return null;

  return (
    <div className="w-64 bg-background/50 border-r border-border flex flex-col h-full backdrop-blur-sm">
      <div className="p-4 border-b border-border/50 bg-muted/20">
        <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
          <Table className="w-4 h-4 text-primary" />
          {t("sheet.selectSheet")}
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
             <div className="flex items-center justify-center p-8 text-muted-foreground">
               <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("sheet.loading")}
             </div>
          ) : isError ? (
            <div className="p-4 text-red-500 text-sm flex items-center gap-2 bg-red-50 rounded-md m-2">
              <AlertCircle className="w-4 h-4" /> {t("sheet.failed")}
            </div>
          ) : sheets?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {t("sheet.noSheets")}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {sheets?.map((sheet, idx) => (
                <motion.button
                  key={sheet}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  onClick={() => onSelectSheet(sheet)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-md text-sm transition-all duration-200 flex items-center gap-2",
                    selectedSheet === sheet
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    selectedSheet === sheet ? "bg-primary" : "bg-muted-foreground/30"
                  )} />
                  <span className="truncate">{sheet}</span>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
