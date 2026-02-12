import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SheetSelector } from "@/components/SheetSelector";
import { TablePreview } from "@/components/TablePreview";
import { DdlGenerator } from "@/components/DdlGenerator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useFiles } from "@/hooks/use-ddl";

export default function Dashboard() {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  
  // Auto-select first file if none selected
  const { data: files } = useFiles();
  
  useEffect(() => {
    if (!selectedFileId && files && files.length > 0) {
      // Prefer the sample file if it exists, otherwise the first one
      const sample = files.find(f => f.originalName.includes("ISI"));
      setSelectedFileId(sample ? sample.id : files[0].id);
    }
  }, [files, selectedFileId]);

  // Reset sheet selection when file changes
  useEffect(() => {
    setSelectedSheet(null);
  }, [selectedFileId]);

  return (
    <div className="h-screen w-full bg-background overflow-hidden flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar 
          selectedFileId={selectedFileId} 
          onSelectFile={setSelectedFileId}
          className="w-[280px] shrink-0 z-20 shadow-xl"
        />
        
        <main className="flex-1 flex flex-col min-w-0 bg-background/50">
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            
            <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
              <SheetSelector 
                fileId={selectedFileId}
                selectedSheet={selectedSheet}
                onSelectSheet={setSelectedSheet}
              />
            </ResizablePanel>
            
            <ResizableHandle withHandle />
            
            <ResizablePanel defaultSize={50} minSize={30}>
              <TablePreview 
                fileId={selectedFileId} 
                sheetName={selectedSheet} 
              />
            </ResizablePanel>
            
            <ResizableHandle withHandle />
            
            <ResizablePanel defaultSize={30} minSize={20}>
              <DdlGenerator 
                fileId={selectedFileId} 
                sheetName={selectedSheet} 
              />
            </ResizablePanel>
            
          </ResizablePanelGroup>
        </main>
      </div>
    </div>
  );
}
