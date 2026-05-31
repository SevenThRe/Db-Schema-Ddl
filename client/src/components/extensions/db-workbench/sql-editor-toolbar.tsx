import { AlignLeft, Lightbulb, Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SqlEditorToolbarProps {
  isExecuting: boolean;
  onExecuteSelection: () => void;
  onExecuteScript: () => void;
  onExplain: () => void;
  onFormatSql: () => void;
  onCancel: () => void;
}

export function SqlEditorToolbar({
  isExecuting,
  onExecuteSelection,
  onExecuteScript,
  onExplain,
  onFormatSql,
  onCancel,
}: SqlEditorToolbarProps) {
  return (
    <div className="flex h-[36px] shrink-0 items-center gap-1.5 border-b border-border bg-panel-muted px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={isExecuting}
            onClick={onExecuteSelection}
          >
            {isExecuting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Run statement
          </Button>
        </TooltipTrigger>
        <TooltipContent>Run statement / selection (Ctrl+Enter)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={isExecuting}
            onClick={onExecuteScript}
          >
            <Play size={14} />
            Run script
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Run script (Shift+Ctrl+Enter) and continue through the execution-review path
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={isExecuting}
            onClick={onExplain}
          >
            <Lightbulb size={14} />
            Explain
          </Button>
        </TooltipTrigger>
        <TooltipContent>Explain active statement or selection</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={isExecuting}
            onClick={onFormatSql}
          >
            <AlignLeft size={14} />
            Format SQL
          </Button>
        </TooltipTrigger>
        <TooltipContent>Format SQL (Alt+Shift+F)</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {isExecuting && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive",
              )}
              onClick={onCancel}
            >
              <Square size={14} />
              Stop
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop active query or export</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
