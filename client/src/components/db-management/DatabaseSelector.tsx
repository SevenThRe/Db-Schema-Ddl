import { useEffect, useState } from "react";
import type { DbDatabaseOption } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
    <Card className="border-border/70">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">Database 选择</CardTitle>
        <CardDescription>连接到 server 后，在模块里切换当前要查看的 MySQL database。远程受限账号也可以直接手动输入 database 名称。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{selectedDatabase || "未选择"}</Badge>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
        <Select
          value={selectedDatabase ?? undefined}
          onValueChange={onSelectDatabase}
          disabled={disabled || isLoading || databases.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择要 introspect 的 database" />
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
            placeholder="手动输入 database，例如 app_prod"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || manualDatabaseName.trim().length === 0}
            onClick={() => onSelectDatabase(manualDatabaseName.trim())}
          >
            使用手动输入
          </Button>
        </div>
        {databases.length === 0 && !isLoading ? (
          <div className="text-xs text-muted-foreground">如果当前账号不能枚举全部 databases，也可以直接手动输入目标 database 继续读取 schema。</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
