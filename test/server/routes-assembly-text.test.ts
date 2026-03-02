import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  const fullPath = path.join(ROOT, relativePath);
  return fs.readFile(fullPath, "utf8");
}

test("routes.ts wires modular route registrars with explicit middleware bundle", async () => {
  const source = await read("server/routes.ts");

  assert.match(source, /registerFileRoutes\(app,\s*\{/);
  assert.match(source, /globalProtectRateLimit,\s*\n\s*globalProtectInFlightLimit,\s*\n\s*parseRateLimit,\s*\n\s*uploadRateLimit,/);

  assert.match(source, /registerNameFixRoutes\(app,\s*\{/);
  assert.match(source, /registerDdlRoutes\(app,\s*\{/);
  assert.match(source, /registerSettingsRoutes\(app,\s*\{/);
});

test("files route module keeps upload and parse middleware order", async () => {
  const source = await read("server/routes/files-routes.ts");

  assert.match(
    source,
    /api\.files\.upload\.path,\s*\n\s*globalProtectRateLimit,\s*\n\s*globalProtectInFlightLimit,\s*\n\s*uploadRateLimit,\s*\n\s*upload\.single\("file"\)/,
  );

  assert.match(
    source,
    /api\.files\.getSearchIndex\.path,\s*\n\s*globalProtectRateLimit,\s*\n\s*globalProtectInFlightLimit,\s*\n\s*parseRateLimit,/,
  );
});

test("name-fix route module keeps guard middleware order", async () => {
  const source = await read("server/routes/name-fix-routes.ts");

  assert.match(
    source,
    /api\.nameFix\.preview\.path,\s*\n\s*globalProtectRateLimit,\s*\n\s*globalProtectInFlightLimit,\s*\n\s*parseRateLimit,/,
  );
  assert.match(
    source,
    /api\.nameFix\.apply\.path,\s*\n\s*globalProtectRateLimit,\s*\n\s*globalProtectInFlightLimit,\s*\n\s*parseRateLimit,/,
  );
  assert.match(
    source,
    /api\.nameFix\.rollback\.path,\s*\n\s*globalProtectRateLimit,\s*\n\s*globalProtectInFlightLimit,\s*\n\s*parseRateLimit,/,
  );
});

