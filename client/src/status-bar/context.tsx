import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { StatusBarController, StatusBarEntry, StatusBarEntryInput } from "./types";

interface StatusBarContextValue {
  items: StatusBarEntry[];
  controller: StatusBarController;
}

const noopController: StatusBarController = {
  setItem: () => () => {},
  removeItem: () => {},
  clearScope: () => {},
};

const StatusBarContext = createContext<StatusBarContextValue>({
  items: [],
  controller: noopController,
});

function buildItemKey(scope: string, id: string): string {
  return `${scope}::${id}`;
}

export function StatusBarProvider({ children }: { children: ReactNode }) {
  const [itemsByKey, setItemsByKey] = useState<Record<string, StatusBarEntry>>({});

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setItemsByKey((previous) => {
        const nextEntries = Object.entries(previous).filter(([, item]) => item.expiresAt == null || item.expiresAt > now);
        if (nextEntries.length === Object.keys(previous).length) {
          return previous;
        }
        return Object.fromEntries(nextEntries);
      });
    }, 1_000);

    return () => window.clearInterval(timer);
  }, []);

  const controller = useMemo<StatusBarController>(() => ({
    setItem: (scope: string, item: StatusBarEntryInput) => {
      const now = Date.now();
      const key = buildItemKey(scope, item.id);
      const nextItem: StatusBarEntry = {
        key,
        scope,
        id: item.id,
        label: item.label,
        detail: item.detail,
        tone: item.tone ?? "default",
        align: item.align ?? "left",
        order: item.order ?? 0,
        progress: item.progress,
        mono: item.mono ?? false,
        updatedAt: now,
        expiresAt: typeof item.expiresInMs === "number" && item.expiresInMs > 0 ? now + item.expiresInMs : null,
      };

      setItemsByKey((previous) => {
        const current = previous[key];
        if (
          current
          && current.label === nextItem.label
          && current.detail === nextItem.detail
          && current.tone === nextItem.tone
          && current.align === nextItem.align
          && current.order === nextItem.order
          && current.progress === nextItem.progress
          && current.mono === nextItem.mono
          && current.expiresAt === nextItem.expiresAt
        ) {
          return previous;
        }
        return {
          ...previous,
          [key]: nextItem,
        };
      });

      return () => {
        setItemsByKey((previous) => {
          if (!(key in previous)) {
            return previous;
          }
          const { [key]: _removed, ...rest } = previous;
          return rest;
        });
      };
    },
    removeItem: (scope: string, id: string) => {
      const key = buildItemKey(scope, id);
      setItemsByKey((previous) => {
        if (!(key in previous)) {
          return previous;
        }
        const { [key]: _removed, ...rest } = previous;
        return rest;
      });
    },
    clearScope: (scope: string) => {
      setItemsByKey((previous) => {
        const nextEntries = Object.entries(previous).filter(([, item]) => item.scope !== scope);
        if (nextEntries.length === Object.keys(previous).length) {
          return previous;
        }
        return Object.fromEntries(nextEntries);
      });
    },
  }), []);

  const items = useMemo(
    () => Object.values(itemsByKey).sort((left, right) => {
      if ((left.align ?? "left") !== (right.align ?? "left")) {
        return (left.align ?? "left") === "left" ? -1 : 1;
      }
      if ((left.order ?? 0) !== (right.order ?? 0)) {
        return (left.order ?? 0) - (right.order ?? 0);
      }
      return left.updatedAt - right.updatedAt;
    }),
    [itemsByKey],
  );

  const value = useMemo<StatusBarContextValue>(() => ({ items, controller }), [controller, items]);

  return (
    <StatusBarContext.Provider value={value}>
      {children}
    </StatusBarContext.Provider>
  );
}

export function useStatusBarItems(): StatusBarEntry[] {
  return useContext(StatusBarContext).items;
}

export function useStatusBarController(): StatusBarController {
  return useContext(StatusBarContext).controller;
}

export function useStatusBarScope(scope: string) {
  const controller = useStatusBarController();

  return useMemo(() => ({
    set: (item: StatusBarEntryInput) => controller.setItem(scope, item),
    clear: (id: string) => controller.removeItem(scope, id),
    clearAll: () => controller.clearScope(scope),
  }), [controller, scope]);
}
