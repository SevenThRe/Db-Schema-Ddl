import fs from "fs";
import path from "path";
import ts from "typescript";

const PROJECT_ROOT = process.cwd();
const LOCALE_FILES = [
  path.join(PROJECT_ROOT, "client/src/i18n/locales/zh.json"),
  path.join(PROJECT_ROOT, "client/src/i18n/locales/ja.json"),
];
const SOURCE_ROOT = path.join(PROJECT_ROOT, "client/src");
const HARD_CODED_LITERAL_ROOTS = [
  path.join(SOURCE_ROOT, "pages"),
];
const HARD_CODED_LITERAL_ATTRIBUTE_NAMES = new Set([
  "placeholder",
  "title",
  "aria-label",
  "aria-placeholder",
  "aria-description",
  "alt",
  "label",
  "description",
  "helperText",
]);

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

function collectSourceFiles(dir, matcher = /\.(tsx?|jsx?)$/) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  entries.forEach((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
      return;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath, matcher));
      return;
    }
    if (matcher.test(entry.name)) {
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

function normalizeCandidateText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isHardcodedLiteral(value) {
  const normalized = normalizeCandidateText(value);
  if (normalized.length === 0) {
    return false;
  }

  if (!/[A-Za-z]/.test(normalized)) {
    return false;
  }

  // Ignore template example strings such as ${date}.
  if (normalized.includes("${")) {
    return false;
  }

  // Ignore path-like examples such as /path/to/downloads.
  if (normalized.includes("/") || normalized.includes("\\")) {
    return false;
  }

  // Ignore keyboard-like or acronym-like literals such as F12 / SQL / ZIP.
  if (/^[A-Z0-9_+\-./]+$/.test(normalized)) {
    return false;
  }

  // Ignore token-like strings that are usually IDs/values instead of UI labels.
  if (/^[a-z0-9_.-]+$/.test(normalized)) {
    return false;
  }

  const words = normalized.match(/[A-Za-z]{2,}/g) ?? [];
  const lowercaseWords = words.filter((word) => /[a-z]/.test(word));

  // Require at least two lowercase English words to reduce noise from samples.
  return lowercaseWords.length >= 2;
}

function createViolation(sourceFile, node, kind, text) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    filePath: sourceFile.fileName,
    line: line + 1,
    column: character + 1,
    kind,
    text: normalizeCandidateText(text),
  };
}

function extractStringFromJsxAttributeInitializer(initializer) {
  if (!initializer) {
    return null;
  }
  if (ts.isStringLiteral(initializer)) {
    return initializer.text;
  }
  if (!ts.isJsxExpression(initializer) || !initializer.expression) {
    return null;
  }
  if (ts.isStringLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  if (ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  return null;
}

function collectHardcodedLiteralViolations() {
  const files = HARD_CODED_LITERAL_ROOTS.flatMap((rootDir) =>
    collectSourceFiles(rootDir, /\.(tsx|jsx)$/),
  );
  const violations = [];

  files.forEach((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const scriptKind = filePath.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    function visit(node) {
      if (ts.isJsxText(node)) {
        if (isHardcodedLiteral(node.text)) {
          violations.push(createViolation(sourceFile, node, "jsx-text", node.text));
        }
      } else if (ts.isJsxAttribute(node)) {
        const attributeName = node.name.getText(sourceFile);
        if (HARD_CODED_LITERAL_ATTRIBUTE_NAMES.has(attributeName)) {
          const literal = extractStringFromJsxAttributeInitializer(node.initializer);
          if (literal && isHardcodedLiteral(literal)) {
            violations.push(
              createViolation(sourceFile, node, `jsx-attr:${attributeName}`, literal),
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  });

  return violations;
}

function main() {
  const [zh, ja] = LOCALE_FILES.map(readJson);
  const zhKeys = new Set(flattenKeys(zh));
  const jaKeys = new Set(flattenKeys(ja));
  const usedKeys = collectUsedTranslationKeys();
  const hardcodedLiteralViolations = collectHardcodedLiteralViolations();

  const missingInJa = [...zhKeys].filter((key) => !jaKeys.has(key)).sort();
  const missingInZh = [...jaKeys].filter((key) => !zhKeys.has(key)).sort();
  const missingUsedKeys = [...usedKeys]
    .filter((key) => !zhKeys.has(key) || !jaKeys.has(key))
    .sort();

  const hasError =
    missingInJa.length > 0
    || missingInZh.length > 0
    || missingUsedKeys.length > 0
    || hardcodedLiteralViolations.length > 0;

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

  if (hardcodedLiteralViolations.length > 0) {
    console.error("Hardcoded UI literals detected (move to i18n keys):");
    hardcodedLiteralViolations.forEach((violation) => {
      const relativePath = path.relative(PROJECT_ROOT, violation.filePath);
      console.error(
        `  - ${relativePath}:${violation.line}:${violation.column} [${violation.kind}] ${JSON.stringify(violation.text)}`,
      );
    });
  }

  if (hasError) {
    process.exit(1);
  }

  console.log("i18n key check passed.");
}

main();
