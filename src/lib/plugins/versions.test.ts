/**
 * The two meanings a manifest's version once mixed, kept apart (docs/PLUGINS.md, *Versions*): `version` is the plugin's own,
 * semver; `uses` names the programs and libraries it wraps with the version each says - and this test holds each to the lock or
 * pin the plugin carries, so that the two cannot drift: a pip lock's `name==version`, a pixi lock's `name-version-` package, the
 * commit a git pin names, or a download's own file name.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PLUGINS = join(__dirname, "../../../src-tauri/resources/plugins");
type Json = Record<string, unknown>;
const manifests = readdirSync(PLUGINS)
  .filter((d) => existsSync(join(PLUGINS, d, "manifest.json")))
  .map((d) => ({ dir: d, m: JSON.parse(readFileSync(join(PLUGINS, d, "manifest.json"), "utf8")) as Json }));

const SEMVER = /^\d+\.\d+\.\d+$/;
/** A version as a lock writes it: leading zeros of a part dropped (2026.03.6 is 2026.3.6). */
const plain = (v: string) => v.split(/([.+])/).map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p)).join("");

function pinned(dir: string, name: string, version: string): boolean {
  const lower = name.toLowerCase();
  const base = join(PLUGINS, dir);
  const [v, sha] = version.split("+");
  for (const file of ["requirements.lock", "pixi.lock"]) {
    const path = join(base, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    if (file === "requirements.lock") {
      // (a pip lock: name==version, or a git archive pinned by its commit)
      if (new RegExp(`^${lower}==${plain(v).replace(/\./g, "\\.")}\\b`, "mi").test(text)) return true;
      if (sha && new RegExp(`^${lower} @ .*${sha}`, "mi").test(text)) return true;
    } else if (text.includes(`/${lower}-${v}-`) || text.includes(`/${lower}-${plain(v)}-`)) return true;
  }
  // (a program fetched whole: its own file name says its version)
  for (const d of (base && (JSON.parse(readFileSync(join(base, "manifest.json"), "utf8")) as Json).downloads) as Json[] | undefined ?? []) {
    if (String(d.file ?? "").toLowerCase().includes(`${lower}-${v}`) || String(d.url ?? "").toLowerCase().includes(`${lower}-${v}`)) return true;
  }
  return false;
}

describe("a plugin's version and what it uses", () => {
  it("is the plugin's own, semver, and never the version of what it wraps", () => {
    for (const { dir, m } of manifests) expect(String(m.version), `${dir}'s version`).toMatch(SEMVER);
  });

  it("names, in `uses`, each program or library with the version its lock or pin fixes", () => {
    for (const { dir, m } of manifests) {
      for (const u of (m.uses as { name: string; version: string }[] | undefined) ?? []) {
        expect(pinned(dir, u.name, u.version), `${dir} says it uses ${u.name} ${u.version}, which no lock or pin of its own fixes`).toBe(true);
      }
    }
  });
});
