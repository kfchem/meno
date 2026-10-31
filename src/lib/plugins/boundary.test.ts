/**
 * The line between core and plugins, kept by a test (docs/PLUGINS.md, *The boundary, kept by a test*).
 *
 * Core knows no program and no plugin by name: what a plugin makes, reads or does it says in its manifest, and Meno learns it
 * from there. This test reads the manifest of every bundled plugin (src-tauri/resources/plugins/<id>/manifest.json), collects
 * what the plugins declare - plugin ids, the programs they run and what they provide, the looks and motions they make, the kinds of a step
 * they fill, the kinds of file they read and write - and fails on any string literal in core's source (src/ and
 * src-tauri/src, without tests) equal to one of them. Comments may say anything.
 *
 * What core legitimately owns - the words Meno itself defines, which a plugin only names to say it fills them (the roles
 * and kinds of step Meno has) - is in ALLOWED, each with its reason. A new entry is a decision, made in a review.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, relative, sep } from "node:path";

const ROOT = join(__dirname, "../../..");
const PLUGINS = join(ROOT, "src-tauri/resources/plugins");

/**
 * Words core owns, though a plugin names them too: each with why, and - where the word is core's only in some files - which.
 * A new entry is a decision, made in a review.
 */
const ALLOWED: { word: string; why: string; files?: string[] }[] = [
  // (the kinds of step are Meno's: workflow/kinds; a plugin's manifest only says which it fills)
  ...["check-structures", "conformers", "descriptors", "duplicates", "energy", "frequencies", "generate", "minimise", "nci", "optimise", "path-search", "reaction-path", "render", "saddle-point", "stereoisomers"].map((word) => ({ word, why: "a kind of step: Meno defines it (workflow/kinds), a plugin only names it to say it fills it" })),
  // (the materials of Meno's scene file, the vocabulary a look's parts are made of - lib/plugins/manifest `LookParts`)
  ...["clay"].map((word) => ({ word, why: "a material of the scene Meno writes (render/renderScene), which a look's parts name" })),
  { word: "python", why: "the kind of environment Meno runs a plugin's worker in, and a language its text colouring knows" },
  { word: "copper", why: "an element's name, as chemistry knows it", files: ["src/lib/chem/elements.ts"] },
  { word: "gold", why: "an element's name, as chemistry knows it", files: ["src/lib/chem/elements.ts"] },
  { word: "silver", why: "an element's name, as chemistry knows it", files: ["src/lib/chem/elements.ts"] },
  { word: "neon", why: "an element's name, as chemistry knows it", files: ["src/lib/chem/elements.ts"] },
];
const allowed = (word: string, file: string) => ALLOWED.some((a) => a.word === word && (!a.files || a.files.includes(file)));

type Json = Record<string, unknown>;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string[] => (typeof v === "string" ? [v] : []);

/** What the bundled plugins declare, by the word, with who declares it and as what. */
function declared(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (word: string, from: string) => {
    if (!word || word.length < 2) return;
    const was = out.get(word) ?? [];
    if (!was.includes(from)) was.push(from);
    out.set(word, was);
  };
  for (const dir of readdirSync(PLUGINS)) {
    const file = join(PLUGINS, dir, "manifest.json");
    if (!existsSync(file)) continue;
    const m = JSON.parse(readFileSync(file, "utf8")) as Json;
    const who = String(m.id ?? dir);
    add(who, `${who}: plugin id`);
    for (const d of list(m.downloads)) {
      const x = d as Json;
      for (const p of str(x.provides)) add(p, `${who}: provides`);
      for (const p of str(x.program)) add(p.split("/").pop() ?? p, `${who}: program`);
    }
    for (const i of list(m.installed)) for (const n of str((i as Json).name)) add(n, `${who}: installed program`);
    for (const u of list(m.uses)) for (const n of str((u as Json).name)) add(n, `${who}: uses`);
    for (const x of list(m.xyzEnergies)) for (const n of str((x as Json).id)) add(n, `${who}: XYZ energy pattern`);
    for (const k of list(m.kinds)) for (const n of str((k as Json).id)) add(n, `${who}: kind of file`);
    for (const r of list(m.reads)) for (const n of str(r)) add(n, `${who}: reads`);
    for (const w of list(m.writes)) for (const n of str((w as Json).kind ?? (w as Json).id)) add(n, `${who}: writes`);
    for (const s of list(m.steps)) {
      for (const k of list((s as Json).kinds)) for (const n of str(k)) add(n, `${who}: kind of step`);
      for (const p of list((s as Json).programs)) for (const n of str(p)) add(n, `${who}: program`);
    }
    for (const r of list(m.roles)) {
      const role = r as Json;
      for (const p of list(role.programs)) for (const n of str(p)) add(n, `${who}: program`);
      for (const l of list(role.looks)) for (const n of typeof l === "string" ? [l] : str((l as Json).id)) add(n, `${who}: look`);
      for (const mo of list(role.motions)) for (const n of str((mo as Json).id)) add(n, `${who}: motion`);
    }
  }
  return out;
}

/** The string literals of a source's code, without its comments: TypeScript's ('...', "...", `...`) or Rust's ("...", r#"..."#). */
export function literalsOf(text: string, lang: "ts" | "rs"): string[] {
  const out: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (lang === "rs" && c === "r" && (d === '"' || d === "#")) {
      let j = i + 1;
      let hashes = 0;
      while (text[j] === "#") {
        hashes++;
        j++;
      }
      if (text[j] === '"') {
        const close = '"' + "#".repeat(hashes);
        const end = text.indexOf(close, j + 1);
        if (end > 0) {
          out.push(text.slice(j + 1, end));
          i = end + close.length;
          continue;
        }
      }
    }
    if (c === '"' || (lang === "ts" && (c === "'" || c === "`"))) {
      let j = i + 1;
      let s = "";
      while (j < n && text[j] !== c) {
        if (text[j] === "\\") {
          s += text[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (c === "`" && text[j] === "$" && text[j + 1] === "{") {
          // (a template's expression: skipped to its closing brace, its own literals found by the walk on)
          let depth = 1;
          j += 2;
          while (j < n && depth > 0) {
            if (text[j] === "{") depth++;
            else if (text[j] === "}") depth--;
            j++;
          }
          s += "\u0000";
          continue;
        }
        s += text[j++];
      }
      out.push(s);
      i = j + 1;
      continue;
    }
    if (lang === "rs" && c === "'") {
      // (a char literal, or a lifetime: skipped either way)
      const close = text.indexOf("'", i + 1);
      if (close > 0 && close - i <= 4 && !/\s/.test(text.slice(i + 1, close))) {
        i = close + 1;
        continue;
      }
    }
    i++;
  }
  return out;
}

/** The files git tracks under `dirs`: what is core's source - a scratch file under src/ that git ignores is not. null where git cannot say (a source tree without its repository). */
function tracked(dirs: string[]): string[] | null {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", ...dirs], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    const files = out.split("\0").filter(Boolean);
    return files.length ? files.map((f) => join(ROOT, f)) : null;
  } catch {
    return null;
  }
}

function sources(): { file: string; lang: "ts" | "rs" }[] {
  const out: { file: string; lang: "ts" | "rs" }[] = [];
  const kept = (name: string, lang: "ts" | "rs") => {
    if (lang === "ts") {
      if (!/\.(ts|tsx)$/.test(name) || /\.(test|spec)\.(ts|tsx)$/.test(name) || /\.d\.ts$/.test(name)) return false;
      // (test support: fixtures and scratch files beside the tests)
      return !/\.scratch\./.test(name);
    }
    return name.endsWith(".rs");
  };
  const git = tracked(["src", "src-tauri/src"]);
  if (git) {
    for (const file of git) {
      const lang = file.endsWith(".rs") ? "rs" : "ts";
      if (kept(basename(file), lang)) out.push({ file, lang });
    }
    return out;
  }
  const walk = (dir: string, lang: "ts" | "rs") => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "target") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p, lang);
        continue;
      }
      if (kept(name, lang)) out.push({ file: p, lang });
    }
  };
  walk(join(ROOT, "src"), "ts");
  walk(join(ROOT, "src-tauri/src"), "rs");
  return out;
}

describe("the boundary between core and plugins", () => {
  it("reads literals, but not comments", () => {
    expect(literalsOf(`const a = "gold"; // "silver"\n/* "copper" */ const b = 'x' + \`y\${"z"}\`;`, "ts")).toEqual(["gold", "x", "y\u0000"]);
    expect(literalsOf('let a = "orca"; // "xtb"\nlet r = r#"crest"#;', "rs")).toEqual(["orca", "crest"]);
  });

  it("finds no word a plugin declares as a string literal in core's source", () => {
    const names = declared();
    const hits: string[] = [];
    for (const { file, lang } of sources()) {
      let text = readFileSync(file, "utf8");
      // (Rust's tests, at the end of a file, are not core's)
      if (lang === "rs") {
        const at = text.indexOf("#[cfg(test)]");
        if (at >= 0) text = text.slice(0, at);
      }
      for (const lit of new Set(literalsOf(text, lang))) {
        // (the path as ALLOWED writes it, with forward slashes on Windows too)
        const where = relative(ROOT, file).split(sep).join("/");
        if (names.has(lit) && !allowed(lit, where)) hits.push(`${where}: "${lit}" - declared by ${names.get(lit)!.join(", ")}`);
      }
    }
    expect(hits.sort()).toEqual([]);
  });

  it("keeps each allowed word allowed for a reason, and none that no plugin declares", () => {
    const names = declared();
    for (const { word, why } of ALLOWED) {
      expect(why.length).toBeGreaterThan(10);
      expect(names.has(word), `${word} is no longer declared by a plugin: take it off the list`).toBe(true);
    }
  });
});
