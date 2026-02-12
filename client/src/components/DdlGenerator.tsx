import { useState } from "react";
import { useGenerateDdl, useTableInfo } from "@/hooks/use-ddl";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Code, Database, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DdlGeneratorProps {
  fileId: number | null;
  sheetName: string | null;
}

export function DdlGenerator({ fileId, sheetName }: DdlGeneratorProps) {
  const [dialect, setDialect] = useState<"mysql" | "oracle">("mysql");
  const [generatedDdl, setGeneratedDdl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: tables } = useTableInfo(fileId, sheetName);
  const { mutate: generate, isPending } = useGenerateDdl();
  const { toast } = useToast();

  const handleGenerate = () => {
    if (!tables || tables.length === 0) return;

    generate(
      { tables, dialect },
      {
        onSuccess: (data) => {
          setGeneratedDdl(data.ddl);
          toast({
            title: "DDL Generated",
            description: `Successfully generated ${dialect.toUpperCase()} DDL for ${tables.length} table(s).`,
          });
        },
        onError: (error) => {
          toast({
            title: "Generation Failed",
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
      title: "Copied to clipboard",
    });
  };

  if (!tables || tables.length === 0) return null;

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      <div className="p-4 border-b border-border bg-card/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm" data-testid="text-ddl-header">DDL Output</h3>
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

          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={isPending}
            className="h-8 text-xs font-semibold shadow-sm"
            data-testid="button-generate"
          >
            {isPending ? "Generating..." : (
              <>
                Generate <ArrowRight className="w-3 h-3 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative group bg-slate-950">
        {!generatedDdl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <Database className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm">Ready to generate SQL</p>
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
              className="absolute top-4 right-4"
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={copyToClipboard}
                className="shadow-lg bg-white/10 text-white border-none backdrop-blur-sm"
                data-testid="button-copy"
              >
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
