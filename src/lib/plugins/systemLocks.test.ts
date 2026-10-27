/**
 * A plugin's environment is set up from the one lock it carries
 * (requirements.lock), on whichever system it is added: so a plugin said to
 * be added on a system - or on any, saying none (manifest.json, `systems`) -
 * carries a lock made for every system, its packages for each by their
 * markers, never one resolved for a single platform.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PLUGINS = join(__dirname, "../../../src-tauri/resources/plugins");

describe("each plugin's lock", () => {
  it("is made for every system it may be added on", () => {
    let seen = 0;
    for (const id of readdirSync(PLUGINS)) {
      const lock = join(PLUGINS, id, "requirements.lock");
      if (!existsSync(lock)) continue;
      const command = readFileSync(lock, "utf8").split("\n").find((l) => l.includes("uv pip compile"));
      if (!command) continue;
      const systems = (JSON.parse(readFileSync(join(PLUGINS, id, "manifest.json"), "utf8")) as { systems?: string[] }).systems ?? [];
      // (one platform's lock would do for a plugin added on one system alone: none does so now)
      if (systems.length === 1) continue;
      expect(command, id).toContain("--universal");
      expect(command, id).not.toContain("--python-platform");
      seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("is REINVENT 4's for macOS and Windows: torch the package index's, which on Windows is built for the CPU, and none of its Linux GPU libraries", () => {
    const manifest = JSON.parse(readFileSync(join(PLUGINS, "reinvent", "manifest.json"), "utf8")) as { systems: string[] };
    expect(manifest.systems).toEqual(["macos", "windows"]);
    const lock = readFileSync(join(PLUGINS, "reinvent", "requirements.lock"), "utf8");
    expect(lock).toMatch(/^torch==\S+ \\$/m);
    expect(lock).toContain("--no-sources");
    expect(lock).not.toMatch(/^(nvidia-|triton|cuda-)/m);
    // (Windows' own, by its marker)
    expect(lock).toMatch(/^colorama==\S+ ; sys_platform == 'win32'/m);
  });
});
