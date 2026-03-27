import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type ThemeMode = "light" | "dark" | "system";

const THEME_CYCLE: ThemeMode[] = ["light", "dark", "system"];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    const currentIndex = THEME_CYCLE.indexOf((theme as ThemeMode) ?? "system");
    const nextTheme = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];
    setTheme(nextTheme);
  };

  const currentLabel = theme === "system" ? `system (${resolvedTheme})` : theme;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md border border-slate-200/80 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
          onClick={cycleTheme}
          title={`Theme: ${currentLabel}. Right click for direct select.`}
        >
          {theme === "system" ? (
            <Monitor className="h-4 w-4" />
          ) : resolvedTheme === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          <span className="sr-only">Cycle theme</span>
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40 rounded-lg border-slate-200/90 p-1.5 dark:border-slate-800">
        <ContextMenuItem
          onClick={() => setTheme("light")}
          className="rounded-md px-2 py-1.5 text-xs"
        >
          <Sun className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          Light
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => setTheme("dark")}
          className="rounded-md px-2 py-1.5 text-xs"
        >
          <Moon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          Dark
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => setTheme("system")}
          className="rounded-md px-2 py-1.5 text-xs"
        >
          <Monitor className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          System
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
