import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { useEffect, useState } from "react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import { desktopBridge } from "@/lib/desktop-bridge";

type RuntimeProbeState = {
  runtime: string;
  status: "idle" | "ok" | "error";
  message?: string;
};

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [runtimeProbe, setRuntimeProbe] = useState<RuntimeProbeState>(() => ({
    runtime: desktopBridge.getCapabilities().runtime,
    status: "idle",
  }));

  useEffect(() => {
    void (async () => {
      const runtime = desktopBridge.getCapabilities().runtime;
      setRuntimeProbe({ runtime, status: "idle" });
      document.title = `DBSchemaExcel2DDL [${runtime}]`;
      try {
        const diagnostics = await desktopBridge.getRuntimeDiagnostics();
        if (diagnostics) {
          window.__DB_SCHEMA_DDL_RUNTIME_INFO__ = diagnostics;
          document.title = `DBSchemaExcel2DDL [${runtime}] [db:${diagnostics.dbExists ? "yes" : "no"}:${diagnostics.uploadedFileCount}]`;
          setRuntimeProbe({
            runtime,
            status: "ok",
            message: `db:${diagnostics.dbExists ? "yes" : "no"} files:${diagnostics.uploadedFileCount}`,
          });
          console.info("[desktop-runtime]", diagnostics);
          return;
        }

        setRuntimeProbe({
          runtime,
          status: "idle",
          message: "diagnostics-unavailable",
        });
      } catch (error) {
        setRuntimeProbe({
          runtime,
          status: "error",
          message: error instanceof Error ? error.message : "diagnostics-failed",
        });
      }
    })();
  }, []);

  return (
    <ThemeProvider defaultTheme="system">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {import.meta.env.DEV ? (
          <div className="pointer-events-none fixed left-3 top-3 z-[100] rounded border border-slate-300 bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm">
            {runtimeProbe.runtime} | {runtimeProbe.status}
            {runtimeProbe.message ? ` | ${runtimeProbe.message}` : ""}
          </div>
        ) : null}
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
