import { useEffect, useState } from "react";
import type { DbDatabaseOption } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface DatabaseSelectorProps {
  databases: DbDatabaseOption[];
  selectedDatabase: string | null;
  disabled?: boolean;
  isLoading?: boolean;
  onSelectDatabase: (databaseName: string) => void;
}

export function DatabaseSelector({
  databases,
  selectedDatabase,
  disabled,
  isLoading,
  onSelectDatabase,
}: DatabaseSelectorProps) {
  const [manualDatabaseName, setManualDatabaseName] = useState(selectedDatabase ?? "");

  useEffect(() => {
    setManualDatabaseName(selectedDatabase ?? "");
  }, [selectedDatabase]);

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="border-b border-border pb-3">
        <div>
          <CardTitle className="text-base text-[hsl(var(--workspace-ink))]">数据库</CardTitle>
          <CardDescription className="mt-1 text-xs">切换当前连接要查看的数据库。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-3 border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span>当前数据库</span>
          <span className="font-medium text-[hsl(var(--workspace-ink))]">{selectedDatabase || "未选择"}</span>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
        <Select
          value={selectedDatabase ?? undefined}
          onValueChange={onSelectDatabase}
          disabled={disabled || isLoading || databases.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择要读取的数据库" />
          </SelectTrigger>
          <SelectContent>
            {databases.map((database) => (
              <SelectItem key={database.name} value={database.name}>
                {database.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <Input
            value={manualDatabaseName}
            onChange={(event) => setManualDatabaseName(event.target.value)}
            placeholder="手动输入数据库名，如 app_prod"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-sm px-4"
            disabled={disabled || manualDatabaseName.trim().length === 0}
            onClick={() => onSelectDatabase(manualDatabaseName.trim())}
          >
            使用手动输入
          </Button>
        </div>
        {databases.length === 0 && !isLoading ? (
          <div className="text-xs text-muted-foreground">账号无法枚举全部数据库时，可直接手动输入。</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
