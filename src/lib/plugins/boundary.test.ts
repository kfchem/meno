/**
 * The line between core and plugins, kept by a test (docs/PLUGINS.md, *The boundary, kept by a test*).
 *
 * Core knows no program and no plugin by name: what a plugin makes, reads or does it says in its manifest, and Meno learns it
 * from there. This test reads the manifest of every bundled plugin (src-tauri/resources/plugins/<id>/manifest.json) and its
 * worker, collects what the plugins declare and say, and fails on any of it in core's source (src/ and src-tauri/src, without
 * tests) - in a string literal, a regular expression, or the text of a page (JSX). Comments may say anything.
 *
 * Two ways of finding one:
 * - a word a plugin declares - its id, its programs and what they provide, its looks and motions, the kinds of a step it
 *   fills, the kinds of file it reads and writes and their extensions, the variables it is given, the files its steps
 *   take - found where a literal is exactly that word;
 * - an option a plugin declares, by its id - found where core's code asks for an option of that id (`o.id === "grain"`,
 *   `options.grain`) that is none of Meno's own;
 * - a name - a plugin's, a program's as it is shown, what a plugin uses, the marks its kinds of file are told by - found
 *   anywhere in a literal, as a word, whatever its case ("ORCA's %maxcore" is found by "ORCA").
 *
 * What core legitimately owns - the words Meno itself defines, which a plugin only names to say it fills them (the roles
 * and kinds of step Meno has) - is in ALLOWED, each with its reason; a word a worker says
 * that core says too is core's where docs/PLUGINS.md or docs/WORKFLOWS-FOUNDATION.md defines it, as Meno's general form. A new entry is a decision, made in a
 * review.
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
  ...["check-structures", "conformers", "descriptors", "energy", "frequencies", "generate", "minimise", "nci", "optimise", "path-search", "reaction-path", "render", "saddle-point", "stereoisomers"].map((word) => ({ word, why: "a kind of step: Meno defines it (workflow/kinds), a plugin only names it to say it fills it" })),
  // (the materials of Meno's scene file, the vocabulary a look's parts are made of - lib/plugins/manifest `LookParts`)
  ...["clay"].map((word) => ({ word, why: "a material of the scene Meno writes (render/renderScene), which a look's parts name" })),
  { word: "python", why: "the kind of environment Meno runs a plugin's worker in, and a language its text colouring knows" },
  { word: "copper", why: "an element's name, as chemistry knows it", files: ["src/lib/chem/elements.ts"] },
  { word: "gold", why: "an element's name, as chemistry knows it", files: ["src/lib/chem/elements.ts"] },
  { word: "silver", why: "an element's name, as chemistry knows it", files: ["src/lib/chem/elements.ts"] },
  { word: "neon", why: "an element's name, as chemistry knows it", files: ["src/lib/chem/elements.ts"] },
  { word: "title", why: "a molfile's title line, an option of Meno's own writer", files: ["src/lib/chem/molWriter.ts"] },
  { word: "vibrations", why: "the list of vibrations a calculation's results hold, Meno's general form (docs/PLUGINS.md)", files: ["src/ui/features/Workspace/workflow/entries.ts"] },
];
const allowed = (word: string, file: string) => ALLOWED.some((a) => a.word === word && (!a.files || a.files.includes(file)));

type Json = Record<string, unknown>;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string[] => (typeof v === "string" ? [v] : []);
const keys = (v: unknown): string[] => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v) : []);

/** The manifests of the bundled plugins, each with its id. */
function manifests(): { who: string; m: Json }[] {
  const out: { who: string; m: Json }[] = [];
  for (const dir of readdirSync(PLUGINS)) {
    const file = join(PLUGINS, dir, "manifest.json");
    if (!existsSync(file)) continue;
    const m = JSON.parse(readFileSync(file, "utf8")) as Json;
    out.push({ who: String(m.id ?? dir), m });
  }
  return out;
}

/** The ids of the options a manifest's steps, roles and writers declare, each with who declares it. */
function pluginOptions(from = manifests()): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { who, m } of from) {
    for (const s of [...list(m.steps), ...list(m.roles), ...list(m.writes), ...(m.presets ? [m.presets] : [])]) {
      for (const o of list((s as Json).options)) {
        for (const id of str((o as Json).id)) {
          const was = out.get(id) ?? [];
          if (!was.includes(who)) was.push(who);
          out.set(id, was);
        }
      }
    }
  }
  return out;
}

/** What the bundled plugins declare, by the word, with who declares it and as what: found where a literal is exactly the word. */
function declared(from = manifests()): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (word: string, from: string) => {
    if (!word || word.length < 2) return;
    const was = out.get(word) ?? [];
    if (!was.includes(from)) was.push(from);
    out.set(word, was);
  };
  for (const { who, m } of from) {
    add(who, `${who}: plugin id`);
    for (const d of list(m.downloads)) {
      const x = d as Json;
      for (const p of str(x.provides)) add(p, `${who}: provides`);
      for (const p of str(x.program)) add(p.split("/").pop() ?? p, `${who}: program`);
      for (const f of str(x.file)) add(f, `${who}: download`);
    }
    for (const i of list(m.installed)) {
      const x = i as Json;
      for (const n of str(x.name)) add(n, `${who}: installed program`);
      for (const n of keys(x.beside)) add(n, `${who}: program beside`);
      for (const n of keys(x.env)) add(n, `${who}: variable`);
      for (const f of Object.values((x.files as Json) ?? {})) for (const n of str(f)) add(n, `${who}: program file`);
    }
    for (const u of list(m.uses)) for (const n of str((u as Json).name)) add(n, `${who}: uses`);
    for (const d of list(m.depends)) for (const p of list((d as Json).programs)) for (const e of str((p as Json).env)) add(e, `${who}: variable`);
    for (const x of list(m.xyzEnergies)) for (const n of str((x as Json).id)) add(n, `${who}: XYZ energy pattern`);
    for (const x of list(m.xyzSteps)) for (const n of [...str((x as Json).id), ...str((x as Json).file)]) add(n, `${who}: XYZ steps`);
    for (const k of list(m.kinds)) {
      for (const n of str((k as Json).id)) add(n, `${who}: kind of file`);
      for (const e of list((k as Json).extensions)) for (const n of str(e)) add(n, `${who}: extension`);
    }
    for (const r of list(m.reads)) for (const n of str(r)) add(n, `${who}: reads`);
    for (const w of list(m.writes)) for (const n of str((w as Json).kind ?? (w as Json).id)) add(n, `${who}: writes`);
    for (const s of list(m.steps)) {
      for (const k of list((s as Json).kinds)) for (const n of str(k)) add(n, `${who}: kind of step`);
      for (const p of list((s as Json).programs)) for (const n of str(p)) add(n, `${who}: program`);
      for (const f of list((s as Json).files)) for (const n of str(f)) add(n, `${who}: a step's files`);
    }
    for (const r of list(m.roles)) {
      const role = r as Json;
      for (const p of list(role.programs)) for (const n of str(p)) add(n, `${who}: program`);
      for (const l of list(role.looks)) for (const n of typeof l === "string" ? [l] : str((l as Json).id)) add(n, `${who}: look`);
      for (const mo of list(role.motions)) for (const n of str((mo as Json).id)) add(n, `${who}: motion`);
    }
    // (the interfaces it declares and uses, and what it brings through one: its presets' ids and files)
    for (const i of list(m.interfaces)) for (const n of str((i as Json).id)) add(n, `${who}: interface`);
    for (const d of list(m.depends)) for (const i of list((d as Json).interfaces)) for (const n of str((i as Json).id)) add(n, `${who}: interface`);
    const presets = (m.presets ?? {}) as Json;
    for (const [k, said] of [["looks", "look"], ["studios", "studio"], ["motions", "motion"]] as const)
      for (const x of list(presets[k])) {
        for (const n of str((x as Json).id)) add(n, `${who}: ${said}`);
        for (const n of str((x as Json).file)) add(n, `${who}: a preset's file`);
      }
    for (const f of list(presets.files)) for (const n of str(f)) add(n, `${who}: a preset's file`);
  }
  return out;
}

/** The names the bundled plugins give - their own, their programs' as shown, what they use, their kinds' marks - by the name in lower case: found as a word anywhere in a literal, whatever its case. */
function named(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (name: string, from: string) => {
    const n = name.trim().toLowerCase();
    if (n.length < 3) return;
    const was = out.get(n) ?? [];
    if (!was.includes(from)) was.push(from);
    out.set(n, was);
  };
  for (const { who, m } of manifests()) {
    add(who, `${who}: plugin id`);
    for (const n of str(m.name)) add(n, `${who}: name`);
    for (const i of list(m.installed)) for (const n of [...str((i as Json).name), ...str((i as Json).label)]) add(n, `${who}: installed program`);
    for (const u of list(m.uses)) for (const n of str((u as Json).name)) add(n, `${who}: uses`);
    for (const d of list(m.downloads)) for (const n of str((d as Json).provides)) add(n, `${who}: provides`);
    for (const k of list(m.kinds)) {
      for (const n of str((k as Json).program)) add(n, `${who}: a kind's program`);
      for (const mk of list((k as Json).marks)) for (const n of str((mk as Json).text)) if (n.trim().length >= 6) add(n, `${who}: a kind's mark`);
    }
  }
  return out;
}

/** The words the bundled plugins' workers say that look like a result's key - "thermo.zpve", "not-converged" - each with who says it. */
function workerWords(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const dir of readdirSync(PLUGINS)) {
    const folder = join(PLUGINS, dir);
    if (!statSync(folder).isDirectory()) continue;
    for (const name of readdirSync(folder).filter((f) => f.endsWith(".py"))) {
      const text = readFileSync(join(folder, name), "utf8");
      for (const m of text.matchAll(/"([^"\\\n]*)"|'([^'\\\n]*)'/g)) {
        const s = m[1] ?? m[2];
        // (a key: dotted or hyphenated words - never a file's name)
        if (!/^[a-z]+(?:\.[a-z][a-z-]*)+$/.test(s) && !/^[a-z]+(?:-[a-z]+)+$/.test(s)) continue;
        if (/\.(?:py|json|xyz|log|out|inp|gjf|png|csv|toml|gltf|nci|txt|molden|wfx|input)$/.test(s)) continue;
        const was = out.get(s) ?? [];
        if (!was.includes(dir)) was.push(dir);
        out.set(s, was);
      }
    }
  }
  return out;
}

/** What a literal is: a string's, a regular expression's, or a page's text (JSX). */
export type Literal = { text: string; as: "string" | "regex" | "jsx" };

// (after one of these - or at the start - a slash begins a regular expression, not a division)
const BEFORE_REGEX = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^", ""]);
const KEYWORDS_BEFORE_REGEX = new Set(["return", "typeof", "case", "in", "of", "void", "yield", "await", "delete", "throw", "new", "else", "do"]);

/**
 * The literals of a source's code, without its comments: TypeScript's strings ('...', "...", `...`), regular expressions
 * (/.../) and, in a .tsx, a page's text between its tags; Rust's strings ("...", r#"..."#).
 */
export function literalsIn(text: string, lang: "ts" | "tsx" | "rs"): Literal[] {
  const out: Literal[] = [];
  // (the code with its literals and comments blanked, where a page's text is looked for)
  let code = "";
  let i = 0;
  const n = text.length;
  let last = "";
  let word = "";
  const ts = lang !== "rs";
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
      code += " ";
      continue;
    }
    if (ts && c === "/" && (BEFORE_REGEX.has(last) || KEYWORDS_BEFORE_REGEX.has(word))) {
      let j = i + 1;
      let inClass = false;
      let body = "";
      let closed = false;
      while (j < n && text[j] !== "\n") {
        if (text[j] === "\\") {
          body += text.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (text[j] === "[") inClass = true;
        else if (text[j] === "]") inClass = false;
        else if (text[j] === "/" && !inClass) {
          closed = true;
          break;
        }
        body += text[j++];
      }
      if (closed) {
        out.push({ text: body, as: "regex" });
        j++;
        while (j < n && /[a-z]/.test(text[j])) j++;
        i = j;
        last = "a";
        word = "";
        code += " ";
        continue;
      }
    }
    if (lang === "rs" && c === "r" && (d === '"' || d === "#") && !/\w/.test(text[i - 1] ?? "")) {
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
          out.push({ text: text.slice(j + 1, end), as: "string" });
          i = end + close.length;
          last = "a";
          word = "";
          code += " ";
          continue;
        }
      }
    }
    // (a quote just after a letter is an apostrophe, in a page's text - "ORCA's" - never a string's start)
    if (c === '"' || (ts && c === "`") || (ts && c === "'" && !/[A-Za-z0-9]/.test(text[i - 1] ?? ""))) {
      let j = i + 1;
      let s = "";
      while (j < n && text[j] !== c) {
        if (text[j] === "\\") {
          s += text[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (c === "`" && text[j] === "$" && text[j + 1] === "{") {
          // (a template's expression: its own literals found by a walk of its own)
          let depth = 1;
          const from = j + 2;
          j += 2;
          while (j < n && depth > 0) {
            if (text[j] === "{") depth++;
            else if (text[j] === "}") depth--;
            j++;
          }
          out.push(...literalsIn(text.slice(from, j - 1), lang === "tsx" ? "ts" : lang));
          s += "\u0000";
          continue;
        }
        s += text[j++];
      }
      out.push({ text: s, as: "string" });
      i = j + 1;
      last = "a";
      word = "";
      code += " ";
      continue;
    }
    if (lang === "rs" && c === "'") {
      // (a char literal, or a lifetime: skipped either way)
      const close = text.indexOf("'", i + 1);
      if (close > 0 && close - i <= 4 && !/\s/.test(text.slice(i + 1, close))) {
        i = close + 1;
        last = "a";
        code += " ";
        continue;
      }
    }
    if (/\s/.test(c)) {
      code += c;
      i++;
      continue;
    }
    if (/[\w$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(text[j])) j++;
      word = text.slice(i, j);
      last = "a";
      code += word;
      i = j;
      continue;
    }
    last = c;
    word = "";
    code += c;
    i++;
  }
  if (lang === "tsx") {
    // (a page's text: between a tag's end and the next tag or expression)
    for (const m of code.matchAll(/>([^<>{}]*)(?=[<{])/g)) {
      const t = m[1].replace(/\s+/g, " ").trim();
      if (/[A-Za-z]{2}/.test(t)) out.push({ text: t, as: "jsx" });
    }
  }
  return out;
}

/** The string literals of a source's code, without its comments (`literalsIn`'s strings alone). */
export function literalsOf(text: string, lang: "ts" | "rs"): string[] {
  return literalsIn(text, lang)
    .filter((l) => l.as === "string")
    .map((l) => l.text);
}

/**
 * A Rust source without its tests: each item marked `#[cfg(test)]` - a module of tests, a helper only they use, a line
 * only they take - taken out, to its block's end or its semicolon; the rest, all of it, core's.
 */
export function withoutTests(text: string): string {
  let out = text;
  for (;;) {
    const at = out.indexOf("#[cfg(test)]");
    if (at < 0) return out;
    // (the item after it, its literals and comments passed over so that their braces and semicolons do not count)
    let i = at + "#[cfg(test)]".length;
    let depth = 0;
    let opened = false;
    while (i < out.length) {
      const c = out[i];
      if (c === "/" && out[i + 1] === "/") {
        while (i < out.length && out[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && out[i + 1] === "*") {
        const end = out.indexOf("*/", i + 2);
        i = end < 0 ? out.length : end + 2;
        continue;
      }
      if (c === '"') {
        i++;
        while (i < out.length && out[i] !== '"') i += out[i] === "\\" ? 2 : 1;
        i++;
        continue;
      }
      if (c === "'" && out[i + 2] === "'") {
        i += 3;
        continue;
      }
      if (c === "'" && out[i + 1] === "\\") {
        const end = out.indexOf("'", i + 2);
        i = end < 0 ? out.length : end + 1;
        continue;
      }
      if (c === "{" || c === "(" || c === "[") {
        if (c === "{" && depth === 0) opened = true;
        depth++;
      } else if (c === "}" || c === ")" || c === "]") {
        depth--;
        if (depth === 0 && opened && c === "}") {
          i++;
          break;
        }
      } else if (c === ";" && depth === 0) {
        i++;
        break;
      }
      i++;
    }
    out = out.slice(0, at) + out.slice(i);
  }
}

/** A source's code without its comments - and, for Rust, its tests - its literals kept: where an option asked for is looked for. */
function codeOf(text: string, lang: "ts" | "tsx" | "rs"): string {
  const kept = lang === "rs" ? withoutTests(text) : text;
  return kept.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
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

type Lang = "ts" | "tsx" | "rs";
const langOf = (name: string): Lang => (name.endsWith(".rs") ? "rs" : name.endsWith(".tsx") ? "tsx" : "ts");

function sources(): { file: string; lang: Lang }[] {
  const out: { file: string; lang: Lang }[] = [];
  const kept = (name: string) => {
    if (name.endsWith(".rs")) return true;
    if (!/\.(ts|tsx)$/.test(name) || /\.(test|spec)\.(ts|tsx)$/.test(name) || /\.d\.ts$/.test(name)) return false;
    // (test support: fixtures and scratch files beside the tests)
    return !/\.scratch\./.test(name);
  };
  const git = tracked(["src", "src-tauri/src"]);
  if (git) {
    for (const file of git) if (kept(basename(file))) out.push({ file, lang: langOf(file) });
    return out;
  }
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "target") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (kept(name)) out.push({ file: p, lang: langOf(name) });
    }
  };
  walk(join(ROOT, "src"));
  walk(join(ROOT, "src-tauri/src"));
  return out;
}

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** What finds `names` (in lower case) in a text, each as a word, whatever its case: not part of a longer word - the longest where two begin alike. */
function namesFinder(names: readonly string[]): (text: string) => string[] {
  const re = new RegExp(`(?:^|[^a-z0-9_])(${[...names].sort((a, b) => b.length - a.length).map(escaped).join("|")})(?=$|[^a-z0-9_])`, "gi");
  return (text) => [...text.matchAll(re)].map((m) => m[1].toLowerCase());
}

let literalsOnce: { where: string; lit: Literal }[] | null = null;
/** Each literal of core's source, with where it is: read once, for every test. */
function coreLiterals(): { where: string; lit: Literal }[] {
  if (literalsOnce) return literalsOnce;
  const out: { where: string; lit: Literal }[] = [];
  for (const { file, lang } of sources()) {
    let text = readFileSync(file, "utf8");
    if (lang === "rs") text = withoutTests(text);
    // (the path as ALLOWED writes it, with forward slashes on Windows too)
    const where = relative(ROOT, file).split(sep).join("/");
    for (const lit of literalsIn(text, lang)) out.push({ where, lit });
  }
  literalsOnce = out;
  return out;
}

// (all of core's source read through, once: seconds where the computer is busy)
describe("the boundary between core and plugins", { timeout: 30_000 }, () => {
  it("reads strings, regular expressions and a page's text, but not comments", () => {
    expect(literalsOf(`const a = "gold"; // "silver"\n/* "copper" */ const b = 'x' + \`y\${"z"}\`;`, "ts")).toEqual(["gold", "x", "z", "y\u0000"]);
    expect(literalsOf('let a = "orca"; // "xtb"\nlet r = r#"crest"#;', "rs")).toEqual(["orca", "crest"]);
    expect(literalsIn("const r = /^scf done/i; const q = a / b / c;", "ts")).toEqual([{ text: "^scf done", as: "regex" }]);
    expect(literalsIn('const s = x.match(/"[a-z]+"/); const t = "after";', "ts")).toEqual([
      { text: '"[a-z]+"', as: "regex" },
      { text: "after", as: "string" },
    ]);
    expect(literalsIn("const p = <p>The plugin's own words</p>; const s = 'after';", "tsx")).toEqual([
      { text: "after", as: "string" },
      { text: "The plugin's own words", as: "jsx" },
    ]);
    expect(literalsIn('const p = <p className="mt-1">Uses its %maxcore here</p>;', "tsx")).toEqual([
      { text: "mt-1", as: "string" },
      { text: "Uses its %maxcore here", as: "jsx" },
    ]);
  });

  it("takes out each item a Rust source keeps for its tests, and only those", () => {
    const rs = 'fn core() { "a" }\n#[cfg(test)]\nfn helper() { if x { "b" } }\nfn more() { "c" }\nfn f() {\n  #[cfg(test)]\n  return g("d");\n  "e"\n}\n#[cfg(test)]\nmod tests {\n  fn t() { "}" }\n}\n';
    expect(literalsOf(withoutTests(rs), "rs")).toEqual(["a", "c", "e"]);
  });

  it("takes each word a plugin declares, those it gives the plugins it uses among them", () => {
    // (ORCA's, as Meno carries it: the variable a job is told the xTB plugin's xtb in)
    expect(declared().get("XTBEXE")).toEqual(["orca: variable"]);
  });

  it("takes the words of what a plugin brings another through its interface: the interface, its presets' ids, files and options", () => {
    // (a made-up preset plugin, as no plugin Meno carries yet)
    const m = {
      id: "tool-looks",
      interfaces: [{ id: "styling", version: "1.0.0" }],
      depends: [{ plugin: "tool", versions: ">=1.0.0", interfaces: [{ id: "shading", versions: ">=1.0.0" }] }],
      presets: { interface: "shading", looks: [{ id: "chalk", file: "look_chalk.py" }], studios: [{ id: "attic", file: "attic.py" }], motions: [{ id: "wobble", file: "wobble.py" }], files: ["shared.py"], options: [{ id: "grain" }] },
    };
    const words = declared([{ who: "tool-looks", m }]);
    for (const [word, as] of [["styling", "interface"], ["shading", "interface"], ["chalk", "look"], ["attic", "studio"], ["wobble", "motion"], ["look_chalk.py", "a preset's file"], ["shared.py", "a preset's file"]])
      expect(words.get(word), word).toEqual([`tool-looks: ${as}`]);
    expect(pluginOptions([{ who: "tool-looks", m }]).get("grain")).toEqual(["tool-looks"]);
  });

  it("finds no word a plugin declares as a literal in core's source", () => {
    const words = declared();
    const hits: string[] = [];
    for (const { where, lit } of coreLiterals()) {
      if (words.has(lit.text) && !allowed(lit.text, where)) hits.push(`${where}: ${lit.as} "${lit.text}" - declared by ${words.get(lit.text)!.join(", ")}`);
    }
    expect([...new Set(hits)].sort()).toEqual([]);
  });

  it("finds no name a plugin gives in any literal of core's source, whatever its case", () => {
    const names = named();
    const namesIn = namesFinder([...names.keys()]);
    const hits: string[] = [];
    for (const { where, lit } of coreLiterals()) {
      for (const name of namesIn(lit.text)) if (!allowed(name, where)) hits.push(`${where}: ${lit.as} "${lit.text.slice(0, 80)}" - ${name}, ${names.get(name)!.join(", ")}`);
    }
    expect([...new Set(hits)].sort()).toEqual([]);
  });

  it("finds no word a worker says in core's source, but those Meno's general form defines (docs/PLUGINS.md, docs/WORKFLOWS-FOUNDATION.md)", () => {
    const said = workerWords();
    const contract = ["docs/PLUGINS.md", "docs/WORKFLOWS-FOUNDATION.md"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
    const hits: string[] = [];
    for (const { where, lit } of coreLiterals()) {
      if (said.has(lit.text) && !allowed(lit.text, where) && !new RegExp(`(?:^|[^\\w.-])${escaped(lit.text)}(?:$|[^\\w-])`).test(contract)) hits.push(`${where}: ${lit.as} "${lit.text}" - said by ${said.get(lit.text)!.join(", ")}`);
    }
    expect([...new Set(hits)].sort()).toEqual([]);
  });

  it("asks for no option of a plugin's by its id, but those that are Meno's own too", () => {
    const theirs = pluginOptions();
    const sourcesNow = sources();
    // (Meno's own options - its kinds', its roles' - by id, as its source declares them)
    const own = new Set<string>();
    for (const { file, lang } of sourcesNow) for (const m of codeOf(readFileSync(file, "utf8"), lang).matchAll(/\bid:\s*["'`]([\w-]+)["'`]/g)) own.add(m[1]);
    // (an option asked for by id - never a method of something called options, `options.open(path)`)
    const asked = [/\.id\s*[!=]==?\s*["'`]([\w-]+)["'`]/g, /["'`]([\w-]+)["'`]\s*[!=]==?\s*[\w.?]*\.id\b/g, /\boptions\??\.([A-Za-z_]\w*)\b(?!\s*\()/g, /\boptions\??\.?\[\s*["'`]([\w-]+)["'`]\s*\]/g];
    const hits: string[] = [];
    for (const { file, lang } of sourcesNow) {
      const where = relative(ROOT, file).split(sep).join("/");
      const code = codeOf(readFileSync(file, "utf8"), lang);
      for (const re of asked) for (const m of code.matchAll(re)) if (theirs.has(m[1]) && !own.has(m[1]) && !allowed(m[1], where)) hits.push(`${where}: option "${m[1]}" - declared by ${theirs.get(m[1])!.join(", ")}`);
    }
    expect([...new Set(hits)].sort()).toEqual([]);
  });

  it("keeps each allowed word allowed for a reason, and none that no plugin declares", () => {
    const words = declared();
    const names = named();
    const said = workerWords();
    const options = pluginOptions();
    for (const { word, why } of ALLOWED) {
      expect(why.length).toBeGreaterThan(10);
      expect(words.has(word) || names.has(word) || said.has(word) || options.has(word), `${word} is no longer declared by a plugin: take it off the list`).toBe(true);
    }
  });
});
