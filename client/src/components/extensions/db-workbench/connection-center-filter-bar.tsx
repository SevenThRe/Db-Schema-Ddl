import {
  Search,
  Star,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ConnectionEnvironmentFilter } from "./workbench-connection-config-model";

export function ConnectionCenterFilterBar({
  connectionSearch,
  environmentFilter,
  favoriteOnly,
  resultCount,
  totalConnectionCount,
  onConnectionSearchChange,
  onEnvironmentFilterChange,
  onFavoriteOnlyChange,
}: {
  connectionSearch: string;
  environmentFilter: ConnectionEnvironmentFilter;
  favoriteOnly: boolean;
  resultCount: number;
  totalConnectionCount: number;
  onConnectionSearchChange: (value: string) => void;
  onEnvironmentFilterChange: (value: ConnectionEnvironmentFilter) => void;
  onFavoriteOnlyChange: (value: boolean) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-panel-muted/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={connectionSearch}
            onChange={(event) => onConnectionSearchChange(event.target.value)}
            placeholder="搜索名称、主机、数据库、分组或备注"
            className="h-7 border-border bg-background pl-7 text-xs"
          />
        </div>
        <select
          value={environmentFilter}
          onChange={(event) =>
            onEnvironmentFilterChange(event.target.value as ConnectionEnvironmentFilter)}
          className="h-7 rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="all">全部环境</option>
          <option value="dev">dev</option>
          <option value="test">test</option>
          <option value="prod">prod</option>
        </select>
        <label className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={favoriteOnly}
            onChange={(event) => onFavoriteOnlyChange(event.target.checked)}
          />
          <Star className="h-3 w-3" />
          <span>仅收藏</span>
        </label>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {resultCount} 个结果 / {totalConnectionCount} 个已保存连接
      </p>
    </div>
  );
}
