/**
 * The core's boundary, kept by a test (docs/ARCHITECTURE.md, `lib/chem/perception/`; after lib/plugins/boundary.test.ts).
 *
 * The core is pure TypeScript: no DOM, no Tauri, no network, and nothing from `lib/layout`, `ui`, or any other `lib/chem` file but a data table.
 * `lib/layout` and the rest of `lib/chem` import from it; it imports from neither - which cuts the loops of today (drawn -> lonePairCentres ->
 * perceive; readBack -> identity -> canonical). This reads every non-test file under `perception/` and fails on an import that is not inside it
 * or on the short named list below, and on any reach for the window, the document or Tauri. Comments may say anything.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const CORE = __dirname;
const SRC = resolve(CORE, "../../..");

/**
 * What a core file may import from outside it, by its path from `src/`: data tables, each with why. A new entry is a decision, made in a review.
 * `lib/chem/elements` is the element table (symbol, number, name, radii): data, imported by name.
 */
export const ALLOWED_OUTSIDE: { path: string; why: string }[] = [{ path: "lib/chem/elements", why: "the element table: data" }];

/** The module names a file's code imports, from its static `import`s and `export ... from`s and its dynamic `import()`s, comments left out. */
export function importsOf(code: string): string[] {
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found = new Set<string>();
  for (const m of bare.matchAll(/\b(?:import|export)\b[^;'"`]*?\bfrom\s*["']([^"']+)["']/g)) found.add(m[1]);
  for (const m of bare.matchAll(/\bimport\s*["']([^"']+)["']/g)) found.add(m[1]);
  for (const m of bare.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) found.add(m[1]);
  return [...found];
}

/** Why a core file's import of `spec` is not allowed: none where it is. */
export function refusedImport(file: string, spec: string): string | null {
  if (!spec.startsWith(".")) return `"${spec}" is no part of the core: a package (core imports none)`;
  const target = resolve(dirname(file), spec);
  if (target === CORE || target.startsWith(CORE + "/")) return null;
  const path = relative(SRC, target).replace(/\.ts$/, "");
  return ALLOWED_OUTSIDE.some((a) => a.path === path) ? null : `"${spec}" (src/${path}) is outside the core and on no list`;
}

/** What a core file may not mention, in code: the window, the document, Tauri. */
const REACHES = [/\bwindow\b/, /\bdocument\b/, /\bnavigator\b/, /\blocalStorage\b/, /@tauri-apps/, /\bfetch\s*\(/];

/** The code of a file with its comments and its strings' contents taken out, so that words in either are not reaches. */
const codeOnly = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("the core's boundary", () => {
  it("imports nothing but itself, and the element table", () => {
    const problems = files(CORE).flatMap((f) => importsOf(readFileSync(f, "utf8")).flatMap((spec) => refusedImport(f, spec) ?? []).map((why) => `${relative(SRC, f)}: ${why}`));
    expect(problems).toEqual([]);
  });

  it("reaches for no window, document, Tauri or network", () => {
    const problems = files(CORE).flatMap((f) => {
      const code = codeOnly(readFileSync(f, "utf8"));
      return REACHES.filter((r) => r.test(code)).map((r) => `${relative(SRC, f)}: ${r}`);
    });
    expect(problems).toEqual([]);
  });

  it("has files to read", () => {
    expect(files(CORE).length).toBeGreaterThanOrEqual(3);
  });
});

describe("the boundary's own reading, so that it bites", () => {
  const here = join(CORE, "facts.ts");

  it("finds every way a file imports, and not a word in a comment", () => {
    const code = `
      import { a } from "./graph";
      import type { B } from "../../layout/rings";
      export { c } from "../elements";
      import "side-effect";
      const d = await import("./late");
      // import { x } from "../../ui/nothing";
      /* import { y } from "../../ui/nothing"; */
    `;
    expect(importsOf(code).sort()).toEqual(["../../layout/rings", "../elements", "./graph", "./late", "side-effect"]);
  });

  it("refuses an import that leaves the core - the layout, the UI, a package - and takes one inside it or on the list", () => {
    // (a core file that began to import the layout's rings: the loop the core cuts)
    expect(refusedImport(here, "../../layout/rings")).not.toBeNull();
    expect(refusedImport(here, "../../../ui/theme/colors")).not.toBeNull();
    expect(refusedImport(here, "react")).not.toBeNull();
    expect(refusedImport(here, "../elements")).toBeNull();
    expect(refusedImport(here, "./graph")).toBeNull();
    expect(refusedImport(here, "./stereo/types")).toBeNull();
    // (another file of lib/chem is no data table)
    expect(refusedImport(here, "../molecule")).not.toBeNull();
  });

  it("finds a reach for the window or Tauri in code, and not in a comment or a string", () => {
    expect(REACHES.some((r) => r.test(codeOnly("const w = window.innerWidth;")))).toBe(true);
    expect(REACHES.some((r) => r.test(codeOnly('import { invoke } from "@tauri-apps/api/core";')))).toBe(false);
    expect(REACHES.some((r) => r.test(codeOnly("// the window\nconst x = 1;")))).toBe(false);
    expect(REACHES.some((r) => r.test(codeOnly("const w = fetch(url);")))).toBe(true);
  });
});
