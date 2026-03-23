import { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SheetSelector } from "@/components/SheetSelector";
import { TablePreview } from "@/components/TablePreview";
import { DdlGenerator } from "@/components/DdlGenerator";
import { SpreadsheetViewer } from "@/components/SpreadsheetViewer";
import { SearchDialog } from "@/components/SearchDialog";
import { SchemaDiffPanel } from "@/components/SchemaDiffPanel";
import { DdlImportWorkspace } from "@/components/ddl-import/DdlImportWorkspace";
import { UpdateNotifier } from "@/components/UpdateNotifier";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileCode2, Grid3X3, TableProperties, Search, List, LayoutPanelLeft, Loader2, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useFiles, useSheets } from "@/hooks/use-ddl";
import { type TableInfo } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { desktopBridge } from "@/lib/desktop-bridge";
import { ExtensionWorkspaceHost } from "@/extensions/ExtensionWorkspaceHost";
import { useExtensionHost } from "@/extensions/host-context";
import type { MainSurface } from "@/extensions/host-api";

const COMPACT_MAIN_LAYOUT_BREAKPOINT = 1500;
const LAST_SELECTED_SHEET_STORAGE_KEY = "dashboard:lastSelectedSheetByFile";
const LAST_SELECTED_FILE_STORAGE_KEY = "dashboard:lastSelectedFile";
const PREVIEW_ACTION_BUTTON_CLASS =
  "h-8 gap-1.5 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted/40";

type StoredSheetSelections = Record<string, string>;
interface StoredFileSelection {
  fileId?: number;
  fileHash?: string;
  originalName?: string;
}

function readStoredSheetSelections(): StoredSheetSelections {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LAST_SELECTED_SHEET_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const normalized: StoredSheetSelections = {};
    for (const [fileKey, sheetName] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof sheetName === "string" && sheetName.trim()) {
        normalized[fileKey] = sheetName;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function readStoredFileSelection(): StoredFileSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LAST_SELECTED_FILE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const normalized: StoredFileSelection = {};
    if (typeof (parsed as { fileId?: unknown }).fileId === "number") {
      normalized.fileId = (parsed as { fileId: number }).fileId;
    }
    if (typeof (parsed as { fileHash?: unknown }).fileHash === "string") {
      normalized.fileHash = (parsed as { fileHash: string }).fileHash;
    }
    if (typeof (parsed as { originalName?: unknown }).originalName === "string") {
      normalized.originalName = (parsed as { originalName: string }).originalName;
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

function buildSheetStorageKey(file: { id: number; fileHash?: string | null }): string {
  const fileHash = String(file.fileHash ?? "").trim();
  if (fileHash) {
    return `hash:${fileHash}`;
  }
  return `id:${file.id}`;
}

function getSheetName(sheet: unknown): string | null {
  if (typeof sheet === "string" && sheet.trim()) {
    return sheet;
  }
  if (
    sheet &&
    typeof sheet === "object" &&
    "name" in sheet &&
    typeof (sheet as { name?: unknown }).name === "string"
  ) {
    return ((sheet as { name: string }).name || "").trim() || null;
  }
  return null;
}

export default function Dashboard() {
  const desktopCapabilities = desktopBridge.getCapabilities();
  const [isDdlImportTestMode] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return new URLSearchParams(window.location.search).get("ddl-import-test") === "1";
  });
  const [initialFileSelection] = useState<StoredFileSelection | null>(() => readStoredFileSelection());
  const initialFileSelectionRef = useRef<StoredFileSelection | null>(initialFileSelection);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(() => {
    const fileId = initialFileSelectionRef.current?.fileId;
    return typeof fileId === "number" ? fileId : null;
  });
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [activeSurface, setActiveSurface] = useState<MainSurface>(
    () => (isDdlImportTestMode ? { kind: "ddl-import" } : { kind: "workspace" }),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"auto" | "spreadsheet" | "diff">("auto");
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
  const [lastSelectedSheetByFile, setLastSelectedSheetByFile] = useState<StoredSheetSelections>(() =>
    readStoredSheetSelections(),
  );

  const { data: files } = useFiles();
  const { data: sheets, isLoading: isSheetsLoading } = useSheets(selectedFileId);
  const { t } = useTranslation();

  useEffect(() => {
    if (!desktopCapabilities.features.ddlImport && activeSurface.kind === "ddl-import") {
      setActiveSurface({ kind: "workspace" });
    }
  }, [activeSurface, desktopCapabilities.features.ddlImport]);

  useEffect(() => {
    if (!desktopCapabilities.features.schemaDiff && viewMode === "diff") {
      setViewMode("auto");
    }
  }, [desktopCapabilities.features.schemaDiff, viewMode]);

  const handleCurrentTableChange = useCallback((table: TableInfo | null, index: number) => {
    setCurrentTable(table);
  }, []);

  useEffect(() => {
    if (selectedFileId != null || !files || files.length === 0) {
      return;
    }

    const stored = initialFileSelectionRef.current;
    const restoredFile =
      (stored?.fileId != null ? files.find((file) => file.id === stored.fileId) : undefined) ??
      (stored?.fileHash ? files.find((file) => file.fileHash === stored.fileHash) : undefined) ??
      (stored?.originalName ? files.find((file) => file.originalName === stored.originalName) : undefined);
    const sample = files.find((file) => file.originalName.includes("ISI"));
    setSelectedFileId((restoredFile ?? sample ?? files[0]).id);
  }, [files, selectedFileId]);

  useEffect(() => {
    if (selectedFileId == null || !files) {
      return;
    }
    const selectedStillExists = files.some((file) => file.id === selectedFileId);
    if (!selectedStillExists) {
      setSelectedFileId(null);
    }
  }, [files, selectedFileId]);

  useEffect(() => {
    if (selectedFileId == null || !files) {
      return;
    }

    const selectedFile = files.find((file) => file.id === selectedFileId);
    if (!selectedFile) {
      return;
    }

    const nextStoredSelection: StoredFileSelection = {
      fileId: selectedFile.id,
      fileHash: selectedFile.fileHash,
      originalName: selectedFile.originalName,
    };
    initialFileSelectionRef.current = nextStoredSelection;

    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        LAST_SELECTED_FILE_STORAGE_KEY,
        JSON.stringify(nextStoredSelection),
      );
    } catch {
      // Ignore storage write errors.
    }
  }, [files, selectedFileId]);

  useEffect(() => {
    setSelectedSheet(null);
    setRegionTables(null);
    setCurrentTable(null);
    setTableJumpRequest(null);
    setSheetSelectorOpen(false);
    setSelectedTableNames(new Set());
  }, [selectedFileId]);

  useEffect(() => {
    if (!selectedFileId || selectedSheet || !sheets || sheets.length === 0 || !files) {
      return;
    }

    const selectedFile = files.find((file) => file.id === selectedFileId);
    if (!selectedFile) {
      return;
    }

    const sheetStorageKeys = [
      buildSheetStorageKey(selectedFile),
      `id:${selectedFileId}`,
      String(selectedFileId),
    ];
    const rememberedSheetName = sheetStorageKeys
      .map((key) => lastSelectedSheetByFile[key])
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    const rememberedSheet = rememberedSheetName
      ? sheets.find((sheet: unknown) => getSheetName(sheet) === rememberedSheetName)
      : null;
    const preferredSheet =
      rememberedSheet ??
      sheets.find(
        (sheet: unknown) =>
          typeof sheet === "object" &&
          sheet !== null &&
          "hasTableDefinitions" in sheet &&
          Boolean((sheet as { hasTableDefinitions?: unknown }).hasTableDefinitions),
      ) ??
      sheets[0];

    const preferredSheetName = getSheetName(preferredSheet);
    if (preferredSheetName) {
      setSelectedSheet(preferredSheetName);
    }
  }, [files, selectedFileId, selectedSheet, sheets, lastSelectedSheetByFile]);

  useEffect(() => {
    if (!selectedFileId || !selectedSheet || !files) {
      return;
    }

    const selectedFile = files.find((file) => file.id === selectedFileId);
    if (!selectedFile) {
      return;
    }

    const primaryKey = buildSheetStorageKey(selectedFile);
    const legacyKeys = [`id:${selectedFileId}`, String(selectedFileId)];
    setLastSelectedSheetByFile((previous) =>
      [primaryKey, ...legacyKeys].every((key) => previous[key] === selectedSheet)
        ? previous
        : {
            ...previous,
            [primaryKey]: selectedSheet,
            [legacyKeys[0]]: selectedSheet,
            [legacyKeys[1]]: selectedSheet,
          },
    );
  }, [files, selectedFileId, selectedSheet]);

  useEffect(() => {
    if (!files || files.length === 0) {
      setLastSelectedSheetByFile((previous) =>
        Object.keys(previous).length > 0 ? {} : previous,
      );
      return;
    }

    const validFileKeySet = new Set<string>();
    files.forEach((file) => {
      validFileKeySet.add(buildSheetStorageKey(file));
      validFileKeySet.add(`id:${file.id}`);
      validFileKeySet.add(String(file.id));
    });
    setLastSelectedSheetByFile((previous) => {
      const nextEntries = Object.entries(previous).filter(([fileKey]) => validFileKeySet.has(fileKey));
      if (nextEntries.length === Object.keys(previous).length) {
        return previous;
      }
      return Object.fromEntries(nextEntries);
    });
  }, [files]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        LAST_SELECTED_SHEET_STORAGE_KEY,
        JSON.stringify(lastSelectedSheetByFile),
      );
    } catch {
      // Ignore storage write errors.
    }
  }, [lastSelectedSheetByFile]);

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
  const selectedFile = files?.find((file) => file.id === selectedFileId) ?? null;
  const selectedFileMemoryKey = selectedFile ? buildSheetStorageKey(selectedFile) : null;
  const activeTables = viewMode === "spreadsheet" && regionTables ? regionTables : null;
  const selectedFileName = selectedFile?.originalName ?? null;
  const isResolvingDefaultSheet =
    Boolean(selectedFileId) &&
    !selectedSheet &&
    (isSheetsLoading || Boolean(sheets && sheets.length > 0));
  const layoutLabel = isCompactLayout ? "双栏" : "三栏";
  const searchShortcutLabel =
    typeof window !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(window.navigator.platform)
      ? "⌘ P"
      : "Ctrl P";

  const renderPreviewPane = (showSheetTrigger: boolean) => (
    <div className="flex h-full min-w-0 flex-col bg-transparent">
      <div className="shrink-0 border-b border-border bg-background px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-1.5 overflow-x-auto">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <TabsList className="h-auto rounded-md border border-border bg-muted/20 p-1">
              <TabsTrigger value="auto" className="h-8 gap-1.5 rounded-md px-3 text-xs font-medium">
                <TableProperties className="w-3 h-3" />
                {t("view.autoParse")}
              </TabsTrigger>
              <TabsTrigger value="spreadsheet" className="h-8 gap-1.5 rounded-md px-3 text-xs font-medium">
                <Grid3X3 className="w-3 h-3" />
                {t("view.spreadsheet")}
              </TabsTrigger>
              {desktopCapabilities.features.schemaDiff ? (
                <TabsTrigger value="diff" className="h-8 gap-1.5 rounded-md px-3 text-xs font-medium">
                  <Sparkles className="w-3 h-3" />
                  Diff
                </TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>

          {showSheetTrigger && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSheetSelectorOpen(true)}
              className={PREVIEW_ACTION_BUTTON_CLASS}
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
            className={PREVIEW_ACTION_BUTTON_CLASS}
            disabled={!selectedFileId}
          >
            <Search className="w-3 h-3" />
            <span className="hidden sm:inline">{t("search.button") || "Search"}</span>
            <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center rounded-md border border-white/80 bg-white/85 px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
              {searchShortcutLabel}
            </kbd>
          </Button>
        </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-background">
        {viewMode === "auto" ? (
          isResolvingDefaultSheet ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
              <p>{t("sheet.loading")}</p>
            </div>
          ) : (
            <TablePreview
              fileId={selectedFileId}
              sheetName={selectedSheet}
              selectionMemoryKey={selectedFileMemoryKey}
              onTablesLoaded={handleTablesLoaded}
              jumpToPhysicalTableName={
                tableJumpRequest && selectedSheet === tableJumpRequest.sheetName
                  ? tableJumpRequest.physicalTableName
                  : null
              }
              jumpToken={tableJumpRequest?.token ?? 0}
              onCurrentTableChange={handleCurrentTableChange}
            />
          )
        ) : viewMode === "spreadsheet" ? (
          <SpreadsheetViewer
            fileId={selectedFileId}
            sheetName={selectedSheet}
            onRegionParsed={handleRegionParsed}
          />
        ) : desktopCapabilities.features.schemaDiff ? (
          <SchemaDiffPanel fileId={selectedFileId} sheetName={selectedSheet} />
        ) : (
          <TablePreview
            fileId={selectedFileId}
            sheetName={selectedSheet}
            selectionMemoryKey={selectedFileMemoryKey}
            onTablesLoaded={handleTablesLoaded}
            jumpToPhysicalTableName={
              tableJumpRequest && selectedSheet === tableJumpRequest.sheetName
                ? tableJumpRequest.physicalTableName
                : null
            }
            jumpToken={tableJumpRequest?.token ?? 0}
            onCurrentTableChange={handleCurrentTableChange}
          />
        )}
      </div>
    </div>
  );

  const renderDdlImportWorkspace = () => (
    <DdlImportWorkspace
      onActivateFile={(fileId: number) => {
        setSelectedFileId(fileId);
        setActiveSurface({ kind: "workspace" });
      }}
    />
  );

  return (
    <div className="h-screen w-full overflow-hidden bg-background">
      <div className="workbench-shell flex h-full flex-col">
        <header className="shrink-0 border-b border-border bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex flex-1 items-center gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant={activeSurface.kind === "workspace" ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-md px-3 text-xs"
                  onClick={() => setActiveSurface({ kind: "workspace" })}
                >
                  <TableProperties className="mr-1.5 h-3.5 w-3.5" />
                  定义
                </Button>
                {desktopCapabilities.features.ddlImport ? (
                  <Button
                    variant={activeSurface.kind === "ddl-import" ? "default" : "outline"}
                    size="sm"
                    className="h-8 rounded-md px-3 text-xs"
                    onClick={() => setActiveSurface({ kind: "ddl-import" })}
                  >
                    <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
                    DDL 导入
                  </Button>
                ) : null}
              </div>
              <div className="hidden h-4 w-px bg-border lg:block" />
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {selectedFileName || t("sidebar.noFilesYet")}
                {selectedSheet ? ` / ${selectedSheet}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden items-center gap-1.5 xl:inline-flex">
                <LayoutPanelLeft className="h-3.5 w-3.5" />
                {layoutLabel}
              </span>
              {desktopCapabilities.features.updater ? <UpdateNotifier /> : null}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            selectedFileId={selectedFileId}
            onSelectFile={setSelectedFileId}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            activeSurface={activeSurface}
            onNavigate={setActiveSurface}
            className="overflow-hidden border-r border-border"
          />

          <main className="min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full min-w-0 overflow-hidden bg-background">
              {activeSurface.kind === "extension" ? (
                <ExtensionWorkspaceHost
                  extensionId={activeSurface.extensionId}
                  panelId={activeSurface.panelId}
                  fileId={selectedFileId}
                  fileName={selectedFileName}
                />
              ) : desktopCapabilities.features.ddlImport && activeSurface.kind === "ddl-import" ? (
                renderDdlImportWorkspace()
              ) : isCompactLayout ? (
                <>
                  <ResizablePanelGroup direction="horizontal" className="flex-1">
                    <ResizablePanel id="dashboard-compact-preview" order={1} defaultSize={65} minSize={45}>
                      {renderPreviewPane(true)}
                    </ResizablePanel>

                    <ResizableHandle />

                    <ResizablePanel id="dashboard-compact-ddl" order={2} defaultSize={35} minSize={25}>
                      <DdlGenerator
                        fileId={selectedFileId}
                        sheetName={selectedSheet}
                        overrideTables={activeTables}
                        currentTable={viewMode === "auto" ? currentTable : null}
                        selectedTableNames={selectedTableNames}
                        onSelectedTableNamesChange={setSelectedTableNames}
                        onOpenImportWorkspace={
                          desktopCapabilities.features.ddlImport ? () => setActiveSurface({ kind: "ddl-import" }) : undefined
                        }
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>

                  <Sheet open={sheetSelectorOpen} onOpenChange={setSheetSelectorOpen}>
                    <SheetContent side="left" className="flex w-[min(92vw,360px)] flex-col p-0 sm:max-w-[360px]">
                      <SheetHeader className="border-b border-border px-4 py-3">
                        <SheetTitle className="text-sm">{t("sheet.selectSheet")}</SheetTitle>
                      </SheetHeader>
                      <div className="min-h-0 flex-1">
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
                  <ResizablePanel id="dashboard-desktop-sheets" order={1} defaultSize={16} minSize={12} maxSize={26}>
                    <SheetSelector
                      fileId={selectedFileId}
                      selectedSheet={selectedSheet}
                      onSelectSheet={handleSheetSelection}
                    />
                  </ResizablePanel>

                  <ResizableHandle />

                  <ResizablePanel id="dashboard-desktop-preview" order={2} defaultSize={54} minSize={30}>
                    {renderPreviewPane(false)}
                  </ResizablePanel>

                  <ResizableHandle />

                  <ResizablePanel id="dashboard-desktop-ddl" order={3} defaultSize={30} minSize={20}>
                    <DdlGenerator
                      fileId={selectedFileId}
                      sheetName={selectedSheet}
                      overrideTables={activeTables}
                      currentTable={viewMode === "auto" ? currentTable : null}
                      selectedTableNames={selectedTableNames}
                      onSelectedTableNamesChange={setSelectedTableNames}
                      onOpenImportWorkspace={
                        desktopCapabilities.features.ddlImport ? () => setActiveSurface({ kind: "ddl-import" }) : undefined
                      }
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              )}
            </div>
          </main>
        </div>
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
