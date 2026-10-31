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
const state = { missing: [] as string[], changed: [] as string[], unreadable: [] as string[], allowed: true, granted: new Set<string>(), checkMs: 0 };

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
      if (args?.fetch) state.missing = state.changed = [];
      // (asked only whether they are there: none read through - one changed at its own size not known - and at once)
      if (args?.through === false) return { folder: "/data/uv/plugin-blender/files", missing: state.missing.filter((f) => !state.changed.includes(f)), bytes: 0, changed: [], unreadable: [] };
      // (a check that takes a while: its files read through)
      if (!args?.fetch && state.checkMs) {
        await new Promise((r) => setTimeout(r, state.checkMs));
        checkingSeen.push(...Object.values(useCheckingFiles.getState()));
      }
      return { folder: "/data/uv/plugin-blender/files", missing: state.missing, bytes: 0, changed: state.changed, unreadable: state.unreadable };
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

const { ensurePyEnv, pyEnvReady, setUpFiles, setUpQuestions, useCheckingFiles } = await import("./pyEnv");
// (what was said of a check of its files, as the check went)
const checkingSeen: string[] = [];
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
    state.changed = [];
    state.unreadable = [];
    state.checkMs = 0;
    checkingSeen.length = 0;
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

  it("says plainly a file there that is not the one Meno downloaded, and asks again before fetching it anew - even where it was allowed", async () => {
    state.granted.add("python-env:plugin-blender");
    files.set(VENV_PYTHON, "");
    files.set(STAMP, JSON.stringify({ lockSha: await sha256(LOCK), py: "3.12", files: [dmg.sha256] }));
    // (as the app's side says of a file kept as it is - a model's weights - whose SHA-256 it read through: any it names is said)
    state.changed = [dmg.file];
    await ensurePyEnv("plugin-blender");
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ again: true });
    expect(asked[0].detail.startsWith(`${dmg.file} is not the file Meno downloaded: its size or fingerprint (SHA-256) is not the one Meno carries - changed, or damaged, since. The Blender plugin needs`)).toBe(true);
    expect(fetched()).toBe(true);
  });

  it("says it too where the user says no to fetching it anew - and fetches nothing", async () => {
    state.granted.add("python-env:plugin-blender");
    files.set(VENV_PYTHON, "");
    files.set(STAMP, JSON.stringify({ lockSha: await sha256(LOCK), py: "3.12", files: [dmg.sha256] }));
    state.changed = [dmg.file];
    state.allowed = false;
    await expect(ensurePyEnv("plugin-blender")).rejects.toThrow(/is not the file Meno downloaded/);
    expect(fetched()).toBe(false);
  });

  it("says a file there it could not read, with why - neither asking nor fetching over it - and reads it again the next time", async () => {
    state.granted.add("python-env:plugin-blender");
    files.set(VENV_PYTHON, "");
    files.set(STAMP, JSON.stringify({ lockSha: await sha256(LOCK), py: "3.12", files: [dmg.sha256] }));
    state.missing = [];
    state.unreadable = [`${dmg.file}: Permission denied (os error 13)`];
    await expect(ensurePyEnv("plugin-blender")).rejects.toThrow(`${dmg.file}: Permission denied (os error 13) - it could not be read, so Blender cannot run. Meno reads it again the next time.`);
    expect(asked).toEqual([]);
    expect(fetched()).toBe(false);
    // (readable again: asked about again, and nothing said)
    state.unreadable = [];
    await ensurePyEnv("plugin-blender");
    expect(commands.filter((c) => c.cmd === "plugin_files" && c.args?.fetch === false)).toHaveLength(2);
  });

  it("says its files are being checked where that takes more than a moment - and nothing once done", async () => {
    files.set(VENV_PYTHON, "");
    files.set(STAMP, JSON.stringify({ lockSha: await sha256(LOCK), py: "3.12", files: [dmg.sha256] }));
    state.missing = [];
    state.checkMs = 400;
    await ensurePyEnv("plugin-blender");
    expect(checkingSeen).toEqual(["Blender"]);
    expect(useCheckingFiles.getState()).toEqual({});
  });

  it("asks only whether its files are there where whether it is added is asked, as at launch - none read through, nothing said - and reads them through as it is used, where one changed at its own size is caught", async () => {
    state.granted.add("python-env:plugin-blender");
    files.set(VENV_PYTHON, "");
    files.set(STAMP, JSON.stringify({ lockSha: await sha256(LOCK), py: "3.12", files: [dmg.sha256] }));
    // (its weights other bytes at their own size: what reading them through finds - and fetches anew, as the app's side says it)
    state.missing = [dmg.file];
    state.changed = [dmg.file];
    state.checkMs = 400;
    expect(await pyEnvReady("plugin-blender")).toBe(true);
    expect(commands.filter((c) => c.cmd === "plugin_files").map((c) => c.args?.through)).toEqual([false]);
    expect(checkingSeen).toEqual([]);
    expect(asked).toEqual([]);
    // (used: read through - said, as it takes a while - and the changed file caught, asked about before it is fetched anew)
    await ensurePyEnv("plugin-blender");
    expect(commands.filter((c) => c.cmd === "plugin_files" && c.args?.fetch === false).map((c) => c.args?.through)).toEqual([false, undefined]);
    expect(checkingSeen).toEqual(["Blender"]);
    expect(asked).toHaveLength(1);
    expect(asked[0].detail.startsWith(`${dmg.file} is not the file Meno downloaded`)).toBe(true);
  });

  it("gathers what it would ask, with others, setting nothing up and fetching nothing", async () => {
    const questions = await setUpQuestions("plugin-blender");
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ purpose: "python-env:plugin-blender", title: "Download Blender?" });
    expect(asked).toEqual([]);
    expect(commands.map((c) => c.cmd)).not.toContain("py_env_setup_uv");
    expect(fetched()).toBe(false);
  });

  it("asked with others and allowed, sets up without asking again - but asks where that leave was withdrawn since, or what it asks is not what was asked, and fetches nothing on a no", async () => {
    // (allowed in the one question: not asked again, though what it fetches is more than it was told of)
    const gathered = await setUpQuestions("plugin-blender");
    state.granted.add("python-env:plugin-blender");
    await ensurePyEnv("plugin-blender", { asked: gathered });
    expect(asked).toEqual([]);
    expect(commands.map((c) => c.cmd)).toContain("py_env_setup_uv");
    // (the leave withdrawn between the question and its set-up: asked again; no, and nothing is set up)
    files.clear();
    files.set(blender.lock, LOCK);
    commands.length = 0;
    state.granted.clear();
    state.allowed = false;
    await expect(ensurePyEnv("plugin-blender", { asked: gathered })).rejects.toThrow(/was not allowed it/);
    expect(asked).toHaveLength(1);
    expect(commands.map((c) => c.cmd)).not.toContain("py_env_setup_uv");
    // (a question not among those asked with others - its words changed since: a file found changed, say - asked as ever)
    asked.length = 0;
    state.granted.add("python-env:plugin-blender");
    state.allowed = true;
    await ensurePyEnv("plugin-blender", { asked: [{ ...gathered[0], detail: "What was asked then." }] });
    expect(asked).toHaveLength(1);
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

describe("a file a plugin downloads, as asking to set it up says it", () => {
  it("says its licence and size - unpacked too, where Meno unpacks it - and how its makers ask to be cited", async () => {
    const { fileSaid } = await import("./pyEnv");
    const weights = { file: "model.pth", name: "Its trained model", licence: "MIT", url: "https://h/model.pth", sha256: "ab".repeat(32), bytes: 23_528_840 };
    expect(fileSaid(weights)).toBe("Its trained model (MIT licence, 24 MB)");
    const db = { ...weights, file: "f.db.gz", name: "A fragment database", licence: "CC BY 4.0", bytes: 281_251_246, unpack: "gz" as const, unpackedBytes: 2_027_749_376, cite: "Polishchuk, J. Cheminform. 2020, 12, 28" };
    expect(fileSaid(db)).toBe("A fragment database (CC BY 4.0 licence, 281 MB, 2.0 GB unpacked; cite Polishchuk, J. Cheminform. 2020, 12, 28)");
  });
});
