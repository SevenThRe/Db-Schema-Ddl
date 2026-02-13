import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SheetSelector } from "@/components/SheetSelector";
import { TablePreview } from "@/components/TablePreview";
import { DdlGenerator } from "@/components/DdlGenerator";
import { SpreadsheetViewer } from "@/components/SpreadsheetViewer";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFiles } from "@/hooks/use-ddl";
import { Grid3X3, TableProperties } from "lucide-react";
import type { TableInfo } from "@shared/schema";

export default function Dashboard() {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"auto" | "spreadsheet">("auto");
  const [regionTables, setRegionTables] = useState<TableInfo[] | null>(null);

  const { data: files } = useFiles();

  useEffect(() => {
    if (!selectedFileId && files && files.length > 0) {
      const sample = files.find(f => f.originalName.includes("ISI"));
      setSelectedFileId(sample ? sample.id : files[0].id);
    }
  }, [files, selectedFileId]);

  useEffect(() => {
    setSelectedSheet(null);
    setRegionTables(null);
  }, [selectedFileId]);

  useEffect(() => {
    setRegionTables(null);
  }, [selectedSheet, viewMode]);

  const handleRegionParsed = useCallback((tables: TableInfo[]) => {
    setRegionTables(tables);
  }, []);

  // In spreadsheet mode with region selected, use regionTables for DDL generation
  const activeTables = viewMode === "spreadsheet" && regionTables ? regionTables : null;

  return (
    <div className="h-screen w-full bg-background overflow-hidden flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          selectedFileId={selectedFileId}
          onSelectFile={setSelectedFileId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <main className="flex-1 flex flex-col min-w-0 bg-background/50">
          <ResizablePanelGroup direction="horizontal" className="flex-1">

            <ResizablePanel defaultSize={15} minSize={12} maxSize={25}>
              <SheetSelector
                fileId={selectedFileId}
                selectedSheet={selectedSheet}
                onSelectSheet={setSelectedSheet}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={55} minSize={30}>
              <div className="flex flex-col h-full">
                {/* View mode tabs */}
                <div className="px-3 py-1.5 border-b border-border bg-card/30 flex items-center justify-between shrink-0">
                  <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                    <TabsList className="h-7 p-0.5">
                      <TabsTrigger value="auto" className="text-[11px] h-6 px-2.5 gap-1">
                        <TableProperties className="w-3 h-3" />
                        Auto Parse
                      </TabsTrigger>
                      <TabsTrigger value="spreadsheet" className="text-[11px] h-6 px-2.5 gap-1">
                        <Grid3X3 className="w-3 h-3" />
                        Spreadsheet
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {viewMode === "spreadsheet" && regionTables && regionTables.length > 0 && (
                    <span className="text-[10px] text-green-600 font-medium">
                      ✓ {regionTables.length} table(s) parsed from selection
                    </span>
                  )}
                </div>

                {/* Content area */}
                <div className="flex-1 overflow-hidden">
                  {viewMode === "auto" ? (
                    <TablePreview
                      fileId={selectedFileId}
                      sheetName={selectedSheet}
                    />
                  ) : (
                    <SpreadsheetViewer
                      fileId={selectedFileId}
                      sheetName={selectedSheet}
                      onRegionParsed={handleRegionParsed}
                    />
                  )}
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={30} minSize={20}>
              <DdlGenerator
                fileId={selectedFileId}
                sheetName={selectedSheet}
                overrideTables={activeTables}
              />
            </ResizablePanel>

          </ResizablePanelGroup>
        </main>
      </div>
    </div>
  );
}
