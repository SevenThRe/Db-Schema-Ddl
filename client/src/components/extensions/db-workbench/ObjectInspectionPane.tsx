import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { DbObjectInspectionResponse } from "@shared/schema";
import {
  defaultDdlText,
  ObjectInspectionCoverageAlert,
  ObjectInspectionDdlView,
  ObjectInspectionEmptyState,
  ObjectInspectionHeader,
  ObjectInspectionLoadingState,
  ObjectInspectionMetadataView,
} from "./object-inspection-sections";

export interface ObjectInspectionPaneProps {
  inspection: DbObjectInspectionResponse | null;
  isLoading: boolean;
  error?: string | null;
  className?: string;
  onInspectObject?: (objectKind: DbObjectInspectionResponse["objectKind"], objectName: string) => void;
  onOpenTable?: (tableName: string) => void;
}

export function ObjectInspectionPane({
  inspection,
  isLoading,
  error,
  className,
  onInspectObject,
  onOpenTable,
}: ObjectInspectionPaneProps) {
  const [activeView, setActiveView] = useState<"ddl" | "metadata">("ddl");
  const { toast } = useToast();

  useEffect(() => {
    setActiveView("ddl");
  }, [inspection?.displayName, inspection?.ddl, inspection?.definitionSql]);

  const handleCopy = useCallback(async () => {
    if (!inspection) return;
    try {
      await navigator.clipboard.writeText(defaultDdlText(inspection));
      toast({ title: "已复制对象 DDL", variant: "success" });
    } catch (error) {
      toast({
        title: "复制失败",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  }, [inspection, toast]);

  if (isLoading) {
    return <ObjectInspectionLoadingState />;
  }

  if (!inspection) {
    return <ObjectInspectionEmptyState error={error} className={className} />;
  }

  const ddlText = defaultDdlText(inspection);
  const indexCount = inspection.indexes.length;
  const foreignKeyCount = inspection.foreignKeys.length;

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <ObjectInspectionHeader
        inspection={inspection}
        onCopy={() => {
          void handleCopy();
        }}
      />

      <ObjectInspectionCoverageAlert inspection={inspection} />

      <div className="flex shrink-0 items-center justify-between border-b border-border bg-panel-muted/70 px-2 py-1">
        <Tabs
          value={activeView}
          onValueChange={(value) => setActiveView(value as "ddl" | "metadata")}
        >
          <TabsList className="h-7">
            <TabsTrigger value="ddl" className="h-6 text-xs">
              DDL
            </TabsTrigger>
            <TabsTrigger value="metadata" className="h-6 text-xs">
              Metadata
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{inspection.columns.length} cols</span>
          <span>{indexCount} idx</span>
          <span>{foreignKeyCount} fk</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {activeView === "ddl" ? (
          <ObjectInspectionDdlView ddlText={ddlText} />
        ) : (
          <ObjectInspectionMetadataView
            inspection={inspection}
            onInspectObject={onInspectObject}
            onOpenTable={onOpenTable}
          />
        )}
      </div>
    </div>
  );
}
