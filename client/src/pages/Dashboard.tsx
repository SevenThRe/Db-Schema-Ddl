import { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SheetSelector } from "@/components/SheetSelector";
import { TablePreview } from "@/components/TablePreview";
import { DdlGenerator } from "@/components/DdlGenerator";
import { SpreadsheetViewer } from "@/components/SpreadsheetViewer";
import { SearchDialog } from "@/components/SearchDialog";
import { SchemaDiffPanel } from "@/components/SchemaDiffPanel";
import { DbManagementWorkspace } from "@/components/db-management/DbManagementWorkspace";
import { DdlImportWorkspace } from "@/components/ddl-import/DdlImportWorkspace";
import { ExtensionInstallDialog } from "@/components/extensions/ExtensionInstallDialog";
import { ExtensionStatusDialog } from "@/components/extensions/ExtensionStatusDialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileCode2, Grid3X3, TableProperties, Search, List, LayoutPanelLeft, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useFiles, useSheets } from "@/hooks/use-ddl";
import {
  useDisableExtension,
  useExtension,
  useEnableExtension,
  useRefreshExtensionCatalog,
  useStartExtensionInstall,
} from "@/hooks/use-extensions";
import { useToast } from "@/hooks/use-toast";
import { DB_MANAGEMENT_EXTENSION_ID, type TableInfo } from "@shared/schema";
import { useTranslation } from "react-i18next";

const COMPACT_MAIN_LAYOUT_BREAKPOINT = 1500;
const LAST_SELECTED_SHEET_STORAGE_KEY = "dashboard:lastSelectedSheetByFile";
const LAST_SELECTED_FILE_STORAGE_KEY = "dashboard:lastSelectedFile";
const PREVIEW_ACTION_BUTTON_CLASS =
  "h-8 px-3 gap-1.5 text-[11px] shrink-0 rounded-full border-[color:var(--button-outline)] bg-white/86 font-medium text-[hsl(var(--workspace-ink-soft))] shadow-sm backdrop-blur-md hover:bg-accent/80";

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
  const [isDbManagementTestMode] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return new URLSearchParams(window.location.search).get("db-management-test") === "1";
  });
  const [isDesktopSmokeMode] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return new URLSearchParams(window.location.search).get("desktop-smoke") === "1";
  });
  const canBypassOfficialExtensionGate = isDesktopSmokeMode || isDbManagementTestMode;
  const [initialFileSelection] = useState<StoredFileSelection | null>(() => readStoredFileSelection());
  const initialFileSelectionRef = useRef<StoredFileSelection | null>(initialFileSelection);
  const desktopSmokeAttemptedRef = useRef(false);
  const desktopSmokeSignalRef = useRef({
    requested: false,
    ready: false,
    blocked: false,
  });
  const [selectedFileId, setSelectedFileId] = useState<number | null>(() => {
    const fileId = initialFileSelectionRef.current?.fileId;
    return typeof fileId === "number" ? fileId : null;
  });
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<"workspace" | "db-management" | "ddl-import">("workspace");
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
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [isInstallFlowPending, setIsInstallFlowPending] = useState(false);
  const [isActivationPending, setIsActivationPending] = useState(false);
  const [lastSelectedSheetByFile, setLastSelectedSheetByFile] = useState<StoredSheetSelections>(() =>
    readStoredSheetSelections(),
  );

  const { data: files } = useFiles();
  const { data: sheets, isLoading: isSheetsLoading } = useSheets(selectedFileId);
  const { data: dbManagementExtension, isLoading: isDbManagementExtensionLoading } = useExtension(
    DB_MANAGEMENT_EXTENSION_ID,
  );
  const { mutateAsync: enableExtension, isPending: isEnableMutationPending } = useEnableExtension();
  const { mutateAsync: disableExtension, isPending: isDisableMutationPending } = useDisableExtension();
  const { mutateAsync: refreshExtensionCatalog, isPending: isRefreshCatalogPending } = useRefreshExtensionCatalog();
  const { mutateAsync: startExtensionInstall, isPending: isStartInstallPending } = useStartExtensionInstall();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [appVersion, setAppVersion] = useState<string>("");
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  const emitDesktopSmokeSignal = useCallback(
    (message: string) => {
      if (isDesktopSmokeMode) {
        console.info(`[desktop-smoke] ${message}`);
      }
    },
    [isDesktopSmokeMode],
  );

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

  useEffect(() => {
    if (!window.electronAPI?.getAppVersion) {
      return;
    }

    let mounted = true;
    window.electronAPI
      .getAppVersion()
      .then((version) => {
        if (mounted) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        // Ignore version read errors.
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeModule !== "db-management") {
      return;
    }
    if (canBypassOfficialExtensionGate) {
      return;
    }
    if (dbManagementExtension?.status !== "enabled") {
      setActiveModule("workspace");
    }
  }, [activeModule, canBypassOfficialExtensionGate, dbManagementExtension]);

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
  const layoutLabel = isCompactLayout ? "2-column" : "3-column";
  const versionLabel = appVersion ? `v${appVersion}` : "v--";
  const activeModuleLabel =
    activeModule === "db-management"
      ? "DB Control Center"
      : activeModule === "ddl-import"
        ? "DDL Import Bay"
        : "Definition Workbench";
  const activeModuleDescription =
    activeModule === "db-management"
      ? "连接、快照、差异、历史与应用流程集中在一个操作台里。"
      : activeModule === "ddl-import"
        ? "把现有 DDL、模板与工作簿重新接到同一条生成链路上。"
        : "围绕文件、工作表、表结构预览与 DDL 输出的主工作台。";
  const searchShortcutLabel =
    typeof window !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(window.navigator.platform)
      ? "⌘ P"
      : "Ctrl P";

  const handleManualUpdateCheck = useCallback(async () => {
    if (!window.electronAPI?.checkForUpdates || isCheckingUpdates) {
      return;
    }

    setIsCheckingUpdates(true);
    try {
      const result = await window.electronAPI.checkForUpdates();

      if (!result.ok) {
        toast({
          title: t("errors.common.title"),
          description: result.message || t("errors.common.defaultDesc"),
          variant: "destructive",
        });
        return;
      }

      if (result.updateAvailable) {
        toast({
          title: t("update.available"),
          description: t("update.manualFoundDesc", { version: result.latestVersion }),
        });
        return;
      }

      toast({
        title: t("update.manualCheckedTitle"),
        description: t("update.manualCheckedDesc", { version: result.currentVersion }),
      });
    } catch (error) {
      toast({
        title: t("errors.common.title"),
        description: error instanceof Error ? error.message : t("errors.common.defaultDesc"),
        variant: "destructive",
      });
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [isCheckingUpdates, t, toast]);

  const openOfficialExtensionFlow = useCallback(async () => {
    setIsInstallFlowPending(true);
    try {
      await startExtensionInstall(DB_MANAGEMENT_EXTENSION_ID);
      toast({
        title: "官方扩展",
        description: "官方扩展下载已开始，安装进度会显示在当前面板中。",
      });
    } catch (error) {
      toast({
        title: "官方扩展",
        description: error instanceof Error ? error.message : "无法开始下载官方扩展。",
        variant: "destructive",
      });
    } finally {
      setIsInstallFlowPending(false);
    }
  }, [startExtensionInstall, toast]);

  const refreshOfficialExtensionCatalog = useCallback(async () => {
    try {
      await refreshExtensionCatalog(DB_MANAGEMENT_EXTENSION_ID);
    } catch (error) {
      toast({
        title: "DB 管理",
        description: error instanceof Error ? error.message : "检查扩展更新失败。",
        variant: "destructive",
      });
    }
  }, [refreshExtensionCatalog, toast]);

  const triggerExtensionActivation = useCallback(async () => {
    if (!window.electronAPI?.extensions?.activate) {
      toast({
        title: "DB 管理",
        description: "当前环境暂不支持自动启用扩展，请稍后重启应用。",
      });
      return;
    }

    setIsActivationPending(true);
    try {
      await window.electronAPI.extensions.activate(DB_MANAGEMENT_EXTENSION_ID);
    } catch (error) {
      setIsActivationPending(false);
      throw error;
    }
  }, [toast]);

  const handleDbManagementEntryClick = useCallback(() => {
    if (!canBypassOfficialExtensionGate) {
      void refreshOfficialExtensionCatalog();
    }

    const extension = dbManagementExtension;
    if (!extension || extension.status === "not_installed") {
      if (canBypassOfficialExtensionGate) {
        setActiveModule("db-management");
        return;
      }
      setInstallDialogOpen(true);
      return;
    }

    if (
      extension.status === "disabled" ||
      extension.status === "incompatible" ||
      extension.updateAvailable ||
      extension.lifecycle?.stage === "failed"
    ) {
      if (canBypassOfficialExtensionGate) {
        setActiveModule("db-management");
        return;
      }
      setStatusDialogOpen(true);
      return;
    }

    setActiveModule("db-management");
  }, [canBypassOfficialExtensionGate, dbManagementExtension, refreshOfficialExtensionCatalog]);

  useEffect(() => {
    if (!isDesktopSmokeMode || isDbManagementExtensionLoading || desktopSmokeAttemptedRef.current) {
      return;
    }

    desktopSmokeAttemptedRef.current = true;
    if (!desktopSmokeSignalRef.current.requested) {
      desktopSmokeSignalRef.current.requested = true;
      emitDesktopSmokeSignal("db-management-entry-requested");
    }
    handleDbManagementEntryClick();
  }, [
    emitDesktopSmokeSignal,
    handleDbManagementEntryClick,
    isDbManagementExtensionLoading,
    isDesktopSmokeMode,
  ]);

  useEffect(() => {
    if (!isDesktopSmokeMode || desktopSmokeSignalRef.current.ready || activeModule !== "db-management") {
      return;
    }

    desktopSmokeSignalRef.current.ready = true;
    emitDesktopSmokeSignal("db-management-ready");
  }, [activeModule, emitDesktopSmokeSignal, isDesktopSmokeMode]);

  useEffect(() => {
    if (!isDesktopSmokeMode || desktopSmokeSignalRef.current.blocked) {
      return;
    }

    if (installDialogOpen) {
      desktopSmokeSignalRef.current.blocked = true;
      emitDesktopSmokeSignal("db-management-blocked:not-installed");
      return;
    }

    if (statusDialogOpen) {
      desktopSmokeSignalRef.current.blocked = true;
      emitDesktopSmokeSignal("db-management-blocked:status-dialog");
    }
  }, [emitDesktopSmokeSignal, installDialogOpen, isDesktopSmokeMode, statusDialogOpen]);

  const handleEnableAndActivateExtension = useCallback(async () => {
    try {
      await enableExtension(DB_MANAGEMENT_EXTENSION_ID);
      await triggerExtensionActivation();
    } catch (error) {
      toast({
        title: "DB 管理",
        description: error instanceof Error ? error.message : "启用扩展失败。",
        variant: "destructive",
      });
    }
  }, [enableExtension, toast, triggerExtensionActivation]);

  const handleDisableExtension = useCallback(async () => {
    try {
      await disableExtension(DB_MANAGEMENT_EXTENSION_ID);
      setActiveModule("workspace");
      toast({
        title: "DB 管理",
        description: "扩展已禁用。",
      });
    } catch (error) {
      toast({
        title: "DB 管理",
        description: error instanceof Error ? error.message : "禁用扩展失败。",
        variant: "destructive",
      });
    }
  }, [disableExtension, toast]);

  const renderPreviewPane = (showSheetTrigger: boolean) => (
    <div className="flex h-full min-w-0 flex-col bg-transparent">
      <div className="shrink-0 border-b border-white/70 bg-white/70 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="section-kicker">Preview Surface</p>
            <p className="mt-1 text-sm text-muted-foreground">
              在同一个数据画布里切换自动解析、原始工作表与 schema 差异。
            </p>
          </div>

          <div className="min-w-0 flex items-center gap-1.5 overflow-x-auto">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <TabsList className="h-auto rounded-full border border-white/80 bg-[hsl(var(--panel-muted)/0.88)] p-1 shadow-sm">
              <TabsTrigger value="auto" className="h-8 gap-1.5 rounded-full px-3 text-[11px] font-medium">
                <TableProperties className="w-3 h-3" />
                {t("view.autoParse")}
              </TabsTrigger>
              <TabsTrigger value="spreadsheet" className="h-8 gap-1.5 rounded-full px-3 text-[11px] font-medium">
                <Grid3X3 className="w-3 h-3" />
                {t("view.spreadsheet")}
              </TabsTrigger>
              <TabsTrigger value="diff" className="h-8 gap-1.5 rounded-full px-3 text-[11px] font-medium">
                <Sparkles className="w-3 h-3" />
                Diff
              </TabsTrigger>
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

        {viewMode === "spreadsheet" && regionTables && regionTables.length > 0 && (
          <span className="status-pill">
            ✓ {t("table.tablesParsedFromSelection", { count: regionTables.length })}
          </span>
        )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-[linear-gradient(180deg,hsl(var(--panel-muted)/0.55),hsl(var(--background)/0.32))]">
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
        ) : (
          <SchemaDiffPanel fileId={selectedFileId} sheetName={selectedSheet} />
        )}
      </div>
    </div>
  );

  const renderDbManagementWorkspace = () => (
    <DbManagementWorkspace
      onBack={() => setActiveModule("workspace")}
      onActivateFile={(fileId) => {
        setSelectedFileId(fileId);
        setActiveModule("workspace");
      }}
      selectedFileId={selectedFileId}
      selectedFileName={selectedFileName}
      selectedSheet={selectedSheet}
    />
  );

  const renderDdlImportWorkspace = () => (
    <DdlImportWorkspace
      onBack={() => setActiveModule("workspace")}
      onActivateFile={(fileId) => {
        setSelectedFileId(fileId);
        setActiveModule("workspace");
      }}
    />
  );

  return (
    <div className="h-screen w-full overflow-hidden p-3">
      <div className="workbench-shell flex h-full flex-col">
        <header className="relative z-10 shrink-0 border-b border-white/70 bg-[linear-gradient(135deg,hsl(var(--background)/0.96),hsl(var(--panel-muted)/0.86))] px-4 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 max-w-3xl">
              <p className="section-kicker">Schema Workbench</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant={activeModule === "workspace" ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-full px-4 text-[11px]"
                  onClick={() => setActiveModule("workspace")}
                >
                  <TableProperties className="mr-1.5 h-3.5 w-3.5" />
                  Definition
                </Button>
                <Button
                  variant={activeModule === "db-management" ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-full px-4 text-[11px]"
                  onClick={handleDbManagementEntryClick}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  DB Control
                </Button>
                <Button
                  variant={activeModule === "ddl-import" ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-full px-4 text-[11px]"
                  onClick={() => setActiveModule("ddl-import")}
                >
                  <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
                  DDL Import
                </Button>
              </div>
              <h1 className="section-headline mt-4">
                {activeModuleLabel}
              </h1>
              <p className="section-copy mt-2 max-w-2xl">
                {activeModuleDescription}
              </p>
            </div>

            <div className="panel-surface-muted grid gap-3 p-3 sm:grid-cols-2 xl:min-w-[420px] xl:max-w-[480px]">
              <div className="space-y-1">
                <p className="section-kicker">Active File</p>
                <p className="truncate text-sm font-semibold text-[hsl(var(--workspace-ink))]">
                  {selectedFileName || t("sidebar.noFilesYet")}
                </p>
                <p className="text-[11px] text-muted-foreground">当前编辑对象与 DDL 输出上下文。</p>
              </div>
              <div className="space-y-1">
                <p className="section-kicker">Current Sheet</p>
                <p className="truncate text-sm font-semibold text-[hsl(var(--workspace-ink))]">
                  {selectedSheet || t("sheet.selectSheet")}
                </p>
                <p className="text-[11px] text-muted-foreground">让文件、工作表与当前模块保持同一条认知链路。</p>
              </div>
              <div className="status-pill justify-between">
                <span className="inline-flex items-center gap-2">
                  <LayoutPanelLeft className="h-3.5 w-3.5" />
                  Workspace
                </span>
                <span>{layoutLabel}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 justify-between rounded-2xl border-white/80 bg-white/82 px-3 text-[11px] font-medium"
                onClick={handleManualUpdateCheck}
                disabled={isCheckingUpdates || !window.electronAPI?.checkForUpdates}
              >
                <span className="inline-flex items-center gap-2">
                  {isCheckingUpdates ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                  Release
                </span>
                <span>{versionLabel}</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
        <Sidebar
          selectedFileId={selectedFileId}
          onSelectFile={setSelectedFileId}
          dbManagementState={dbManagementExtension ?? null}
          dbManagementSelected={activeModule === "db-management"}
          onSelectDbManagement={handleDbManagementEntryClick}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="overflow-hidden border-r border-white/60"
        />

        <main className="min-w-0 flex-1 overflow-hidden p-3">
          <div className="panel-surface flex h-full min-w-0 overflow-hidden">
            {activeModule === "ddl-import" ? (
              renderDdlImportWorkspace()
            ) : activeModule === "db-management" &&
              (dbManagementExtension?.status === "enabled" || canBypassOfficialExtensionGate) ? (
              renderDbManagementWorkspace()
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
                      onOpenImportWorkspace={() => setActiveModule("ddl-import")}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>

                <Sheet open={sheetSelectorOpen} onOpenChange={setSheetSelectorOpen}>
                  <SheetContent side="left" className="flex w-[min(92vw,360px)] flex-col p-0 sm:max-w-[360px]">
                    <SheetHeader className="border-b border-border/60 px-4 py-3">
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
                    onOpenImportWorkspace={() => setActiveModule("ddl-import")}
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

      <ExtensionInstallDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        extension={dbManagementExtension ?? null}
        isPending={isInstallFlowPending || isStartInstallPending || isActivationPending || isRefreshCatalogPending}
        onInstall={openOfficialExtensionFlow}
        onActivate={triggerExtensionActivation}
        onRefreshCatalog={refreshOfficialExtensionCatalog}
      />

      <ExtensionStatusDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        extension={dbManagementExtension ?? null}
        isPending={
          isEnableMutationPending ||
          isInstallFlowPending ||
          isActivationPending ||
          isRefreshCatalogPending ||
          isStartInstallPending
        }
        primaryActionLabel={
          dbManagementExtension?.updateAvailable || dbManagementExtension?.status === "incompatible"
            ? "更新扩展"
            : dbManagementExtension?.lifecycle?.stage === "failed"
              ? "重新安装"
              : "启用并重启"
        }
        onPrimaryAction={
          dbManagementExtension?.updateAvailable ||
          dbManagementExtension?.status === "incompatible" ||
          dbManagementExtension?.lifecycle?.stage === "failed"
            ? openOfficialExtensionFlow
            : handleEnableAndActivateExtension
        }
      />
    </div>
  );
}
