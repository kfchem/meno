import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsentRequest } from "./net/network";

// The app's side, as setting a plugin up meets it: its files by their paths
// (the app's resources and data alike), the commands it is given, and what
// the user answers when asked.
const files = new Map<string, string>();
// (where each was written and looked for: the app's resources, or its local data)
const wroteIn = new Map<string, string>();
const lookedIn = new Map<string, number>();
const commands: { cmd: string; args?: Record<string, unknown> }[] = [];
const asked: ConsentRequest[] = [];
const state = { missing: [] as string[], allowed: true, granted: new Set<string>() };

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1, Resource: 2, AppLocalData: 3 },
  exists: async (p: string, o?: { baseDir?: number }) => {
    lookedIn.set(p, o?.baseDir ?? 0);
    return files.has(p) || [...files.keys()].some((k) => k.startsWith(`${p}/`));
  },
  readTextFile: async (p: string) => {
    if (!files.has(p)) throw new Error(`no ${p}`);
    return files.get(p)!;
  },
  mkdir: async () => {},
}));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos", arch: () => "aarch64" }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>, options?: { headers?: Record<string, string> }) => {
    // (Meno's own file, written whole: by its path in the folder named)
    if (cmd === "write_app_file") {
      const rel = decodeURIComponent(options!.headers!.rel);
      wroteIn.set(rel, options!.headers!.base);
      return void files.set(rel, new TextDecoder().decode(args as unknown as Uint8Array));
    }
    commands.push({ cmd, args });
    if (cmd === "py_env_python_path_uv") return "/data/uv/plugin-blender/venv/bin/python";
    if (cmd === "py_env_setup_uv") return void files.set(VENV_PYTHON, "");
    if (cmd === "plugin_files") {
      if (args?.fetch) state.missing = [];
      return { folder: "/data/uv/plugin-blender/files", missing: state.missing, bytes: 0 };
    }
  },
}));
vi.mock("./net/network", () => ({
  // (a purpose allowed is not asked again - unless the request says to, as Meno's does: lib/net/network)
  askToConnect: async (r: ConsentRequest) => {
    if (state.granted.has(r.purpose) && !r.again) return true;
    asked.push(r);
    if (state.allowed) state.granted.add(r.purpose);
    return state.allowed;
  },
}));

const { ensurePyEnv, setUpFiles } = await import("./pyEnv");
const { PLUGINS } = await import("./calc/catalog");

const VENV_PYTHON = "uv/plugin-blender/venv/bin/python";
const STAMP = "uv/stamps/plugin-blender.json";
const blender = PLUGINS.find((p) => p.id === "blender")!;
const dmg = blender.downloads.find((d) => d.system === "macos")!;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("setting a plugin up, with what it downloads besides", () => {
  const LOCK = "# Python alone\n";
  beforeEach(() => {
    files.clear();
    files.set(blender.lock, LOCK);
    commands.length = 0;
    asked.length = 0;
    state.missing = [dmg.file];
    state.allowed = true;
    state.granted.clear();
  });
  const fetched = () => commands.some((c) => c.cmd === "plugin_files" && c.args?.fetch === true);
  const stamp = () => JSON.parse(files.get(STAMP) ?? "{}");

  it("downloads what is for this computer alone - its system, and processor, where a file says one", () => {
    expect(setUpFiles(blender, "macos", "aarch64").map((d) => d.file)).toEqual(["blender-5.2.2-macos-arm64.dmg"]);
    expect(setUpFiles(blender, "windows", "x86_64").map((d) => d.file)).toEqual(["blender-5.2.2-windows-x64.zip"]);
    expect(setUpFiles(blender, "windows", "aarch64").map((d) => d.file)).toEqual(["blender-5.2.2-windows-arm64.zip"]);
    expect(setUpFiles(blender, "macos", "x86_64")).toEqual([]);
    expect(setUpFiles(blender, "linux", "x86_64")).toEqual([]);
  });

  it("asks once, saying the program it fetches - its licence, its size and where it comes from - then sets it up and fetches it", async () => {
    await ensurePyEnv("plugin-blender");
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ purpose: "python-env:plugin-blender", title: "Download Blender?", again: true });
    expect(asked[0].detail).toContain("Blender 5.2.2 LTS (GPL-3.0-or-later licence, 346 MB) beside it");
    expect(asked[0].sources).toContain("Blender 5.2.2 LTS, from download.blender.org");
    expect(commands.map((c) => c.cmd)).toContain("py_env_setup_uv");
    expect(fetched()).toBe(true);
    // (the files the user was told of, kept with its record of being set up)
    expect(stamp()).toEqual({ lockSha: await sha256(LOCK), py: "3.12", files: [dmg.sha256] });
    // (the record, and the environment looked for, in the local data folder - not the roaming one the settings are in)
    expect(wroteIn.get(STAMP)).toBe("local");
    expect(lookedIn.get(STAMP)).toBe(3);
    expect(lookedIn.get(VENV_PYTHON)).toBe(3);
  });

  it("sends the hosts the consent named with what sets it up, and with what fetches its files: all each may reach", async () => {
    await ensurePyEnv("plugin-blender");
    expect(asked[0].hosts).toEqual(["releases.astral.sh", "download.blender.org"]);
    const setUp = commands.find((c) => c.cmd === "py_env_setup_uv")!;
    expect((setUp.args?.payload as { hosts: string[] }).hosts).toEqual(asked[0].hosts);
    // (the files alone, from their own host)
    expect(commands.find((c) => c.cmd === "plugin_files" && c.args?.fetch === true)?.args?.hosts).toEqual(["download.blender.org"]);
    // (where they stand is asked with none: nothing is fetched)
    expect(commands.find((c) => c.cmd === "plugin_files" && c.args?.fetch === false)?.args?.hosts).toBeUndefined();
  });

  it("sends the hosts the files' own consent named, where only the files are fetched", async () => {
    state.granted.add("python-env:plugin-blender");
    files.set(VENV_PYTHON, "");
    files.set(STAMP, JSON.stringify({ lockSha: await sha256(LOCK), py: "3.12" }));
    await ensurePyEnv("plugin-blender");
    expect(asked[0].hosts).toEqual(["download.blender.org"]);
    expect(commands.find((c) => c.cmd === "plugin_files" && c.args?.fetch === true)?.args?.hosts).toEqual(asked[0].hosts);
  });

  it("asks again, even where setting it up was allowed, where it has come to need a file the user was not told of", async () => {
    state.granted.add("python-env:plugin-blender");
    files.set(VENV_PYTHON, "");
    files.set(STAMP, JSON.stringify({ lockSha: await sha256(LOCK), py: "3.12" }));
    await ensurePyEnv("plugin-blender");
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ again: true });
    expect(asked[0].detail).toMatch(/^The Blender plugin needs Blender 5\.2\.2 LTS \(GPL-3\.0-or-later licence, 346 MB\), downloaded once/);
    expect(commands.map((c) => c.cmd)).not.toContain("py_env_setup_uv");
    expect(fetched()).toBe(true);
    expect(stamp().files).toEqual([dmg.sha256]);
  });

  it("takes up a download cut short under the leave given, not asking again where the user was told of it", async () => {
    state.granted.add("python-env:plugin-blender");
    files.set(VENV_PYTHON, "");
    files.set(STAMP, JSON.stringify({ lockSha: await sha256(LOCK), py: "3.12", files: [dmg.sha256] }));
    await ensurePyEnv("plugin-blender");
    expect(asked).toEqual([]);
    expect(fetched()).toBe(true);
  });

  it("fetches nothing where the user says no", async () => {
    state.allowed = false;
    await expect(ensurePyEnv("plugin-blender")).rejects.toThrow(/was not allowed it/);
    expect(commands.map((c) => c.cmd)).not.toContain("py_env_setup_uv");
    expect(fetched()).toBe(false);
    expect(files.has(STAMP)).toBe(false);
  });

  it("asks nothing, and fetches nothing, once all of it is there", async () => {
    files.set(VENV_PYTHON, "");
    files.set(STAMP, JSON.stringify({ lockSha: await sha256(LOCK), py: "3.12", files: [dmg.sha256] }));
    state.missing = [];
    await ensurePyEnv("plugin-blender");
    expect(asked).toEqual([]);
    expect(fetched()).toBe(false);
  });
});
