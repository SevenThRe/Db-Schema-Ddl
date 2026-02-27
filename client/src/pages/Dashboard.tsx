import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SheetSelector } from "@/components/SheetSelector";
import { TablePreview } from "@/components/TablePreview";
import { DdlGenerator } from "@/components/DdlGenerator";
import { SpreadsheetViewer } from "@/components/SpreadsheetViewer";
import { SearchDialog } from "@/components/SearchDialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useFiles } from "@/hooks/use-ddl";
import { Grid3X3, TableProperties, Search, List, LayoutPanelLeft, Layers3 } from "lucide-react";
import type { TableInfo } from "@shared/schema";
import { useTranslation } from "react-i18next";

const COMPACT_MAIN_LAYOUT_BREAKPOINT = 1500;

export default function Dashboard() {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"auto" | "spreadsheet">("auto");
  const [regionTables, setRegionTables] = useState<TableInfo[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [currentTable, setCurrentTable] = useState<TableInfo | null>(null);
  const [selectedTableNames, setSelectedTableNames] = useState<Set<string>>(new Set());
  const [tableJumpRequest, setTableJumpRequest] = useState<{
    sheetName: string;
    physicalTableName: string;
    token: number;
  } | null>(null);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [sheetSelectorOpen, setSheetSelectorOpen] = useState(false);

  const { data: files } = useFiles();
  const { t } = useTranslation();

  const handleCurrentTableChange = useCallback((table: TableInfo | null, index: number) => {
    setCurrentTable(table);
  }, []);

  useEffect(() => {
    if (!selectedFileId && files && files.length > 0) {
      const sample = files.find(f => f.originalName.includes("ISI"));
      setSelectedFileId(sample ? sample.id : files[0].id);
    }
  }, [files, selectedFileId]);

  useEffect(() => {
    setSelectedSheet(null);
    setRegionTables(null);
    setTableJumpRequest(null);
    setSheetSelectorOpen(false);
    setSelectedTableNames(new Set());
  }, [selectedFileId]);

  useEffect(() => {
    setRegionTables(null);
    setSelectedTableNames(new Set());
  }, [selectedSheet, viewMode]);

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth < COMPACT_MAIN_LAYOUT_BREAKPOINT);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isCompactLayout) {
      setSheetSelectorOpen(false);
    }
  }, [isCompactLayout]);

  const handleRegionParsed = useCallback((tables: TableInfo[]) => {
    setRegionTables(tables);
  }, []);

  const handleTablesLoaded = useCallback((tables: TableInfo[]) => {
    const availableNames = tables
      .map((table) => table.physicalTableName)
      .filter((name): name is string => Boolean(name && name.trim()));

    if (availableNames.length === 0) {
      setSelectedTableNames(new Set());
      return;
    }

    setSelectedTableNames((previous) => {
      if (previous.size === 0) {
        return new Set(availableNames);
      }
      const intersected = new Set(
        availableNames.filter((name) => previous.has(name)),
      );
      return intersected.size > 0 ? intersected : new Set(availableNames);
    });
  }, []);

  const handleSheetSelection = useCallback((sheet: string) => {
    setSelectedSheet(sheet);
    if (isCompactLayout) {
      setSheetSelectorOpen(false);
    }
  }, [isCompactLayout]);

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
    handleSheetSelection(sheetName);
    setViewMode("auto");
    setTableJumpRequest(null);
  }, [handleSheetSelection]);

  const handleSelectTable = useCallback((sheetName: string, physicalTableName: string) => {
    setTableJumpRequest({
      sheetName,
      physicalTableName,
      token: Date.now(),
    });
    setSelectedSheet(sheetName);
    setViewMode("auto");
  }, []);

  // In spreadsheet mode with region selected, use regionTables for DDL generation
  const activeTables = viewMode === "spreadsheet" && regionTables ? regionTables : null;
  const selectedFileName = files?.find((file) => file.id === selectedFileId)?.originalName ?? null;

  const renderPreviewPane = (showSheetTrigger: boolean) => (
    <div className="flex flex-col h-full min-w-0">
      <div className="px-3 py-1.5 border-b border-border/60 bg-background flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0 flex items-center gap-1.5 overflow-x-auto">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <TabsList className="h-6 p-0.5">
              <TabsTrigger value="auto" className="text-[11px] h-5 px-2 gap-1">
                <TableProperties className="w-3 h-3" />
                {t("view.autoParse")}
              </TabsTrigger>
              <TabsTrigger value="spreadsheet" className="text-[11px] h-5 px-2 gap-1">
                <Grid3X3 className="w-3 h-3" />
                {t("view.spreadsheet")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {showSheetTrigger && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSheetSelectorOpen(true)}
              className="h-6 px-2 gap-1.5 text-[11px] shrink-0"
              disabled={!selectedFileId}
            >
              <List className="w-3 h-3" />
              <span className="hidden sm:inline">{t("sheet.selectSheet")}</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="h-6 px-2 gap-1.5 text-[11px] shrink-0"
            disabled={!selectedFileId}
          >
            <Search className="w-3 h-3" />
            <span className="hidden sm:inline">{t("search.button") || "Search"}</span>
            <kbd className="pointer-events-none ml-1 hidden h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-[10px] font-medium opacity-100 sm:flex">
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

      <div className="flex-1 overflow-hidden">
        {viewMode === "auto" ? (
          <TablePreview
            fileId={selectedFileId}
            sheetName={selectedSheet}
            onTablesLoaded={handleTablesLoaded}
            jumpToPhysicalTableName={
              tableJumpRequest && selectedSheet === tableJumpRequest.sheetName
                ? tableJumpRequest.physicalTableName
                : null
            }
            jumpToken={tableJumpRequest?.token ?? 0}
            onCurrentTableChange={handleCurrentTableChange}
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
  );

  return (
    <div className="h-screen w-full bg-background overflow-hidden flex flex-col">
      <header className="h-10 shrink-0 border-b border-border/60 bg-background/95 px-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Layers3 className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide uppercase text-foreground truncate">{t("app.title")}</p>
            <p className="text-[10px] text-muted-foreground truncate">{selectedFileName || t("sidebar.noFilesYet")}</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5">
            <LayoutPanelLeft className="w-3 h-3" />
            {isCompactLayout ? "2-column" : "3-column"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 max-w-[180px] truncate">
            {selectedSheet || t("sheet.selectSheet")}
          </span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          selectedFileId={selectedFileId}
          onSelectFile={setSelectedFileId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="border-r border-border/70 overflow-hidden"
        />

        <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
          {isCompactLayout ? (
            <>
              <ResizablePanelGroup direction="horizontal" className="flex-1">
                <ResizablePanel defaultSize={65} minSize={45}>
                  {renderPreviewPane(true)}
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel defaultSize={35} minSize={25}>
                  <DdlGenerator
                    fileId={selectedFileId}
                    sheetName={selectedSheet}
                    overrideTables={activeTables}
                    currentTable={viewMode === "auto" ? currentTable : null}
                    selectedTableNames={selectedTableNames}
                    onSelectedTableNamesChange={setSelectedTableNames}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>

              <Sheet open={sheetSelectorOpen} onOpenChange={setSheetSelectorOpen}>
                <SheetContent side="left" className="p-0 sm:max-w-[360px] w-[min(92vw,360px)] flex flex-col">
                  <SheetHeader className="px-4 py-3 border-b border-border/60">
                    <SheetTitle className="text-sm">{t("sheet.selectSheet")}</SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 min-h-0">
                    <SheetSelector
                      fileId={selectedFileId}
                      selectedSheet={selectedSheet}
                      onSelectSheet={handleSheetSelection}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <ResizablePanelGroup direction="horizontal" className="flex-1">
              <ResizablePanel defaultSize={16} minSize={12} maxSize={26}>
                <SheetSelector
                  fileId={selectedFileId}
                  selectedSheet={selectedSheet}
                  onSelectSheet={handleSheetSelection}
                />
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel defaultSize={54} minSize={30}>
                {renderPreviewPane(false)}
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel defaultSize={30} minSize={20}>
                <DdlGenerator
                  fileId={selectedFileId}
                  sheetName={selectedSheet}
                  overrideTables={activeTables}
                  currentTable={viewMode === "auto" ? currentTable : null}
                  selectedTableNames={selectedTableNames}
                  onSelectedTableNamesChange={setSelectedTableNames}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
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
