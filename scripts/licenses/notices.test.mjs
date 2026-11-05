import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { measured } from "../../src/testing/timeouts";
import { bundledNpm, lockedCrates, MANIFEST, NOTICES, ROOT } from "./notices.mjs";

// The third-party notices (docs/RELEASING.md, *Third-party notices*) kept up
// with what Meno is built from: each check fails while `npm run notices` has
// not been run since a dependency changed. The npm packages are read off a
// build of the window, as the generator reads them; the crates are checked
// against Cargo.lock by the record the generator keeps (bundled.json), as
// Cargo's own graph needs Cargo and the crates' sources, which the frontend
// job has not got.

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const notices = readFileSync(NOTICES, "utf8");
const RULE = "=".repeat(80);
const named = (p) => `${p.name}@${p.version}`;
const STALE = "the notices are behind: run `npm run notices`";

describe("the third-party notices", () => {
  it("name every npm package whose code is in Meno's window, at the version built", async () => {
    const built = (await bundledNpm()).map((p) => ({ name: p.name, version: p.version, license: p.license, lock: p.lock }));
    expect(built, STALE).toEqual(manifest.npm);
  }, measured(2500));

  it("name each npm package at the version package-lock.json installs", () => {
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")).packages;
    for (const p of manifest.npm) expect(lock[p.lock]?.version, `${p.lock}: ${STALE}`).toBe(p.version);
  });

  it("account for every crate in Cargo.lock: built into Meno, or not", () => {
    const toml = readFileSync(join(ROOT, "src-tauri", "Cargo.toml"), "utf8");
    const meno = `${/^name = "(.+)"$/m.exec(toml)[1]}@${/^version = "(.+)"$/m.exec(toml)[1]}`;
    const locked = lockedCrates(readFileSync(join(ROOT, "src-tauri", "Cargo.lock"), "utf8")).filter((k) => k !== meno);
    const recorded = [...manifest.crates.map(named), ...manifest.cratesLeftOut];
    expect([...new Set(recorded)].length, "a crate recorded twice").toBe(recorded.length);
    expect([...locked].sort(), STALE).toEqual([...recorded].sort());
  });

  it("give a notice for every package and crate recorded, with its licence", () => {
    for (const p of [...manifest.npm, ...manifest.crates]) {
      expect(notices, `${named(p)}: ${STALE}`).toContain(`${RULE}\n${p.name} ${p.version}\nLicense: ${p.license ?? "(none given)"}\n`);
    }
    const entries = notices.split(`${RULE}\n`).filter((e) => /^\S+ \S+\nLicense: /.test(e));
    expect(entries.length).toBe(manifest.npm.length + manifest.crates.length);
  });

  it("give every crate and npm package a licence text: its own, a standard one, or one read from its repository", () => {
    expect(notices, "a crate with no licence text: read its licence from its repository into upstream.json").not.toContain("Its Cargo.toml gives its licence as");
    expect(notices, "an npm package with no licence text: read its licence from its repository into upstream.json").not.toContain("Its package.json gives its licence as");
    // (each text read from a repository is for a crate or package built in, at its version: one for a version no longer built in is stale)
    const upstream = JSON.parse(readFileSync(join(ROOT, "scripts", "licenses", "upstream.json"), "utf8"));
    const kept = (f) => existsSync(join(ROOT, "scripts", "licenses", "upstream", f));
    for (const t of upstream.texts) {
      const built = (t.kind === "npm" ? manifest.npm : manifest.crates).map(named);
      expect(built, `upstream.json: ${t.for}@${t.version} is not built into Meno`).toContain(`${t.for}@${t.version}`);
      for (const f of [t.file, ...(t.also ?? []).map((a) => a.file)]) expect(kept(f), f).toBe(true);
    }
    for (const c of upstream.carried ?? []) {
      expect(manifest.npm.map(named), `upstream.json: what ${c.in}@${c.version} carries, which is not in Meno's window`).toContain(`${c.in}@${c.version}`);
      if (c.file) expect(kept(c.file), c.file).toBe(true);
    }
  });

  it("are plain text with LF line ends, and name the notices beside them", () => {
    expect(notices).not.toContain("\r");
    expect(notices.endsWith("\n") && !notices.endsWith("\n\n")).toBe(true);
    for (const name of ["PDFium-*", "pdfium-render-*", "IBM-Plex-OFL.txt", "Arimo-OFL.txt", "ACCeL-MIT.txt"]) expect(notices).toContain(`  ${name} `);
    // (each plugin Meno carries whose own code is under another licence, its LICENSE in its folder: named - docs/PLUGINS.md, *Licences*)
    const plugins = join(ROOT, "src-tauri", "resources", "plugins");
    const own = readdirSync(plugins).filter((id) => existsSync(join(plugins, id, "LICENSE")));
    expect(own.length).toBeGreaterThan(0);
    for (const id of own) expect(notices, id).toMatch(new RegExp(`resources/plugins/${id}(?![\\w-])`));
  });

  it("are carried by the app on every system, where Settings reads them", () => {
    for (const conf of ["tauri.conf.json", "tauri.macos.conf.json", "tauri.windows.conf.json"]) {
      const resources = JSON.parse(readFileSync(join(ROOT, "src-tauri", conf), "utf8")).bundle.resources;
      expect(resources.some((r) => r === "resources/licenses/*" || r === "resources/**/*"), conf).toBe(true);
    }
  });
});
