import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { createRequire } from "module";

// package.json から直接バージョンを読み込む（npm_package_version が未設定でも動作する）
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };
const projectRoot = path.resolve(import.meta.dirname);
const clientRoot = path.resolve(projectRoot, "client");

export default defineConfig(({ mode }) => {
  const isDbConnectorExtensionBuild = mode === "db-connector-extension";

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(projectRoot, "client", "src"),
        "@shared": path.resolve(projectRoot, "shared"),
        "@assets": path.resolve(projectRoot, "attached_assets"),
      },
    },
    root: clientRoot,
    base: isDbConnectorExtensionBuild ? "./" : "/",
    build: isDbConnectorExtensionBuild
      ? {
          outDir: path.resolve(projectRoot, "dist/extensions/db-connector/package/ui"),
          emptyOutDir: true,
          copyPublicDir: false,
          rollupOptions: {
            input: path.resolve(clientRoot, "db-connector-extension.html"),
          },
        }
      : {
          outDir: path.resolve(projectRoot, "dist/public"),
          emptyOutDir: true,
        },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
