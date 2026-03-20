import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import "./i18n/config";

async function bootstrap() {
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (isTauri()) {
      (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri = true;
    }
  } catch {
    // Ignore package/runtime probe failures outside Tauri.
  }

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

void bootstrap();
