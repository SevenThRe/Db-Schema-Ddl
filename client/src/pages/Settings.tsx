import { useState, useEffect } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-ddl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Save, ArrowLeft, FolderOpen, FileText, Code2 } from "lucide-react";
import { Link } from "wouter";
import type { DdlSettings } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { translateApiError } from "@/lib/api-error";
import {
  MYSQL_ENGINES,
  MYSQL_CHARSETS,
  UTF8MB4_COLLATIONS,
  UTF8_COLLATIONS,
  DEFAULT_HEADER_TEMPLATE,
} from "@shared/mysql-constants";

const MYSQL_DATA_TYPE_CASE_OPTIONS = [
  { value: "lower", label: "lowercase (varchar, bigint, datetime)" },
  { value: "upper", label: "UPPERCASE (VARCHAR, BIGINT, DATETIME)" },
] as const;

const MYSQL_BOOLEAN_MODE_OPTIONS = [
  { value: "tinyint(1)", label: "tinyint(1)" },
  { value: "boolean", label: "boolean" },
] as const;

const DEFAULT_PK_MARKERS = ["\u3007"];

function normalizePkMarkersInput(input: string): string[] {
  const markers = input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const uniqueMarkers = Array.from(new Set(markers));
  return uniqueMarkers.length > 0 ? uniqueMarkers : DEFAULT_PK_MARKERS;
}

function markersToInputValue(markers?: string[]): string {
  const source = Array.isArray(markers) && markers.length > 0 ? markers : DEFAULT_PK_MARKERS;
  return source.join(", ");
}

function parseIntegerInput(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [formData, setFormData] = useState<DdlSettings>({
    mysqlEngine: "InnoDB",
    mysqlCharset: "utf8mb4",
    mysqlCollate: "utf8mb4_bin",
    varcharCharset: "utf8mb4",
    varcharCollate: "utf8mb4_bin",
    exportFilenamePrefix: "Crt_",
    exportFilenameSuffix: "",
    includeCommentHeader: true,
    authorName: "ISI",
    includeSetNames: true,
    includeDropTable: true,
    downloadPath: undefined,
    excelReadPath: undefined,
    customHeaderTemplate: undefined,
    useCustomHeader: false,
    mysqlDataTypeCase: "lower",
    mysqlBooleanMode: "tinyint(1)",
    pkMarkers: DEFAULT_PK_MARKERS,
    maxConsecutiveEmptyRows: 10,
    uploadRateLimitWindowMs: 60000,
    uploadRateLimitMaxRequests: 20,
    parseRateLimitWindowMs: 60000,
    parseRateLimitMaxRequests: 40,
    globalProtectRateLimitWindowMs: 60000,
    globalProtectRateLimitMaxRequests: 240,
    globalProtectMaxInFlight: 80,
    prewarmEnabled: true,
    prewarmMaxConcurrency: 1,
    prewarmQueueMax: 12,
    prewarmMaxFileMb: 20,
    taskManagerMaxQueueLength: 200,
    taskManagerStalePendingMs: 1800000,
  });
  const [pkMarkersInput, setPkMarkersInput] = useState(markersToInputValue(DEFAULT_PK_MARKERS));

  // 开发者模式状态（localStorage）
  const [developerMode, setDeveloperMode] = useState(() => {
    return localStorage.getItem("developerMode") === "true";
  });

  const handleDeveloperModeChange = (enabled: boolean) => {
    localStorage.setItem("developerMode", String(enabled));
    setDeveloperMode(enabled);
    toast({
      title: enabled
        ? t("settings.developer.enabledTitle")
        : t("settings.developer.disabledTitle"),
      description: enabled
        ? t("settings.developer.enabledDesc")
        : t("settings.developer.disabledDesc"),
    });
  };

  useEffect(() => {
    if (settings) {
      setFormData(settings);
      setPkMarkersInput(markersToInputValue(settings.pkMarkers));
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPkMarkers = normalizePkMarkersInput(pkMarkersInput);
    const payload: DdlSettings = {
      ...formData,
      pkMarkers: normalizedPkMarkers,
    };
    updateSettings(payload, {
      onSuccess: () => {
        setPkMarkersInput(markersToInputValue(normalizedPkMarkers));
        toast({
          title: t("settings.saved"),
          description: t("settings.savedSuccess"),
        });
      },
      onError: (error) => {
        const translated = translateApiError(error, t, { includeIssues: false });
        toast({
          title: translated.title || t("settings.saveFailed"),
          description: translated.description,
          variant: "destructive",
        });
      },
    });
  };

  const handleChange = (field: keyof DdlSettings, value: string | boolean | number | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNumberChange = (
    field: keyof DdlSettings,
    value: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    handleChange(field, parseIntegerInput(value, fallback, min, max));
  };

  // Electron 環境でのディレクトリ選択
  const handleSelectDirectory = async (field: 'downloadPath' | 'excelReadPath') => {
    if (window.electronAPI) {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        handleChange(field, path);
      }
    } else {
      toast({
        title: t("settings.notInElectron"),
        description: t("settings.notInElectronDesc"),
        variant: "destructive",
      });
    }
  };

  // デフォルトテンプレートを使用
  const useDefaultTemplate = () => {
    handleChange("customHeaderTemplate", DEFAULT_HEADER_TEMPLATE);
  };

  // 照合順序の選択肢を文字セットに応じて動的に変更
  const getCollationOptions = (charset: string) => {
    if (charset === 'utf8mb4') {
      return UTF8MB4_COLLATIONS;
    } else if (charset === 'utf8' || charset === 'utf8mb3') {
      return UTF8_COLLATIONS;
    }
    // その他の文字セットの場合はデフォルトのみ
    return [{ value: `${charset}_bin`, label: `${charset}_bin` }];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t("settings.loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("settings.backToDashboard")}
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold">{t("settings.title")}</h1>
          </div>
          <p className="text-muted-foreground">
            {t("settings.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* DDL Generation Options */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold mb-4">{t("settings.ddlOptions.title")}</h2>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="includeCommentHeader">{t("settings.ddlOptions.includeCommentHeader")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.ddlOptions.includeCommentHeaderDesc")}
                </p>
              </div>
              <Switch
                id="includeCommentHeader"
                checked={formData.includeCommentHeader}
                onCheckedChange={(checked) => handleChange("includeCommentHeader", checked)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="authorName">{t("settings.ddlOptions.authorName")}</Label>
              <Input
                id="authorName"
                value={formData.authorName}
                onChange={(e) => handleChange("authorName", e.target.value)}
                placeholder="ISI"
                disabled={!formData.includeCommentHeader}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.ddlOptions.authorNameDesc")}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="includeSetNames">{t("settings.ddlOptions.includeSetNames")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.ddlOptions.includeSetNamesDesc")}
                </p>
              </div>
              <Switch
                id="includeSetNames"
                checked={formData.includeSetNames}
                onCheckedChange={(checked) => handleChange("includeSetNames", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="includeDropTable">{t("settings.ddlOptions.includeDropTable")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.ddlOptions.includeDropTableDesc")}
                </p>
              </div>
              <Switch
                id="includeDropTable"
                checked={formData.includeDropTable}
                onCheckedChange={(checked) => handleChange("includeDropTable", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="useCustomHeader">{t("settings.ddlOptions.useCustomHeader")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.ddlOptions.useCustomHeaderDesc")}
                </p>
              </div>
              <Switch
                id="useCustomHeader"
                checked={formData.useCustomHeader}
                onCheckedChange={(checked) => handleChange("useCustomHeader", checked)}
                disabled={!formData.includeCommentHeader}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="customHeaderTemplate">{t("settings.ddlOptions.customHeaderTemplate")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={useDefaultTemplate}
                  disabled={!formData.includeCommentHeader || !formData.useCustomHeader}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  {t("settings.ddlOptions.useDefaultTemplate")}
                </Button>
              </div>
              <Textarea
                id="customHeaderTemplate"
                value={formData.customHeaderTemplate || ""}
                onChange={(e) => handleChange("customHeaderTemplate", e.target.value || undefined)}
                placeholder="TableName: ${logical_name}&#10;Author: ${author}&#10;Date: ${date}"
                rows={6}
                disabled={!formData.includeCommentHeader || !formData.useCustomHeader}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.ddlOptions.customHeaderTemplateDesc")}
              </p>
            </div>
          </div>

          {/* MySQL Settings */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">{t("settings.mysql.title")}</h2>

            <div className="space-y-2">
              <Label htmlFor="mysqlEngine">{t("settings.mysql.engine")}</Label>
              <Select
                value={formData.mysqlEngine}
                onValueChange={(value) => handleChange("mysqlEngine", value)}
              >
                <SelectTrigger id="mysqlEngine">
                  <SelectValue placeholder={t("settings.mysql.enginePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {MYSQL_ENGINES.map((engine) => (
                    <SelectItem key={engine.value} value={engine.value}>
                      {engine.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("settings.mysql.engineDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mysqlCharset">{t("settings.mysql.charset")}</Label>
              <Select
                value={formData.mysqlCharset}
                onValueChange={(value) => handleChange("mysqlCharset", value)}
              >
                <SelectTrigger id="mysqlCharset">
                  <SelectValue placeholder={t("settings.mysql.charsetPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {MYSQL_CHARSETS.map((charset) => (
                    <SelectItem key={charset.value} value={charset.value}>
                      {charset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("settings.mysql.charsetDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mysqlCollate">{t("settings.mysql.collation")}</Label>
              <Select
                value={formData.mysqlCollate}
                onValueChange={(value) => handleChange("mysqlCollate", value)}
              >
                <SelectTrigger id="mysqlCollate">
                  <SelectValue placeholder={t("settings.mysql.collationPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {getCollationOptions(formData.mysqlCharset).map((collation) => (
                    <SelectItem key={collation.value} value={collation.value}>
                      {collation.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("settings.mysql.collationDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mysqlDataTypeCase">{t("settings.mysql.dataTypeCase")}</Label>
              <Select
                value={formData.mysqlDataTypeCase}
                onValueChange={(value) => handleChange("mysqlDataTypeCase", value as DdlSettings["mysqlDataTypeCase"])}
              >
                <SelectTrigger id="mysqlDataTypeCase">
                  <SelectValue placeholder={t("settings.mysql.dataTypeCasePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {MYSQL_DATA_TYPE_CASE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("settings.mysql.dataTypeCaseDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mysqlBooleanMode">{t("settings.mysql.booleanMode")}</Label>
              <Select
                value={formData.mysqlBooleanMode}
                onValueChange={(value) => handleChange("mysqlBooleanMode", value as DdlSettings["mysqlBooleanMode"])}
              >
                <SelectTrigger id="mysqlBooleanMode">
                  <SelectValue placeholder={t("settings.mysql.booleanModePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {MYSQL_BOOLEAN_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("settings.mysql.booleanModeDesc")}
              </p>
            </div>
          </div>

          {/* VARCHAR Settings */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">{t("settings.varchar.title")}</h2>

            <div className="space-y-2">
              <Label htmlFor="varcharCharset">{t("settings.varchar.charset")}</Label>
              <Select
                value={formData.varcharCharset}
                onValueChange={(value) => handleChange("varcharCharset", value)}
              >
                <SelectTrigger id="varcharCharset">
                  <SelectValue placeholder={t("settings.varchar.charsetPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {MYSQL_CHARSETS.map((charset) => (
                    <SelectItem key={charset.value} value={charset.value}>
                      {charset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("settings.varchar.charsetDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="varcharCollate">{t("settings.varchar.collation")}</Label>
              <Select
                value={formData.varcharCollate}
                onValueChange={(value) => handleChange("varcharCollate", value)}
              >
                <SelectTrigger id="varcharCollate">
                  <SelectValue placeholder={t("settings.varchar.collationPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {getCollationOptions(formData.varcharCharset).map((collation) => (
                    <SelectItem key={collation.value} value={collation.value}>
                      {collation.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("settings.varchar.collationDesc")}
              </p>
            </div>
          </div>

          {/* Export Settings */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">{t("settings.export.title")}</h2>

            <div className="space-y-2">
              <Label htmlFor="exportFilenamePrefix">{t("settings.export.filenamePrefix")}</Label>
              <Input
                id="exportFilenamePrefix"
                value={formData.exportFilenamePrefix}
                onChange={(e) =>
                  handleChange("exportFilenamePrefix", e.target.value)
                }
                placeholder="Crt_"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.export.filenamePrefixDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="exportFilenameSuffix">{t("settings.export.filenameSuffix")}</Label>
              <Input
                id="exportFilenameSuffix"
                value={formData.exportFilenameSuffix}
                onChange={(e) =>
                  handleChange("exportFilenameSuffix", e.target.value)
                }
                placeholder="_ISI or _${date}"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.export.filenameSuffixDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="downloadPath">{t("settings.export.downloadPath")}</Label>
              <div className="flex gap-2">
                <Input
                  id="downloadPath"
                  value={formData.downloadPath || ""}
                  onChange={(e) =>
                    handleChange("downloadPath", e.target.value || undefined)
                  }
                  placeholder="/path/to/downloads"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleSelectDirectory('downloadPath')}
                  title={t("settings.export.selectFolder")}
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.export.downloadPathDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="excelReadPath">{t("settings.export.excelReadPath")}</Label>
              <div className="flex gap-2">
                <Input
                  id="excelReadPath"
                  value={formData.excelReadPath || ""}
                  onChange={(e) =>
                    handleChange("excelReadPath", e.target.value || undefined)
                  }
                  placeholder="/path/to/excel/files"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleSelectDirectory('excelReadPath')}
                  title={t("settings.export.selectFolder")}
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.export.excelReadPathDesc")}
              </p>
            </div>
          </div>

          {/* Excel Parsing Settings */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">{t("settings.parsing.title")}</h2>

            <div className="space-y-2">
              <Label htmlFor="maxConsecutiveEmptyRows">{t("settings.parsing.maxConsecutiveEmptyRows")}</Label>
              <Input
                id="maxConsecutiveEmptyRows"
                type="number"
                min="1"
                max="100"
                value={formData.maxConsecutiveEmptyRows || 10}
                onChange={(e) =>
                  handleChange("maxConsecutiveEmptyRows", parseInt(e.target.value) || 10)
                }
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.parsing.maxConsecutiveEmptyRowsDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pkMarkers">{t("settings.parsing.pkMarkers")}</Label>
              <Textarea
                id="pkMarkers"
                value={pkMarkersInput}
                onChange={(e) => setPkMarkersInput(e.target.value)}
                rows={2}
                placeholder="〇, ○, Y, 1"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.parsing.pkMarkersDesc")}
              </p>
            </div>
          </div>

          {/* Developer Mode */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-5">
            <div className="flex items-center gap-3 mb-4">
              <Code2 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">{t("settings.developer.title")}</h2>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="developerMode">{t("settings.developer.modeLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.developer.modeDesc")}
                </p>
              </div>
              <Switch
                id="developerMode"
                checked={developerMode}
                onCheckedChange={handleDeveloperModeChange}
              />
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">{t("settings.developer.shortcutTitle")}</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>
                  <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px] font-mono">F12</kbd>
                  {" "}
                  - {t("settings.developer.shortcutF12")}
                </li>
                <li>{t("settings.developer.persistHint")}</li>
              </ul>
            </div>

            <div className="border border-border rounded-lg p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">Runtime Guard Tuning</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Advanced operational thresholds. Hard caps are still enforced server-side.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="uploadRateLimitWindowMs">Upload rate window (ms)</Label>
                  <Input
                    id="uploadRateLimitWindowMs"
                    type="number"
                    min="1000"
                    max="300000"
                    value={formData.uploadRateLimitWindowMs}
                    onChange={(e) =>
                      handleNumberChange("uploadRateLimitWindowMs", e.target.value, 60000, 1000, 300000)
                    }
                    disabled={!developerMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="uploadRateLimitMaxRequests">Upload max requests</Label>
                  <Input
                    id="uploadRateLimitMaxRequests"
                    type="number"
                    min="1"
                    max="500"
                    value={formData.uploadRateLimitMaxRequests}
                    onChange={(e) =>
                      handleNumberChange("uploadRateLimitMaxRequests", e.target.value, 20, 1, 500)
                    }
                    disabled={!developerMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="parseRateLimitWindowMs">Parse rate window (ms)</Label>
                  <Input
                    id="parseRateLimitWindowMs"
                    type="number"
                    min="1000"
                    max="300000"
                    value={formData.parseRateLimitWindowMs}
                    onChange={(e) =>
                      handleNumberChange("parseRateLimitWindowMs", e.target.value, 60000, 1000, 300000)
                    }
                    disabled={!developerMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="parseRateLimitMaxRequests">Parse max requests</Label>
                  <Input
                    id="parseRateLimitMaxRequests"
                    type="number"
                    min="1"
                    max="1000"
                    value={formData.parseRateLimitMaxRequests}
                    onChange={(e) =>
                      handleNumberChange("parseRateLimitMaxRequests", e.target.value, 40, 1, 1000)
                    }
                    disabled={!developerMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="globalProtectRateLimitWindowMs">Global protect window (ms)</Label>
                  <Input
                    id="globalProtectRateLimitWindowMs"
                    type="number"
                    min="1000"
                    max="300000"
                    value={formData.globalProtectRateLimitWindowMs}
                    onChange={(e) =>
                      handleNumberChange(
                        "globalProtectRateLimitWindowMs",
                        e.target.value,
                        60000,
                        1000,
                        300000,
                      )
                    }
                    disabled={!developerMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="globalProtectRateLimitMaxRequests">Global protect max requests</Label>
                  <Input
                    id="globalProtectRateLimitMaxRequests"
                    type="number"
                    min="10"
                    max="5000"
                    value={formData.globalProtectRateLimitMaxRequests}
                    onChange={(e) =>
                      handleNumberChange(
                        "globalProtectRateLimitMaxRequests",
                        e.target.value,
                        240,
                        10,
                        5000,
                      )
                    }
                    disabled={!developerMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="globalProtectMaxInFlight">Global protect max in-flight</Label>
                  <Input
                    id="globalProtectMaxInFlight"
                    type="number"
                    min="1"
                    max="500"
                    value={formData.globalProtectMaxInFlight}
                    onChange={(e) =>
                      handleNumberChange("globalProtectMaxInFlight", e.target.value, 80, 1, 500)
                    }
                    disabled={!developerMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prewarmMaxConcurrency">Prewarm max concurrency</Label>
                  <Input
                    id="prewarmMaxConcurrency"
                    type="number"
                    min="1"
                    max="8"
                    value={formData.prewarmMaxConcurrency}
                    onChange={(e) =>
                      handleNumberChange("prewarmMaxConcurrency", e.target.value, 1, 1, 8)
                    }
                    disabled={!developerMode || !formData.prewarmEnabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prewarmQueueMax">Prewarm queue max</Label>
                  <Input
                    id="prewarmQueueMax"
                    type="number"
                    min="1"
                    max="100"
                    value={formData.prewarmQueueMax}
                    onChange={(e) =>
                      handleNumberChange("prewarmQueueMax", e.target.value, 12, 1, 100)
                    }
                    disabled={!developerMode || !formData.prewarmEnabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prewarmMaxFileMb">Prewarm max file (MB)</Label>
                  <Input
                    id="prewarmMaxFileMb"
                    type="number"
                    min="1"
                    max="100"
                    value={formData.prewarmMaxFileMb}
                    onChange={(e) =>
                      handleNumberChange("prewarmMaxFileMb", e.target.value, 20, 1, 100)
                    }
                    disabled={!developerMode || !formData.prewarmEnabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taskManagerMaxQueueLength">Task queue max length</Label>
                  <Input
                    id="taskManagerMaxQueueLength"
                    type="number"
                    min="10"
                    max="1000"
                    value={formData.taskManagerMaxQueueLength}
                    onChange={(e) =>
                      handleNumberChange("taskManagerMaxQueueLength", e.target.value, 200, 10, 1000)
                    }
                    disabled={!developerMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taskManagerStalePendingMs">Task stale pending timeout (ms)</Label>
                  <Input
                    id="taskManagerStalePendingMs"
                    type="number"
                    min="60000"
                    max="3600000"
                    value={formData.taskManagerStalePendingMs}
                    onChange={(e) =>
                      handleNumberChange(
                        "taskManagerStalePendingMs",
                        e.target.value,
                        1800000,
                        60000,
                        3600000,
                      )
                    }
                    disabled={!developerMode}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border rounded-md px-3 py-2">
                <div className="space-y-0.5">
                  <Label htmlFor="prewarmEnabled">Enable prewarm</Label>
                  <p className="text-xs text-muted-foreground">
                    Disable to reduce background parse workload.
                  </p>
                </div>
                <Switch
                  id="prewarmEnabled"
                  checked={formData.prewarmEnabled}
                  onCheckedChange={(checked) => handleChange("prewarmEnabled", checked)}
                  disabled={!developerMode}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/">
              <Button type="button" variant="outline">
                {t("settings.cancel")}
              </Button>
            </Link>
            <Button type="submit" disabled={isPending} className="min-w-32">
              {isPending ? (
                t("settings.saving")
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {t("settings.save")}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
