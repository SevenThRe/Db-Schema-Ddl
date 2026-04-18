import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build as viteBuild } from "vite";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageRoot = path.resolve(projectRoot, "dist/extensions/db-connector/package");
const manifestSource = path.resolve(projectRoot, "extension-packages/db-connector/manifest.json");
const manifestTarget = path.resolve(packageRoot, "manifest.json");

async function buildDbConnectorExtension() {
  await rm(packageRoot, { recursive: true, force: true });

  await viteBuild({
    configFile: path.resolve(projectRoot, "vite.config.ts"),
    mode: "db-connector-extension",
  });

  await mkdir(packageRoot, { recursive: true });
  const manifest = await readFile(manifestSource, "utf8");
  await writeFile(manifestTarget, manifest);

  console.log(`Built db-connector extension package at ${packageRoot}`);
}

buildDbConnectorExtension().catch((error) => {
  console.error(error);
  process.exit(1);
});
