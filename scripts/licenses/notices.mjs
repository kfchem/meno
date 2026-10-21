#!/usr/bin/env node
/**
 * The notices of the software by others that Meno is built with and carries
 * (docs/RELEASING.md, *Third-party notices*): the npm packages whose code is
 * in Meno's window, and the Rust crates built into its program - each one's
 * name, version and licence, and the licence and notice files that come
 * with it - written to src-tauri/resources/licenses/THIRD-PARTY-NOTICES.txt,
 * which the app carries and Settings shows. Run by hand before a release,
 * and whenever a dependency changes; the test beside this file fails while
 * the notices are behind the lock files.
 *
 *   npm run notices
 *
 * Nothing is fetched. What is in the window is read off a build of it (into
 * a folder of its own, dist/ untouched): every module that goes into its
 * output, the workers' included, mapped to the package it is in. What is in
 * the program is the graph Cargo resolves for the systems Meno is released
 * for, its normal dependencies from Meno on - proc-macros among them, as the
 * code they write is built in; not build scripts' or tests' - with each
 * crate's files read from its own folder in Cargo's registry. A crate with no
 * licence file is given its licence's standard text only where that text
 * comes with another crate here (as the Apache License 2.0's does); the rest
 * are named as having none.
 *
 * Beside the notices, scripts/licenses/bundled.json keeps each package's
 * name, version and licence, and the crates in the lock file that are not
 * built in, for the test to check the lock files against without Cargo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LICENSES = join(ROOT, "src-tauri", "resources", "licenses");
export const NOTICES = join(LICENSES, "THIRD-PARTY-NOTICES.txt");
export const MANIFEST = join(ROOT, "scripts", "licenses", "bundled.json");

/**
 * The systems the program is built for. Released: the Mac on Apple silicon
 * and 64-bit Windows (.github/workflows/release.yml). The Intel Mac as well,
 * a system Meno's tools are pinned for (src-tauri/src/tools.rs), so that a
 * build for it is covered too; it adds no crate today.
 */
export const TARGETS = ["aarch64-apple-darwin", "x86_64-apple-darwin", "x86_64-pc-windows-msvc"];

/** A licence or notice file, by its name: at the top of a package's folder, not code. */
const LICENCE_FILE = /^(un)?licen[cs]e|^copying|^copyright|^notice/i;
const NOT_A_TEXT = /\.(rs|js|mjs|cjs|ts|d\.ts|json|toml|ya?ml|py|sh|html?)$/i;

/** Two strings compared by their code units, as no locale orders them otherwise. */
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Versions in order: their numbers as numbers, the rest by code units. */
function byVersion(a, b) {
  const pa = a.split(/[.+-]/);
  const pb = b.split(/[.+-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    if (x === y) continue;
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) return Number(x) - Number(y);
    return byCode(x, y);
  }
  return 0;
}
const byNameVersion = (a, b) => byCode(a.name, b.name) || byVersion(a.version, b.version);

/** A licence file's text as the notices give it: LF line ends, no trailing spaces, no BOM, no blank lines at either end. */
export function cleanText(text) {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/** The licence and notice files at the top of `dir`, by name. */
function licenceFiles(dir) {
  return readdirSync(dir)
    .filter((n) => LICENCE_FILE.test(n) && !NOT_A_TEXT.test(n) && statSync(join(dir, n)).isFile())
    .sort(byCode)
    .map((n) => ({ name: n, text: cleanText(readFileSync(join(dir, n), "utf8")) }));
}

/** A repository as a link: npm's shorthands and `git+` prefixes made plain. */
function repositoryUrl(repo) {
  let url = typeof repo === "string" ? repo : repo?.url;
  if (!url) return null;
  url = url.replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\//, "https://").replace(/^ssh:\/\/git@/, "https://");
  if (/^github:/.test(url)) url = `https://github.com/${url.slice("github:".length)}`;
  else if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
  return url;
}

/** An npm package's licence as its package.json gives it: `license`, or the older `licenses` list. */
function npmLicence(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
  return null;
}

// ---------------------------------------------------------------- npm

/**
 * The npm packages whose code is in Meno's window: the app built as `npm run
 * build` builds it, into a folder of its own, with a plugin that notes every
 * module each output file holds - the main bundle's and each worker's - and
 * the style sheets they bring (Tailwind's, by its `@import`). Each module is
 * the package of the folder after its last `node_modules/`; Vite's and
 * Rolldown's own helpers, which have no file, are theirs.
 */
export async function bundledNpm(root = ROOT) {
  const { build } = await import("vite");
  const modules = new Set();
  const styles = new Set();
  const assets = new Set();
  const recorder = (tag) => ({
    name: `meno-notices-${tag}`,
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk") {
          for (const [id, info] of Object.entries(file.modules)) {
            if (/\.css(\?|$)/.test(id)) styles.add(id);
            else if (info.renderedLength > 0) modules.add(id);
          }
        } else {
          for (const name of file.originalFileNames ?? []) assets.add(name);
        }
      }
    },
  });
  const out = mkdtempSync(join(tmpdir(), "meno-notices-"));
  try {
    await build({
      root,
      configFile: join(root, "vite.config.ts"),
      logLevel: "silent",
      build: { outDir: out, emptyOutDir: true, reportCompressedSize: false },
      plugins: [
        recorder("main"),
        {
          // (the workers are built with their own plugins: the recorder added to them, after any the config has)
          name: "meno-notices-workers",
          config(config) {
            const theirs = config.worker?.plugins;
            config.worker = { ...(config.worker ?? {}), plugins: () => [...(theirs ? theirs() : []), recorder("worker")] };
          },
        },
      ],
    });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }

  const nodeModules = realpathSync(join(root, "node_modules"));
  const found = new Map();
  const unplaced = [];
  const take = (dir) => {
    const lock = `node_modules/${relative(nodeModules, dir).split(sep).join("/")}`;
    if (found.has(lock)) return;
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    found.set(lock, { name: pkg.name, version: pkg.version, license: npmLicence(pkg), repository: repositoryUrl(pkg.repository) ?? pkg.homepage ?? null, lock, dir });
  };
  const packageDirOf = (file) => {
    const real = existsSync(file) ? realpathSync(file) : file;
    const parts = real.split(sep);
    const at = parts.lastIndexOf("node_modules");
    if (at < 0) return null;
    const n = parts[at + 1]?.startsWith("@") ? 2 : 1;
    return parts.slice(0, at + 1 + n).join(sep);
  };

  for (const raw of modules) {
    const id = raw.split("?")[0];
    if (id.startsWith("\0")) {
      // (a helper the bundler writes in: `\0vite/...` is Vite's, `\0rolldown/...` Rolldown's)
      const name = id.slice(1).split("/")[0];
      const dir = findPackage(name, join(nodeModules, "vite"), nodeModules);
      if (dir) take(dir);
      else unplaced.push(raw);
      continue;
    }
    const dir = packageDirOf(id);
    if (dir) take(dir);
    else if (!existsSync(id) || !realpathSync(id).startsWith(realpathSync(root) + sep)) unplaced.push(raw);
  }
  for (const raw of styles) {
    const id = raw.split("?")[0];
    const dir = packageDirOf(id);
    if (dir) take(dir);
    for (const imported of styleImports(id, nodeModules)) take(imported);
  }
  for (const name of assets) {
    const dir = name.includes("node_modules") ? packageDirOf(join(root, name)) : null;
    if (dir) take(dir);
  }
  if (unplaced.length) throw new Error(`modules in the build that belong to no package:\n  ${unplaced.join("\n  ")}`);

  return [...found.values()].sort(byNameVersion).map((p) => ({ ...p, files: licenceFiles(p.dir) }));
}

/** The folder of the package `name` as Node finds it from `from`: each `node_modules` up to the root's. */
function findPackage(name, from, nodeModules) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dir === dirname(nodeModules) || dir === dirname(dir)) break;
  }
  const top = join(nodeModules, name);
  return existsSync(join(top, "package.json")) ? realpathSync(top) : null;
}

/** The packages a style sheet brings in by `@import`, and those its own style sheets bring in turn. */
function styleImports(file, nodeModules, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return [];
  seen.add(file);
  const out = [];
  const css = readFileSync(file, "utf8");
  for (const m of css.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/g)) {
    const spec = m[1];
    if (/^(https?:|data:)/.test(spec)) continue;
    if (spec.startsWith(".") || spec.startsWith("/")) {
      out.push(...styleImports(join(dirname(file), spec), nodeModules, seen));
    } else {
      const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      const dir = findPackage(name, dirname(file), nodeModules);
      if (!dir) throw new Error(`${file}: @import "${spec}" names no installed package`);
      out.push(dir);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Rust

/**
 * The crates built into Meno's program: for each system in TARGETS, the
 * graph `cargo metadata --filter-platform` resolves for it, followed from
 * Meno along normal dependencies only (a proc-macro is one), and the
 * systems' crates taken together. Each one's files are read from the folder
 * of its own manifest. Cargo resolves this graph with every feature any of
 * its users asks for, build scripts' among them, so it can hold a crate or
 * two more than a build does - never fewer.
 */
export function shippedCrates(root = ROOT) {
  const crates = new Map();
  for (const target of TARGETS) {
    const meta = JSON.parse(
      execFileSync("cargo", ["metadata", "--format-version", "1", "--locked", "--offline", "--filter-platform", target], {
        cwd: join(root, "src-tauri"),
        maxBuffer: 256 * 1024 * 1024,
        encoding: "utf8",
      }),
    );
    const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
    const packages = new Map(meta.packages.map((p) => [p.id, p]));
    const reached = new Set();
    const todo = [meta.resolve.root];
    while (todo.length) {
      const id = todo.pop();
      for (const dep of nodes.get(id).deps) {
        if (dep.dep_kinds.some((k) => k.kind === null) && !reached.has(dep.pkg)) {
          reached.add(dep.pkg);
          todo.push(dep.pkg);
        }
      }
    }
    for (const id of reached) {
      const p = packages.get(id);
      if (!p.source) throw new Error(`${p.name} ${p.version} is not from a registry (${p.manifest_path}): give its notice by hand`);
      const key = `${p.name}@${p.version}`;
      if (!crates.has(key)) {
        const dir = dirname(p.manifest_path);
        const files = licenceFiles(dir);
        if (p.license_file && !files.some((f) => f.name === p.license_file)) {
          files.push({ name: p.license_file, text: cleanText(readFileSync(join(dir, p.license_file), "utf8")) });
        }
        crates.set(key, { name: p.name, version: p.version, license: p.license ?? null, repository: repositoryUrl(p.repository), authors: (p.authors ?? []).map((a) => a.replace(/\s*<[^>]*>/, "")), files });
      }
    }
  }
  const list = [...crates.values()].sort(byNameVersion);
  // (the lock's crates not built in: build scripts' and tests', and other systems'; Meno itself not among them)
  const meno = JSON.parse(execFileSync("cargo", ["metadata", "--format-version", "1", "--locked", "--offline", "--no-deps"], { cwd: join(root, "src-tauri"), encoding: "utf8" })).packages.map((p) => `${p.name}@${p.version}`);
  const lock = lockedCrates(readFileSync(join(root, "src-tauri", "Cargo.lock"), "utf8"));
  const leftOut = [...new Set(lock)].filter((k) => !crates.has(k) && !meno.includes(k)).sort(byCode);
  return { crates: list, leftOut };
}

/** A Cargo.lock's packages, each `name@version`, read without a TOML parser (as scripts/check-tauri-versions.mjs does). */
export function lockedCrates(lockText) {
  const out = [];
  let name = null;
  for (const raw of lockText.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "[[package]]") name = null;
    else if (line.startsWith('name = "')) name = line.slice('name = "'.length, -1);
    else if (name && line.startsWith('version = "')) {
      out.push(`${name}@${line.slice('version = "'.length, -1)}`);
      name = null;
    }
  }
  return out;
}

// ---------------------------------------------------------------- the notices

/** Licences whose terms reach past permission and notice: each file, or the whole, to be offered as source. */
const COPYLEFT = /\b(MPL|LGPL|GPL|AGPL|EPL|CDDL|EUPL|CPL|OSL)-/;

/**
 * The standard texts a package with no licence file may be given: the one
 * that comes with most of the crates here under that licence, checked by
 * its opening words. Only licences whose text names no one - not the MIT
 * or BSD licences, whose copyright lines are each package's own.
 */
const STANDARD = [
  { id: "Apache-2.0", title: "Apache License 2.0", file: /apache/i, opens: /^\s*Apache License\s+Version 2\.0, January 2004/ },
  { id: "MPL-2.0", title: "Mozilla Public License 2.0", file: /./, opens: /^\s*Mozilla Public License Version 2\.0/ },
];

function standardTexts(crates) {
  const texts = new Map();
  for (const s of STANDARD) {
    const counts = new Map();
    for (const c of crates) {
      if (!new RegExp(`\\b${s.id.replace(/[.]/g, "\\.")}\\b`).test(c.license ?? "")) continue;
      for (const f of c.files) {
        if (!s.file.test(f.name) || !s.opens.test(f.text)) continue;
        const seen = counts.get(f.text) ?? { n: 0, from: `${c.name} ${c.version} (${f.name})` };
        seen.n++;
        counts.set(f.text, seen);
      }
    }
    const best = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || byCode(a[1].from, b[1].from))[0];
    if (best) texts.set(s.id, { ...s, text: best[0], from: best[1].from });
  }
  return texts;
}

/** The notices beside this file, as its head names them. */
const OTHER_NOTICES = [
  { name: "PDFium-*", files: /^PDFium-/, what: "PDFium, and what it is built with" },
  { name: "pdfium-render-*", files: /^pdfium-render-/, what: "pdfium-render, the Rust crate Meno reaches PDFium through" },
  { name: "IBM-Plex-OFL.txt", files: /^IBM-Plex-/, what: "the IBM Plex typefaces" },
  { name: "Arimo-OFL.txt", files: /^Arimo-/, what: "Arimo, which the outlines of Arial labels are worked out from" },
  { name: "ACCeL-MIT.txt", files: /^ACCeL-/, what: "ACCeL, which Meno's reaction atom mapper is ported from" },
];

/**
 * What the files of a package leave out, found by reading it: code by others
 * it carries in itself, and where that code's licence is to be found.
 */
const NOTES = {
  "@react-three/fiber":
    "Its build carries React's reconciler (react-reconciler), copyright Meta Platforms, Inc. and affiliates, under the MIT License: the text given for react in Part 1.",
  "webview2-com-sys":
    "On Windows it links into Meno's program the WebView2 loader (WebView2LoaderStatic.lib) from Microsoft's WebView2 SDK, which comes with the crate; the SDK's own licence does not.",
};

const RULE = "=".repeat(80);
const THIN = "-".repeat(80);

/** The notices, and the record the test checks the lock files against. */
export function compose(npm, { crates, leftOut }) {
  const standard = standardTexts(crates);
  const firstSeen = new Map();
  const missing = [];
  const copyleft = [];

  const entry = (kind, p) => {
    const lines = [RULE, `${p.name} ${p.version}`, `License: ${p.license ?? "(none given)"}`];
    if (p.repository) lines.push(`Repository: ${p.repository}`);
    if (kind === "crate" && COPYLEFT.test(p.license ?? "")) {
      // (MPL-2.0 3.2: where the Source Code Form of what is carried can be had)
      lines.push(`Source Code Form: ${p.repository ? `${p.repository}, and ` : ""}https://crates.io/crates/${p.name}/${p.version}`);
      copyleft.push(`${p.name} ${p.version} (${p.license})`);
    } else if (kind === "npm" && COPYLEFT.test(p.license ?? "")) {
      copyleft.push(`${p.name} ${p.version} (${p.license})`);
    }
    if (!p.license) copyleft.push(`${p.name} ${p.version} (no licence given)`);
    lines.push(THIN);
    if (NOTES[p.name]) lines.push(NOTES[p.name], "");
    const own = `${p.name} ${p.version}`;
    let files = p.files;
    if (!files.length) {
      // (the standard text stands for the whole licence only where the crate may be taken under it alone)
      const alone = !/\bAND\b/.test(p.license ?? "");
      const fallback = kind === "crate" && alone ? [...standard.values()].find((s) => new RegExp(`\\b${s.id.replace(/[.]/g, "\\.")}\\b`).test(p.license ?? "")) : null;
      if (fallback) {
        const which = /\bOR\b|\//.test(p.license) ? "one of the licences it is offered under" : "its licence";
        lines.push(`No licence file comes with this crate. The standard text of the ${fallback.title}, ${which}, is given as it comes with ${fallback.from}.`);
        files = [{ name: fallback.id, text: fallback.text, standard: true }];
        missing.push(`${own} (${p.license}): standard ${fallback.id} text given`);
      } else {
        const from = kind === "crate" ? "Cargo.toml" : "package.json";
        const authors = kind === "crate" && p.authors.length ? ` Its authors, as its manifest names them: ${p.authors.join(", ")}.` : "";
        lines.push(`No licence file comes with this ${kind === "crate" ? "crate" : "package"}. Its ${from} gives its licence as: ${p.license ?? "(none)"}.${authors}`);
        missing.push(`${own} (${p.license ?? "none"}): no text`);
      }
    }
    for (const f of files) {
      const seen = firstSeen.get(f.text);
      if (seen) {
        lines.push("", `${f.standard ? `The ${f.name} text` : f.name}: the same text as for ${seen}, above.`);
      } else {
        firstSeen.set(f.text, `${own} (${f.standard ? `the standard ${f.name} text` : f.name})`);
        lines.push("", `${f.standard ? `The ${f.name} text` : f.name}:`, "", f.text);
      }
    }
    lines.push("");
    return lines.join("\n");
  };

  const own = readdirSync(LICENSES).filter((n) => n !== "THIRD-PARTY-NOTICES.txt").sort(byCode);
  const groups = OTHER_NOTICES.filter((g) => own.some((n) => g.files.test(n)));
  const ungrouped = own.filter((n) => !OTHER_NOTICES.some((g) => g.files.test(n)));
  const head = [
    "THIRD-PARTY NOTICES",
    "",
    "Meno is licensed under the Apache License 2.0. It is built with, and",
    "carries, software by others, each under its own licence. This file gives,",
    "for each such package, its name, version and licence, where its source is",
    "kept, and the licence and notice files that come with it:",
    "",
    `  Part 1. npm packages in Meno's window (${npm.length})`,
    `  Part 2. Rust crates built into Meno's program (${crates.length})`,
    "",
    "A text already given in full is not given again: the package names its",
    "file and where the text was first given.",
    "",
    "These notices come with Meno in files of their own, beside this one:",
    "",
    ...groups.map((g) => `  ${g.name.padEnd(20)}${g.what}`),
    ...ungrouped.map((n) => `  ${n}`),
    "",
    "The Blender plugin's own scripts are licensed under the GNU General Public",
    "License, version 3 or later; its licence's text (LICENSE) is in its folder,",
    "resources/plugins/blender.",
    "",
    "Written by scripts/licenses/notices.mjs (npm run notices) from a build of",
    "Meno and its lock files.",
    "",
  ];
  const text = [
    ...head,
    RULE,
    "Part 1. npm packages in Meno's window",
    "",
    ...npm.map((p) => entry("npm", p)),
    RULE,
    "Part 2. Rust crates built into Meno's program",
    `(for ${TARGETS.join(", ")})`,
    "",
    ...crates.map((c) => entry("crate", c)),
  ].join("\n");

  const manifest = {
    targets: TARGETS,
    npm: npm.map((p) => ({ name: p.name, version: p.version, license: p.license, lock: p.lock })),
    crates: crates.map((c) => ({ name: c.name, version: c.version, license: c.license })),
    cratesLeftOut: leftOut,
  };
  return { text: `${text.replace(/\n+$/, "")}\n`, manifest, missing, copyleft };
}

async function main() {
  const npm = await bundledNpm();
  const rust = shippedCrates();
  const { text, manifest, missing, copyleft } = compose(npm, rust);
  writeFileSync(NOTICES, text);
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${relative(ROOT, NOTICES)}: ${npm.length} npm packages, ${rust.crates.length} crates, ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
  if (missing.length) console.log(`\nWith no licence file of their own:\n  ${missing.join("\n  ")}`);
  if (copyleft.length) console.log(`\nUnder a licence that asks more than a notice, or none:\n  ${copyleft.join("\n  ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
