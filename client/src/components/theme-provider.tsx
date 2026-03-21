import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** テーマの種類定義 */
type Theme = "light" | "dark" | "system";

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** 実際に適用されているテーマ（systemの場合はOSの設定に従う） */
  resolvedTheme: "light" | "dark";
}

const STORAGE_KEY = "ddl-schema-theme";

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
});

/** OS のカラースキーム設定を取得 */
function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** テーマをHTML要素に適用 */
function applyThemeToDocument(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

export function ThemeProvider({ children, defaultTheme = "system" }: { children: ReactNode; defaultTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme;
    return (localStorage.getItem(STORAGE_KEY) as Theme) || defaultTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    return theme === "system" ? getSystemTheme() : theme;
  });

  useEffect(() => {
    const resolved = theme === "system" ? getSystemTheme() : theme;
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved);
  }, [theme]);

  /** OSテーマ変更の監視 */
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      applyThemeToDocument(resolved);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem(STORAGE_KEY, newTheme);
    setThemeState(newTheme);
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

/** テーマコンテキストを取得するフック */
export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
