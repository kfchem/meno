import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The import statements of a module of src, in order. */
function importsOf(path: string): string[] {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  return [...text.matchAll(/^\s*import\s[^;]*?["']([^"']+)["']/gm)].map((m) => m[1]);
}

describe("whose a touch is, decided before any other listener is put on the window", () => {
  it("by the module main.tsx imports first, which imports only the module that decides it, which imports nothing", () => {
    expect(importsOf("./main.tsx")[0]).toBe("./touchesFirst");
    expect(importsOf("./touchesFirst.ts")).toEqual(["./ui/features/Workspace/components/pageTouches"]);
    expect(importsOf("./ui/features/Workspace/components/pageTouches.ts")).toEqual([]);
  });
});
