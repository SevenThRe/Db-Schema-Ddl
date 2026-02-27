import fs from "fs";
import path from "path";

const PROJECT_ROOT = process.cwd();
const LOCALE_FILES = [
  path.join(PROJECT_ROOT, "client/src/i18n/locales/zh.json"),
  path.join(PROJECT_ROOT, "client/src/i18n/locales/ja.json"),
];
const SOURCE_ROOT = path.join(PROJECT_ROOT, "client/src");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function flattenKeys(obj, prefix = "") {
  const keys = [];
  Object.entries(obj).forEach(([key, value]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, next));
      return;
    }
    keys.push(next);
  });
  return keys;
}

function collectSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  entries.forEach((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
      return;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      return;
    }
    if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(fullPath);
    }
  });
  return files;
}

function collectUsedTranslationKeys() {
  const used = new Set();
  const regex = /\bt\(\s*["'`]([^"'`]+)["'`]/g;
  const files = collectSourceFiles(SOURCE_ROOT);
  files.forEach((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    let match;
    while ((match = regex.exec(content)) !== null) {
      used.add(match[1]);
    }
  });
  return used;
}

function main() {
  const [zh, ja] = LOCALE_FILES.map(readJson);
  const zhKeys = new Set(flattenKeys(zh));
  const jaKeys = new Set(flattenKeys(ja));
  const usedKeys = collectUsedTranslationKeys();

  const missingInJa = [...zhKeys].filter((key) => !jaKeys.has(key)).sort();
  const missingInZh = [...jaKeys].filter((key) => !zhKeys.has(key)).sort();
  const missingUsedKeys = [...usedKeys]
    .filter((key) => !zhKeys.has(key) || !jaKeys.has(key))
    .sort();

  const hasError =
    missingInJa.length > 0 || missingInZh.length > 0 || missingUsedKeys.length > 0;

  if (missingInJa.length > 0) {
    console.error("Missing keys in ja.json:");
    missingInJa.forEach((key) => console.error(`  - ${key}`));
  }

  if (missingInZh.length > 0) {
    console.error("Missing keys in zh.json:");
    missingInZh.forEach((key) => console.error(`  - ${key}`));
  }

  if (missingUsedKeys.length > 0) {
    console.error("Keys used in source but missing in locales:");
    missingUsedKeys.forEach((key) => console.error(`  - ${key}`));
  }

  if (hasError) {
    process.exit(1);
  }

  console.log("i18n key check passed.");
}

main();
