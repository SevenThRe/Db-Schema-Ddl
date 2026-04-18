import { createRoot } from "react-dom/client";
import { DbConnectorExtensionApp } from "./db-connector-extension-app";
import "../../index.css";
import "../../i18n/config";

createRoot(document.getElementById("root")!).render(<DbConnectorExtensionApp />);
