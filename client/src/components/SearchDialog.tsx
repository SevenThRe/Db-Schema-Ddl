import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useSearchIndex } from "@/hooks/use-ddl";
import { FileSpreadsheet, Table2, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface SearchItem {
  type: "sheet" | "table";
  sheetName: string;
  displayName: string;
  physicalTableName?: string;
  logicalTableName?: string;
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: number | null;
  onSelectSheet: (sheetName: string) => void;
  onSelectTable: (sheetName: string, physicalTableName: string) => void;
}

export function SearchDialog({
  open,
  onOpenChange,
  fileId,
  onSelectSheet,
  onSelectTable,
}: SearchDialogProps) {
  const { data: searchIndex, isLoading } = useSearchIndex(fileId);
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  // Reset search when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const handleSelect = useCallback((item: SearchItem) => {
    if (item.type === "sheet") {
      onSelectSheet(item.sheetName);
    } else if (item.type === "table" && item.physicalTableName) {
      onSelectTable(item.sheetName, item.physicalTableName);
    }
    onOpenChange(false);
  }, [onSelectSheet, onSelectTable, onOpenChange]);

  // Group items by type
  const sheets = searchIndex?.filter(item => item.type === "sheet") || [];
  const tables = searchIndex?.filter(item => item.type === "table") || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-2xl overflow-hidden">
        <Command className="rounded-lg border-none shadow-none">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder={t("search.placeholder") || "Search sheets and tables..."}
              value={search}
              onValueChange={setSearch}
              className="border-0 focus:ring-0"
            />
          </div>
          <CommandList className="max-h-[400px]">
            {isLoading ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {t("search.loading") || "Loading..."}
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {t("search.noResults") || "No results found."}
                </CommandEmpty>

                {sheets.length > 0 && (
                  <CommandGroup heading={t("search.sheets") || "Sheets"}>
                    {sheets.map((item, index) => (
                      <CommandItem
                        key={`sheet-${item.sheetName}`}
                        value={`${item.displayName} __sheet_${index}`}
                        onSelect={() => handleSelect(item)}
                        className="cursor-pointer"
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4 text-blue-500" />
                        <span className="font-medium">{item.displayName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {tables.length > 0 && (
                  <CommandGroup heading={t("search.tables") || "Tables"}>
                    {tables.map((item, index) => (
                      <CommandItem
                        key={`table-${item.sheetName}-${item.physicalTableName}`}
                        value={`${item.displayName} ${item.physicalTableName} ${item.logicalTableName} __table_${index}`}
                        onSelect={() => handleSelect(item)}
                        className="cursor-pointer"
                      >
                        <Table2 className="mr-2 h-4 w-4 text-green-500" />
                        <div className="flex flex-col">
                          <span className="font-medium">{item.physicalTableName}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.logicalTableName} • {t("search.inSheet") || "in"} {item.sheetName}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
