import { useState, useEffect } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-ddl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Save, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import type { DdlSettings } from "@shared/schema";
import { useTranslation } from "react-i18next";

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
    includeCommentHeader: true,
    authorName: "ISI",
    includeSetNames: true,
    includeDropTable: true,
    downloadPath: undefined,
    excelReadPath: undefined,
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
          </div>

          {/* MySQL Settings */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">{t("settings.mysql.title")}</h2>

            <div className="space-y-2">
              <Label htmlFor="mysqlEngine">{t("settings.mysql.engine")}</Label>
              <Input
                id="mysqlEngine"
                value={formData.mysqlEngine}
                onChange={(e) => handleChange("mysqlEngine", e.target.value)}
                placeholder="InnoDB"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.mysql.engineDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mysqlCharset">{t("settings.mysql.charset")}</Label>
              <Input
                id="mysqlCharset"
                value={formData.mysqlCharset}
                onChange={(e) => handleChange("mysqlCharset", e.target.value)}
                placeholder="utf8mb4"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.mysql.charsetDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mysqlCollate">{t("settings.mysql.collation")}</Label>
              <Input
                id="mysqlCollate"
                value={formData.mysqlCollate}
                onChange={(e) => handleChange("mysqlCollate", e.target.value)}
                placeholder="utf8mb4_bin"
              />
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
              <Input
                id="varcharCharset"
                value={formData.varcharCharset}
                onChange={(e) => handleChange("varcharCharset", e.target.value)}
                placeholder="utf8mb4"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.varchar.charsetDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="varcharCollate">{t("settings.varchar.collation")}</Label>
              <Input
                id="varcharCollate"
                value={formData.varcharCollate}
                onChange={(e) => handleChange("varcharCollate", e.target.value)}
                placeholder="utf8mb4_bin"
              />
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
              <Label htmlFor="downloadPath">{t("settings.export.downloadPath")}</Label>
              <Input
                id="downloadPath"
                value={formData.downloadPath || ""}
                onChange={(e) =>
                  handleChange("downloadPath", e.target.value || undefined)
                }
                placeholder="/path/to/downloads"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.export.downloadPathDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="excelReadPath">{t("settings.export.excelReadPath")}</Label>
              <Input
                id="excelReadPath"
                value={formData.excelReadPath || ""}
                onChange={(e) =>
                  handleChange("excelReadPath", e.target.value || undefined)
                }
                placeholder="/path/to/excel/files"
              />
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
