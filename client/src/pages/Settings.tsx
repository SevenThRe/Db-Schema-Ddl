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
import { Settings as SettingsIcon, Save, ArrowLeft, FolderOpen, FileText } from "lucide-react";
import { Link } from "wouter";
import type { DdlSettings } from "@shared/schema";
import { useTranslation } from "react-i18next";
import {
  MYSQL_ENGINES,
  MYSQL_CHARSETS,
  UTF8MB4_COLLATIONS,
  UTF8_COLLATIONS,
  DEFAULT_HEADER_TEMPLATE,
} from "@shared/mysql-constants";

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
  });

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData, {
      onSuccess: () => {
        toast({
          title: t("settings.saved"),
          description: t("settings.savedSuccess"),
        });
      },
      onError: (error) => {
        toast({
          title: t("settings.saveFailed"),
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const handleChange = (field: keyof DdlSettings, value: string | boolean | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
