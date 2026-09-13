import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function getAllSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...getAllSourceFiles(full));
    } else if (full.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("Repository Architectural Boundary: @repo/ai", () => {
  const srcDir = join(__dirname, "../../src");
  const sourceFiles = getAllSourceFiles(srcDir);

  const FORBIDDEN_IMPORT_PATTERNS = [
    "@prisma/client",
    "@repo/db",
    "@repo/data",
    "duckdb",
    "@repo/analytics",
    "@repo/telemetry",
  ];

  it("finds source files to inspect", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
    it(`contains zero imports of '${pattern}' across all src files`, () => {
      for (const file of sourceFiles) {
        const content = readFileSync(file, "utf8");
        const hasImport =
          content.includes(`from "${pattern}"`) ||
          content.includes(`from '${pattern}'`) ||
          content.includes(`require("${pattern}")`) ||
          content.includes(`require('${pattern}')`);
        expect(
          hasImport,
          `File ${file} must not import ${pattern}`,
        ).toBe(false);
      }
    });
  }

  it("declares zero dependencies on database, analytics, or telemetry in package.json", () => {
    const pkgPath = join(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(allDeps[pattern]).toBeUndefined();
    }
  });
});
