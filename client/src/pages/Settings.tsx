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

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const { toast } = useToast();

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
          title: "Settings saved",
          description: "Your DDL settings have been updated successfully.",
        });
      },
      onError: (error) => {
        toast({
          title: "Failed to save settings",
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
        <p className="text-muted-foreground">Loading settings...</p>
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
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold">DDL Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Configure default parameters for DDL generation and file handling
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* DDL Generation Options */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold mb-4">DDL Generation Options</h2>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="includeCommentHeader">Include Comment Header</Label>
                <p className="text-xs text-muted-foreground">
                  Add comment block with table name, author, and date at the top of DDL
                </p>
              </div>
              <Switch
                id="includeCommentHeader"
                checked={formData.includeCommentHeader}
                onCheckedChange={(checked) => handleChange("includeCommentHeader", checked)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="authorName">Author Name</Label>
              <Input
                id="authorName"
                value={formData.authorName}
                onChange={(e) => handleChange("authorName", e.target.value)}
                placeholder="ISI"
                disabled={!formData.includeCommentHeader}
              />
              <p className="text-xs text-muted-foreground">
                Author name shown in comment header. Default: ISI
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="includeSetNames">Include SET NAMES Statement</Label>
                <p className="text-xs text-muted-foreground">
                  Add SET NAMES statement before CREATE TABLE
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
                <Label htmlFor="includeDropTable">Include DROP TABLE Statement</Label>
                <p className="text-xs text-muted-foreground">
                  Add DROP TABLE IF EXISTS before CREATE TABLE
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
            <h2 className="text-lg font-semibold mb-4">MySQL Settings</h2>

            <div className="space-y-2">
              <Label htmlFor="mysqlEngine">Engine</Label>
              <Input
                id="mysqlEngine"
                value={formData.mysqlEngine}
                onChange={(e) => handleChange("mysqlEngine", e.target.value)}
                placeholder="InnoDB"
              />
              <p className="text-xs text-muted-foreground">
                Storage engine for tables. Default: InnoDB
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mysqlCharset">Character Set</Label>
              <Input
                id="mysqlCharset"
                value={formData.mysqlCharset}
                onChange={(e) => handleChange("mysqlCharset", e.target.value)}
                placeholder="utf8mb4"
              />
              <p className="text-xs text-muted-foreground">
                Default character set for tables. Default: utf8mb4
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mysqlCollate">Collation</Label>
              <Input
                id="mysqlCollate"
                value={formData.mysqlCollate}
                onChange={(e) => handleChange("mysqlCollate", e.target.value)}
                placeholder="utf8mb4_bin"
              />
              <p className="text-xs text-muted-foreground">
                Default collation for tables. Default: utf8mb4_bin
              </p>
            </div>
          </div>

          {/* VARCHAR Settings */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">VARCHAR/CHAR Settings</h2>

            <div className="space-y-2">
              <Label htmlFor="varcharCharset">Character Set</Label>
              <Input
                id="varcharCharset"
                value={formData.varcharCharset}
                onChange={(e) => handleChange("varcharCharset", e.target.value)}
                placeholder="utf8mb4"
              />
              <p className="text-xs text-muted-foreground">
                Character set for VARCHAR and CHAR columns. Default: utf8mb4
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="varcharCollate">Collation</Label>
              <Input
                id="varcharCollate"
                value={formData.varcharCollate}
                onChange={(e) => handleChange("varcharCollate", e.target.value)}
                placeholder="utf8mb4_bin"
              />
              <p className="text-xs text-muted-foreground">
                Collation for VARCHAR and CHAR columns. Default: utf8mb4_bin
              </p>
            </div>
          </div>

          {/* Export Settings */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">Export Settings</h2>

            <div className="space-y-2">
              <Label htmlFor="exportFilenamePrefix">Filename Prefix</Label>
              <Input
                id="exportFilenamePrefix"
                value={formData.exportFilenamePrefix}
                onChange={(e) =>
                  handleChange("exportFilenamePrefix", e.target.value)
                }
                placeholder="Crt_"
              />
              <p className="text-xs text-muted-foreground">
                Prefix for exported DDL files. Example: Crt_menus.sql. Default: Crt_
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="downloadPath">Download Path (Desktop Only)</Label>
              <Input
                id="downloadPath"
                value={formData.downloadPath || ""}
                onChange={(e) =>
                  handleChange("downloadPath", e.target.value || undefined)
                }
                placeholder="/path/to/downloads"
              />
              <p className="text-xs text-muted-foreground">
                Default path for saving exported DDL files (optional)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="excelReadPath">Excel Read Path (Desktop Only)</Label>
              <Input
                id="excelReadPath"
                value={formData.excelReadPath || ""}
                onChange={(e) =>
                  handleChange("excelReadPath", e.target.value || undefined)
                }
                placeholder="/path/to/excel/files"
              />
              <p className="text-xs text-muted-foreground">
                Default path for reading Excel files (optional)
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={isPending} className="min-w-32">
              {isPending ? (
                "Saving..."
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
