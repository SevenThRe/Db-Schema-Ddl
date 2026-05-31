import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { DbDriver, DbTableSchema } from "@shared/schema";
import { TableDesignerPanel } from "./TableDesignerPanel";

export interface TableDesignerDialogProps {
  open: boolean;
  driver: DbDriver;
  schemaName?: string;
  readonly: boolean;
  /** null = designing a new table; otherwise editing this introspected table. */
  sourceSchema: DbTableSchema | null;
  onApplyDdl: (sql: string) => void;
  onClose: () => void;
}

export function TableDesignerDialog({
  open,
  driver,
  schemaName,
  readonly,
  sourceSchema,
  onApplyDdl,
  onClose,
}: TableDesignerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex h-[80vh] max-w-4xl flex-col overflow-hidden p-0">
        <TableDesignerPanel
          driver={driver}
          schemaName={schemaName}
          readonly={readonly}
          sourceSchema={sourceSchema}
          onApplyDdl={onApplyDdl}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
