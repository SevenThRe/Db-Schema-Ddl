import { Dialog } from "@/components/ui/dialog";
import type {
  SqlMemoryRetentionSettings,
  SqlWorkbenchMemoryState,
} from "./sql-memory";
import {
  buildSqlMemoryDialogScope,
  type MemoryCategory,
} from "./sql-memory-dialog-model";
import { SqlMemoryDialogContent } from "./sql-memory-dialog-sections";

export type { MemoryCategory } from "./sql-memory-dialog-model";

export interface SqlMemoryDialogProps {
  open: boolean;
  memory: SqlWorkbenchMemoryState;
  connectionLabel: string;
  activeSchema: string | null;
  onRetentionChange: (
    key: keyof SqlMemoryRetentionSettings,
    checked: boolean,
  ) => void;
  onClearCategory: (category: MemoryCategory) => void;
  onClearCurrentSchema: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function SqlMemoryDialog({
  open,
  memory,
  connectionLabel,
  activeSchema,
  onRetentionChange,
  onClearCategory,
  onClearCurrentSchema,
  onClearAll,
  onClose,
}: SqlMemoryDialogProps) {
  const scope = buildSqlMemoryDialogScope(memory, activeSchema);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SqlMemoryDialogContent
        memory={memory}
        connectionLabel={connectionLabel}
        activeSchema={activeSchema}
        scope={scope}
        onRetentionChange={onRetentionChange}
        onClearCategory={onClearCategory}
        onClearCurrentSchema={onClearCurrentSchema}
        onClearAll={onClearAll}
        onClose={onClose}
      />
    </Dialog>
  );
}
