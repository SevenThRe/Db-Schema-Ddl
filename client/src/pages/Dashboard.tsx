import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SheetSelector } from "@/components/SheetSelector";
import { TablePreview } from "@/components/TablePreview";
import { DdlGenerator } from "@/components/DdlGenerator";
import { SpreadsheetViewer } from "@/components/SpreadsheetViewer";
import { SearchDialog } from "@/components/SearchDialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useFiles } from "@/hooks/use-ddl";
import { Grid3X3, TableProperties, Search } from "lucide-react";
import type { TableInfo } from "@shared/schema";
import { useTranslation } from "react-i18next";

export default function Dashboard() {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"auto" | "spreadsheet">("auto");
  const [regionTables, setRegionTables] = useState<TableInfo[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const { data: files } = useFiles();
  const { t } = useTranslation();

  useEffect(() => {
    if (!selectedFileId && files && files.length > 0) {
      const sample = files.find(f => f.originalName.includes("ISI"));
      setSelectedFileId(sample ? sample.id : files[0].id);
    }
  }, [files, selectedFileId]);

  useEffect(() => {
    setSelectedSheet(null);
    setRegionTables(null);
  }, [selectedFileId]);

  useEffect(() => {
    setRegionTables(null);
  }, [selectedSheet, viewMode]);

  const handleRegionParsed = useCallback((tables: TableInfo[]) => {
    setRegionTables(tables);
  }, []);

  // Keyboard shortcut for search (Ctrl+P or Cmd+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle search result selection
  const handleSelectSheet = useCallback((sheetName: string) => {
    setSelectedSheet(sheetName);
    setViewMode("auto");
  }, []);

  const handleSelectTable = useCallback((sheetName: string, physicalTableName: string) => {
    setSelectedSheet(sheetName);
    setViewMode("auto");
    // TODO: Scroll to the table in the preview
  }, []);

  // In spreadsheet mode with region selected, use regionTables for DDL generation
  const activeTables = viewMode === "spreadsheet" && regionTables ? regionTables : null;

  return (
    <div className="h-screen w-full bg-background overflow-hidden flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          selectedFileId={selectedFileId}
          onSelectFile={setSelectedFileId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <main className="flex-1 flex flex-col min-w-0 bg-background/50">
          <ResizablePanelGroup direction="horizontal" className="flex-1">

            <ResizablePanel defaultSize={15} minSize={12} maxSize={25}>
              <SheetSelector
                fileId={selectedFileId}
                selectedSheet={selectedSheet}
                onSelectSheet={setSelectedSheet}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={55} minSize={30}>
              <div className="flex flex-col h-full">
                {/* View mode tabs */}
                <div className="px-3 py-1.5 border-b border-border bg-card/30 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                      <TabsList className="h-7 p-0.5">
                        <TabsTrigger value="auto" className="text-[11px] h-6 px-2.5 gap-1">
                          <TableProperties className="w-3 h-3" />
                          {t("view.autoParse")}
                        </TabsTrigger>
                        <TabsTrigger value="spreadsheet" className="text-[11px] h-6 px-2.5 gap-1">
                          <Grid3X3 className="w-3 h-3" />
                          {t("view.spreadsheet")}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchOpen(true)}
                      className="h-7 px-2 gap-1.5"
                      disabled={!selectedFileId}
                    >
                      <Search className="w-3 h-3" />
                      <span className="text-[11px]">{t("search.button") || "Search"}</span>
                      <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                        <span className="text-xs">⌘</span>P
                      </kbd>
                    </Button>
                  </div>
                  {viewMode === "spreadsheet" && regionTables && regionTables.length > 0 && (
                    <span className="text-[10px] text-green-600 font-medium">
                      ✓ {t("table.tablesParsedFromSelection", { count: regionTables.length })}
                    </span>
                  )}
                </div>

                {/* Content area */}
                <div className="flex-1 overflow-hidden">
                  {viewMode === "auto" ? (
                    <TablePreview
                      fileId={selectedFileId}
                      sheetName={selectedSheet}
                    />
                  ) : (
                    <SpreadsheetViewer
                      fileId={selectedFileId}
                      sheetName={selectedSheet}
                      onRegionParsed={handleRegionParsed}
                    />
                  )}
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={30} minSize={20}>
              <DdlGenerator
                fileId={selectedFileId}
                sheetName={selectedSheet}
                overrideTables={activeTables}
              />
            </ResizablePanel>

          </ResizablePanelGroup>
        </main>
      </div>

      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        fileId={selectedFileId}
        onSelectSheet={handleSelectSheet}
        onSelectTable={handleSelectTable}
      />
    </div>
  );
}
