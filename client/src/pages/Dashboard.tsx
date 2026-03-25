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
import { Grid3X3, TableProperties, Search, List, PanelLeft, PanelRight, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFiles, useSettings, useSheets } from "@/hooks/use-ddl";
import { type TableInfo } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { desktopBridge } from "@/lib/desktop-bridge";
import { ExtensionWorkspaceHost } from "@/extensions/ExtensionWorkspaceHost";
import type { MainSurface } from "@/extensions/host-api";
import { StatusBar } from "@/components/StatusBar";
import { useStatusBarScope } from "@/status-bar/context";
import { parseUploadedAtMillis } from "@/components/ddl/name-fix-display-utils";

const COMPACT_MAIN_LAYOUT_BREAKPOINT = 1500;
const LAST_SELECTED_SHEET_STORAGE_KEY = "dashboard:lastSelectedSheetByFile";
const LAST_SELECTED_FILE_STORAGE_KEY = "dashboard:lastSelectedFile";
const WORKSPACE_CHROME_STORAGE_KEY = "dashboard:workspaceChrome";
const PREVIEW_ACTION_BUTTON_CLASS =
  "h-8 gap-1.5 shrink-0 rounded-lg border border-slate-200/80 bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900";

type StoredSheetSelections = Record<string, string>;
interface StoredFileSelection {
  fileId?: number;
  fileHash?: string;
  originalName?: string;
}

interface StoredWorkspaceChrome {
  sidebarCollapsed?: boolean;
  showSheetPane?: boolean;
  showDdlPane?: boolean;
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

function readStoredWorkspaceChrome(): StoredWorkspaceChrome {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_CHROME_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const result: StoredWorkspaceChrome = {};
    if (typeof (parsed as { sidebarCollapsed?: unknown }).sidebarCollapsed === "boolean") {
      result.sidebarCollapsed = (parsed as { sidebarCollapsed: boolean }).sidebarCollapsed;
    }
    if (typeof (parsed as { showSheetPane?: unknown }).showSheetPane === "boolean") {
      result.showSheetPane = (parsed as { showSheetPane: boolean }).showSheetPane;
    }
    if (typeof (parsed as { showDdlPane?: unknown }).showDdlPane === "boolean") {
      result.showDdlPane = (parsed as { showDdlPane: boolean }).showDdlPane;
    }
    return result;
  } catch {
    return {};
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

function buildStoredSheetSelectionEntries(
  file: { id: number; fileHash?: string | null },
  sheetName: string,
): Record<string, string> {
  return {
    [buildSheetStorageKey(file)]: sheetName,
    [`id:${file.id}`]: sheetName,
    [String(file.id)]: sheetName,
  };
}

function formatMemoryLabel(memoryBytes: number): string {
  if (!Number.isFinite(memoryBytes) || memoryBytes <= 0) {
    return "0 MB";
  }
  const inMiB = memoryBytes / (1024 * 1024);
  if (inMiB >= 1024) {
    return `${(inMiB / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(inMiB)} MB`;
}

export default function Dashboard() {
  const desktopCapabilities = desktopBridge.getCapabilities();
  const statusBar = useStatusBarScope("app");
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
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(() => {
    const fileId = initialFileSelectionRef.current?.fileId;
    return new Set<number>(typeof fileId === "number" ? [fileId] : []);
  });
  const [diffCompareOldFileId, setDiffCompareOldFileId] = useState<number | null>(null);
  const [activeSurface, setActiveSurface] = useState<MainSurface>(
    () => (isDdlImportTestMode ? { kind: "ddl-import" } : { kind: "workspace" }),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStoredWorkspaceChrome().sidebarCollapsed ?? false);
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
  const [showSheetPane, setShowSheetPane] = useState(() => readStoredWorkspaceChrome().showSheetPane ?? true);
  const [showDdlPane, setShowDdlPane] = useState(() => readStoredWorkspaceChrome().showDdlPane ?? true);
  const [lastSelectedSheetByFile, setLastSelectedSheetByFile] = useState<StoredSheetSelections>(() =>
    readStoredSheetSelections(),
  );

  const { data: files } = useFiles();
  const { data: settings } = useSettings();
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
    if (selectedFileId == null) {
      setSelectedFileIds((previous) => (previous.size === 0 ? previous : new Set<number>()));
      return;
    }
    setSelectedFileIds((previous) => {
      if (previous.size === 0) {
        return new Set<number>([selectedFileId]);
      }
      if (previous.has(selectedFileId)) {
        return previous;
      }
      return previous;
    });
  }, [selectedFileId]);

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
    if (!files) {
      return;
    }
    const validIds = new Set(files.map((file) => file.id));
    setSelectedFileIds((previous) => {
      const next = new Set(Array.from(previous).filter((id) => validIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [files]);

  useEffect(() => {
    if (!desktopCapabilities.features.schemaDiff) {
      setDiffCompareOldFileId(null);
      return;
    }
    if (!files || selectedFileIds.size !== 2) {
      setDiffCompareOldFileId(null);
      return;
    }

    const pair = Array.from(selectedFileIds)
      .map((id) => files.find((file) => file.id === id) ?? null)
      .filter((file): file is NonNullable<typeof file> => Boolean(file))
      .sort((a, b) => {
        const timeDiff = parseUploadedAtMillis(b.uploadedAt) - parseUploadedAtMillis(a.uploadedAt);
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return b.id - a.id;
      });

    if (pair.length !== 2) {
      setDiffCompareOldFileId(null);
      return;
    }

    const [newerFile, olderFile] = pair;
    setDiffCompareOldFileId((previous) => (previous === olderFile.id ? previous : olderFile.id));
    if (selectedFileId !== newerFile.id) {
      setSelectedSheet(null);
      setSelectedFileId(newerFile.id);
    }
    setViewMode("diff");
  }, [desktopCapabilities.features.schemaDiff, files, selectedFileId, selectedFileIds]);

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
    const hideSheetsWithoutDefinitions = settings?.hideSheetsWithoutDefinitions ?? true;
    const rememberedSheet = rememberedSheetName
      ? sheets.find((sheet: unknown) => {
          const matchesName = getSheetName(sheet) === rememberedSheetName;
          if (!matchesName) {
            return false;
          }
          if (!hideSheetsWithoutDefinitions) {
            return true;
          }
          return !(
            typeof sheet === "object"
            && sheet !== null
            && "hasTableDefinitions" in sheet
            && !(sheet as { hasTableDefinitions?: unknown }).hasTableDefinitions
          );
        })
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
  }, [files, selectedFileId, selectedSheet, sheets, lastSelectedSheetByFile, settings]);

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
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        WORKSPACE_CHROME_STORAGE_KEY,
        JSON.stringify({ sidebarCollapsed, showSheetPane, showDdlPane }),
      );
    } catch {
      // Ignore storage write errors.
    }
  }, [sidebarCollapsed, showSheetPane, showDdlPane]);

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

  useEffect(() => {
    if (desktopCapabilities.runtime !== "tauri" || !settings?.statusBarItems.includes("memory")) {
      statusBar.clear("memory");
      return;
    }

    let disposed = false;

    const syncProcessMetrics = async () => {
      try {
        const metrics = await desktopBridge.getProcessMetrics();
        if (disposed || !metrics) {
          return;
        }
        statusBar.set({
          id: "memory",
          label: t("dashboard.statusMemory"),
          detail: formatMemoryLabel(metrics.memoryBytes),
          align: "right",
          order: 100,
          mono: true,
        });
      } catch {
        if (!disposed) {
          statusBar.clear("memory");
        }
      }
    };

    void syncProcessMetrics();
    const timer = window.setInterval(() => {
      void syncProcessMetrics();
    }, 15_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      statusBar.clear("memory");
    };
  }, [desktopCapabilities.runtime, settings?.statusBarItems, statusBar, t]);

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

  const handleSelectSheetFromSidebar = useCallback((fileId: number, sheetName: string) => {
    if (!files) {
      return;
    }
    const targetFile = files.find((file) => file.id === fileId);
    if (!targetFile) {
      return;
    }

    const nextEntries = buildStoredSheetSelectionEntries(targetFile, sheetName);
    setLastSelectedSheetByFile((previous) => ({ ...previous, ...nextEntries }));

    if (selectedFileId === fileId) {
      setSelectedSheet(sheetName);
      return;
    }

    setSelectedFileIds(new Set<number>([fileId]));
    setSelectedFileId(fileId);
  }, [files, selectedFileId]);

  const handleSelectedFileIdsChange = useCallback((next: Set<number>) => {
    setSelectedFileIds(new Set(next));
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
  const searchShortcutLabel =
    typeof window !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(window.navigator.platform)
      ? "⌘ P"
      : "Ctrl P";
  const resetWorkspaceChrome = useCallback(() => {
    setSidebarCollapsed(false);
    setShowSheetPane(true);
    setShowDdlPane(true);
    setViewMode("auto");
    setSheetSelectorOpen(false);
  }, []);
  const renderPreviewPane = (showSheetTrigger: boolean) => (
    <div className="workspace-panel flex h-full min-w-0 flex-col">
      <div className="shrink-0 border-b border-slate-200/80 bg-slate-50/75 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-slate-950 dark:text-slate-50">
              {selectedFileName || t("sidebar.noFilesYet")}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {selectedSheet ?? t("dashboard.noSheetSelected")}
              {currentTable ? ` · ${currentTable.physicalTableName}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList className="h-auto rounded-lg border border-slate-200/80 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-950">
                <TabsTrigger value="auto" className="h-7 gap-1.5 rounded-md px-2 text-[11px] font-medium">
                  <TableProperties className="h-3 w-3" />
                  {t("view.autoParse")}
                </TabsTrigger>
                <TabsTrigger value="spreadsheet" className="h-7 gap-1.5 rounded-md px-2 text-[11px] font-medium">
                  <Grid3X3 className="h-3 w-3" />
                  {t("view.spreadsheet")}
                </TabsTrigger>
                {desktopCapabilities.features.schemaDiff ? (
                  <TabsTrigger value="diff" className="h-7 gap-1.5 rounded-md px-2 text-[11px] font-medium">
                    <Sparkles className="h-3 w-3" />
                    Diff
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-1.5">
              {showSheetTrigger && showSheetPane && (
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
      </div>

      <div className="workspace-subtle-grid flex-1 overflow-hidden bg-white/80 dark:bg-slate-950/95">
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
          <SchemaDiffPanel fileId={selectedFileId} sheetName={selectedSheet} compareOldFileId={diffCompareOldFileId} />
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
        setSelectedFileIds(new Set<number>([fileId]));
        setSelectedFileId(fileId);
        setActiveSurface({ kind: "workspace" });
      }}
    />
  );

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-100 dark:bg-slate-950">
      <div className="workbench-shell flex h-full flex-col p-2.5">
        <header className="workspace-topbar shrink-0 px-4 py-2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex flex-1 items-center gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant={activeSurface.kind === "workspace" ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-lg px-3 text-xs font-medium"
                  onClick={() => setActiveSurface({ kind: "workspace" })}
                >
                  <TableProperties className="mr-1.5 h-3.5 w-3.5" />
                  {t("dashboard.workspace")}
                </Button>
              </div>
              <p className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
                {selectedFileName || t("sidebar.noFilesYet")}
                {selectedSheet ? ` / ${selectedSheet}` : ""}
                {currentTable ? ` / ${currentTable.physicalTableName}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="hidden items-center gap-1.5 lg:flex">
                <span className="inline-flex h-8 items-center rounded-md border border-slate-200/80 bg-white px-2.5 text-[10px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  {viewMode === "auto" ? t("view.autoParse") : viewMode === "spreadsheet" ? t("view.spreadsheet") : "Diff"}
                </span>
                {selectedSheet ? (
                  <span className="inline-flex h-8 items-center rounded-md border border-slate-200/80 bg-white px-2.5 text-[10px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    {selectedSheet}
                  </span>
                ) : null}
              </div>
              <div className="hidden items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/80 p-0.5 xl:flex dark:border-slate-800 dark:bg-slate-950">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={!sidebarCollapsed ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8 rounded-md"
                      onClick={() => setSidebarCollapsed((prev) => !prev)}
                      aria-label={t("dashboard.filesPane")}
                    >
                      <PanelLeft className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("dashboard.filesPane")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showSheetPane ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8 rounded-md"
                      onClick={() => setShowSheetPane((prev) => !prev)}
                      aria-label={t("dashboard.sheetsPane")}
                    >
                      <List className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("dashboard.sheetsPane")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showDdlPane ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8 rounded-md"
                      onClick={() => setShowDdlPane((prev) => !prev)}
                      aria-label={t("dashboard.inspectorPane")}
                    >
                      <PanelRight className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("dashboard.inspectorPane")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md"
                      onClick={resetWorkspaceChrome}
                      aria-label={t("dashboard.resetLayout")}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("dashboard.resetLayout")}</TooltipContent>
                </Tooltip>
              </div>
              {desktopCapabilities.features.updater ? <UpdateNotifier /> : null}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="mt-2.5 flex flex-1 overflow-hidden gap-2">
          <Sidebar
            selectedFileId={selectedFileId}
            selectedFileIds={selectedFileIds}
            selectedSheet={selectedSheet}
            onSelectFile={setSelectedFileId}
            onSelectedFileIdsChange={handleSelectedFileIdsChange}
            onSelectSheetForFile={handleSelectSheetFromSidebar}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            activeSurface={activeSurface}
            onNavigate={setActiveSurface}
            className="workspace-nav-pane overflow-hidden"
          />

          <main className="min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full min-w-0 overflow-hidden">
              {activeSurface.kind === "extensions" ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  扩展功能管理（Plan 02 で実装）
                </div>
              ) : activeSurface.kind === "extension" ? (
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
                  {showDdlPane ? (
                    <ResizablePanelGroup direction="horizontal" autoSaveId="dashboard-compact-workspace" className="flex-1 gap-2">
                      <ResizablePanel id="dashboard-compact-preview" order={1} defaultSize={70} minSize={50}>
                        {renderPreviewPane(true)}
                      </ResizablePanel>

                      <ResizableHandle />

                      <ResizablePanel id="dashboard-compact-ddl" order={2} defaultSize={30} minSize={22}>
                        <div className="workspace-panel h-full overflow-hidden">
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
                        </div>
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  ) : (
                    <div className="flex-1">{renderPreviewPane(true)}</div>
                  )}

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
              ) : showSheetPane && showDdlPane ? (
                  <ResizablePanelGroup direction="horizontal" autoSaveId="dashboard-desktop-all" className="flex-1 gap-2">
                    <ResizablePanel id="dashboard-desktop-sheets" order={1} defaultSize={13} minSize={10} maxSize={20}>
                      <div className="workspace-panel workspace-nav-pane h-full overflow-hidden">
                        <SheetSelector
                          fileId={selectedFileId}
                          selectedSheet={selectedSheet}
                          onSelectSheet={handleSheetSelection}
                        />
                      </div>
                    </ResizablePanel>

                  <ResizableHandle />

                  <ResizablePanel id="dashboard-desktop-preview" order={2} defaultSize={60} minSize={38}>
                    {renderPreviewPane(false)}
                  </ResizablePanel>

                  <ResizableHandle />

                  <ResizablePanel id="dashboard-desktop-ddl" order={3} defaultSize={27} minSize={18}>
                    <div className="workspace-panel h-full overflow-hidden">
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
                    </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
              ) : showSheetPane ? (
                <ResizablePanelGroup direction="horizontal" autoSaveId="dashboard-desktop-sheets-preview" className="flex-1 gap-2">
                  <ResizablePanel id="dashboard-desktop-sheets-only" order={1} defaultSize={16} minSize={11} maxSize={24}>
                    <div className="workspace-panel workspace-nav-pane h-full overflow-hidden">
                      <SheetSelector
                        fileId={selectedFileId}
                        selectedSheet={selectedSheet}
                        onSelectSheet={handleSheetSelection}
                      />
                    </div>
                  </ResizablePanel>

                  <ResizableHandle />

                  <ResizablePanel id="dashboard-desktop-preview-wide" order={2} defaultSize={84} minSize={48}>
                    {renderPreviewPane(false)}
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : showDdlPane ? (
                <ResizablePanelGroup direction="horizontal" autoSaveId="dashboard-desktop-preview-inspector" className="flex-1 gap-2.5">
                  <ResizablePanel id="dashboard-desktop-preview-main" order={1} defaultSize={72} minSize={48}>
                    {renderPreviewPane(false)}
                  </ResizablePanel>

                  <ResizableHandle />

                  <ResizablePanel id="dashboard-desktop-ddl-only" order={2} defaultSize={28} minSize={18}>
                    <div className="workspace-panel h-full overflow-hidden">
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
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <div className="flex-1">
                  {renderPreviewPane(false)}
                </div>
              )}
            </div>
          </main>
        </div>

        <StatusBar />
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
