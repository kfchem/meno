import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// Every worker of the app is served by the dev server module by module, and a React component's module (.tsx) carries the
// fast-refresh code, which needs a window that a worker has not: a worker reaching one dies at once in the dev server
// ("window is not defined") though the app built runs it. So no worker may reach a component, through any import it runs.

const SRC = resolve(__dirname, "..");

/** The workers: each file named *Worker.ts under src. */
function workers(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : workers(p);
    return /Worker\.ts$/.test(name) ? [p] : [];
  });
}

/** A module's own modules it runs on: its imports, re-exports and dynamic imports from a relative path - those of types only left out. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  const statics = /(?:^|\n)\s*(import|export)\s+([^;]*?)\s+from\s+["'](\.[^"']+)["']/g;
  for (const m of text.matchAll(statics)) {
    const what = m[2].trim();
    if (what.startsWith("type ")) continue;
    const braces = /^\{([^}]*)\}$/.exec(what);
    if (braces && braces[1].split(",").every((n) => !n.trim() || n.trim().startsWith("type "))) continue;
    out.push(m[3]);
  }
  for (const m of text.matchAll(/(?:^|\n)\s*import\s+["'](\.[^"']+)["']/g)) out.push(m[1]);
  for (const m of text.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) out.push(m[1]);
  return out.flatMap((spec) => {
    const base = resolve(dirname(file), spec.replace(/\?.*$/, ""));
    const found = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find((p) => existsSync(p) && statSync(p).isFile());
    return found && /\.(ts|tsx)$/.test(found) ? [found] : [];
  });
}

/** The path from `from` to the first component it reaches, or null. */
function componentReached(from: string): string[] | null {
  const came = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (/\.tsx$/.test(at)) {
      const path: string[] = [];
      for (let p: string | null = at; p; p = came.get(p) ?? null) path.unshift(relative(SRC, p));
      return path;
    }
    for (const next of importsOf(at)) {
      if (came.has(next)) continue;
      came.set(next, at);
      queue.push(next);
    }
  }
  return null;
}

describe("the workers reach no React component, so the dev server runs them", () => {
  const all = workers();
  it("finds the workers", () => {
    expect(all.map((p) => relative(SRC, p))).toContain("ui/features/Workspace/chem/cipWorker.ts");
  });
  for (const w of all) {
    it(relative(SRC, w), () => {
      expect(componentReached(w)).toBeNull();
    });
  }
});
