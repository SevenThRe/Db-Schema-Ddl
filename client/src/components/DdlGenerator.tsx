import { useState } from "react";
import { useGenerateDdl, useTableInfo, useSettings } from "@/hooks/use-ddl";
import type { TableInfo } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Code, Database, ArrowRight, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

interface DdlGeneratorProps {
  fileId: number | null;
  sheetName: string | null;
  overrideTables?: TableInfo[] | null;
}

export function DdlGenerator({ fileId, sheetName, overrideTables }: DdlGeneratorProps) {
  const [dialect, setDialect] = useState<"mysql" | "oracle">("mysql");
  const [generatedDdl, setGeneratedDdl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportMode, setExportMode] = useState<"single" | "per-table">("single");

  const { data: autoTables } = useTableInfo(fileId, sheetName);
  const tables = overrideTables || autoTables;
  const { mutate: generate, isPending } = useGenerateDdl();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleGenerate = () => {
    if (!tables || tables.length === 0) return;

    generate(
      { tables, dialect, settings },
      {
        onSuccess: (data) => {
          setGeneratedDdl(data.ddl);
          toast({
            title: t("ddl.generated"),
            description: t("ddl.generatedSuccess", { count: tables.length, dialect: dialect.toUpperCase() }),
          });
        },
        onError: (error) => {
          toast({
            title: t("ddl.generationFailed"),
            description: error.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const copyToClipboard = () => {
    if (!generatedDdl) return;
    navigator.clipboard.writeText(generatedDdl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: t("ddl.copiedToClipboard"),
    });
  };

  const handleExport = async () => {
    if (!tables || tables.length === 0) return;

    if (exportMode === "single") {
      // Single file export
      if (!generatedDdl) return;

      const prefix = settings?.exportFilenamePrefix || "Crt_";
      const tableName = tables.length === 1 ? tables[0].physicalTableName : "all_tables";
      const filename = `${prefix}${tableName}.sql`;

      const blob = new Blob([generatedDdl], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: t("ddl.exported"),
        description: t("ddl.exportedAs", { filename }),
      });
    } else {
      // Per-table ZIP export
      try {
        const response = await fetch("/api/export-ddl-zip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tables,
            dialect,
            settings,
            exportMode: "per-table",
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate ZIP");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `ddl_${dialect}_${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: t("ddl.exported"),
          description: `Exported ${tables.length} tables as ZIP file`,
        });
      } catch (error) {
        toast({
          title: t("ddl.exportFailed"),
          description: (error as Error).message,
          variant: "destructive",
        });
      }
    }
  };

  if (!tables || tables.length === 0) return null;

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      <div className="p-4 border-b border-border bg-card/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm" data-testid="text-ddl-header">{t("ddl.output")}</h3>
        </div>

        <div className="flex items-center gap-2">
          <Select value={dialect} onValueChange={(v) => setDialect(v as any)}>
            <SelectTrigger className="w-[110px] h-8 text-xs" data-testid="select-dialect">
              <SelectValue placeholder="Dialect" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mysql" data-testid="option-mysql">MySQL</SelectItem>
              <SelectItem value="oracle" data-testid="option-oracle">Oracle</SelectItem>
            </SelectContent>
          </Select>

          <Select value={exportMode} onValueChange={(v) => setExportMode(v as any)}>
            <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-export-mode">
              <SelectValue placeholder="Export Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single" data-testid="option-single">Single File</SelectItem>
              <SelectItem value="per-table" data-testid="option-per-table">Per Table (ZIP)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={isPending}
            className="h-8 text-xs font-semibold shadow-sm"
            data-testid="button-generate"
          >
            {isPending ? t("ddl.generating") : (
              <>
                {t("ddl.generate")} <ArrowRight className="w-3 h-3 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative group bg-slate-950">
        {!generatedDdl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <Database className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm">{t("ddl.readyToGenerate")}</p>
          </div>
        ) : (
          <div className="absolute inset-0 overflow-auto custom-scrollbar">
            <pre className="p-6 font-mono text-sm text-slate-200 leading-relaxed selection:bg-primary/30" data-testid="text-ddl-output">
              <code>{generatedDdl}</code>
            </pre>
          </div>
        )}

        <AnimatePresence>
          {generatedDdl && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-4 right-4 flex gap-2"
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                className="shadow-lg bg-white/10 text-white border-none backdrop-blur-sm"
                data-testid="button-export"
              >
                <Download className="w-4 h-4 mr-1" />
                {t("ddl.export")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={copyToClipboard}
                className="shadow-lg bg-white/10 text-white border-none backdrop-blur-sm"
                data-testid="button-copy"
              >
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? t("ddl.copied") : t("ddl.copy")}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
