import {
  exists,
  readTextFile,
  BaseDirectory,
  mkdir,
} from "@tauri-apps/plugin-fs";
import { writeAppFile } from "./io/writeDocument";
import { filesSetUp, pixiSetUp, uvSetUp, type SetUpReach } from "./plugins/setUpSources";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { arch, platform } from "@tauri-apps/plugin-os";
import { pixiDownload, pixiPlatform } from "./pixiLock";
import { askToConnect, type ConsentRequest } from "./net/network";
import { PLUGINS, type PythonPlugin } from "./calc/catalog";
import { systemHere } from "./plugins/here";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
/**
 * A Python environment: a plugin's (lib/calc/catalog), from its lock. Meno
 * has none of its own (the backend sets up no other: src-tauri/src/lib.rs
 * `validate_env_info`).
 */
export type PyProfile = `plugin-${string}`;

/** The plugin a profile is the environment of; none, for Meno's own. */
const pluginOf = (profile: PyProfile): PythonPlugin | undefined => PLUGINS.find((p) => p.profile === profile);

/** A plugin's files besides its environment (src-tauri/src/plugfiles.rs): the folder they are kept in, and those still to be downloaded, with their bytes. */
/**
 * Where a plugin's files stand (src-tauri/src/plugfiles.rs `FilesState`):
 * those not kept as fetched; of them, those there that are not - not their
 * size, or their SHA-256 not the manifest's: changed, or damaged, since; and
 * those there that could not be read, each with why.
 */
type FilesState = { folder: string; missing: string[]; bytes: number; changed?: string[]; unreadable?: string[] };

/** The plugins whose kept files are being read through for their SHA-256, by id, with their names - said where setting them up is (`filesOf`). */
export const useCheckingFiles = create<Record<string, string>>(() => ({}));

/** How long a check of a plugin's files goes unsaid: one Meno has read through this launch takes no time. */
const CHECK_SAID_AFTER_MS = 300;

/**
 * Where a plugin's files stand - each read through for its SHA-256, once a
 * launch, which a model's weights take a while to be: said, where it takes
 * more than a moment (`useCheckingFiles`); or, given the hosts the consent
 * to fetch them named - all the fetch may reach - fetched. Asked only
 * whether they are there (`through` false: whether a plugin is added, as
 * each is asked at launch), none is read: whether each is there, at its
 * size, at once - one changed at its own size is found as the plugin is
 * used, when they are read through (src-tauri/src/plugfiles.rs `there`).
 */
async function filesOf(plugin: PythonPlugin, hosts?: readonly string[], through = true): Promise<FilesState> {
  if (hosts) return invoke<FilesState>("plugin_files", { plugin: plugin.id, fetch: true, hosts });
  if (!through) return invoke<FilesState>("plugin_files", { plugin: plugin.id, fetch: false, through: false });
  const said = setTimeout(() => useCheckingFiles.setState({ [plugin.id]: plugin.name }), CHECK_SAID_AFTER_MS);
  try {
    return await invoke<FilesState>("plugin_files", { plugin: plugin.id, fetch: false, hosts });
  } finally {
    clearTimeout(said);
    // (replaced, not merged: a merge would keep the plugin it leaves out)
    useCheckingFiles.setState((s) => Object.fromEntries(Object.entries(s).filter(([id]) => id !== plugin.id)), true);
  }
}

/** How far each plugin's files have come as they download, by the plugin's id: a share, naught to one. */
export const useDownloads = create<Record<string, number>>(() => ({}));

/**
 * What a plugin downloads as it is set up: what is for this computer - its
 * system, and processor, where a file says one (a program's build:
 * Blender's); the backend takes the same (src-tauri/src/plugfiles.rs
 * `needed`).
 */
export function setUpFiles(plugin: Pick<PythonPlugin, "downloads"> | undefined, system = systemHere(), processor: string = arch()): PythonPlugin["downloads"] {
  return (plugin?.downloads ?? []).filter((d) => (!d.system || d.system === system) && (!d.arch || d.arch === processor));
}

/** The folder a plugin's files are kept in, given to its worker; none, where it downloads none. */
export async function pluginFilesFolder(plugin: PythonPlugin): Promise<string | null> {
  return setUpFiles(plugin).length ? (await filesOf(plugin)).folder : null;
}

/** A size, for people: gigabytes to a tenth, else megabytes. */
export const sizeOf = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

/** What a plugin's own program is under, as asking to set it up says it - beside its files' licences - where its manifest says. */
const licenceOf = (plugin: Pick<PythonPlugin, "name" | "licence">) => (plugin.licence ? ` ${plugin.name} is under the ${plugin.licence} licence.` : "");

/** About how much room its environment takes once set up, where its manifest says (`setUpBytes`, as measured). */
const roomOf = (plugin: Pick<PythonPlugin, "setUpBytes">) => (plugin.setUpBytes ? ` (about ${sizeOf(plugin.setUpBytes)} once set up)` : "");

/** A file a plugin downloads, as asking to set it up says it: its name, licence and size - unpacked too, where it is unpacked - and how its makers ask to be cited. */
export const fileSaid = (f: PythonPlugin["downloads"][number]) =>
  `${f.name} (${f.licence} licence, ${sizeOf(f.bytes)}${f.unpackedBytes ? `, ${sizeOf(f.unpackedBytes)} unpacked` : ""}${f.cite ? `; cite ${f.cite}` : ""})`;

/** What a plugin downloads besides its packages, as asking to set it up says it - each file, under its licence, and its size - and where from. */
function besides(plugin: PythonPlugin | undefined): { need: string } & SetUpReach {
  const files = setUpFiles(plugin);
  if (!files.length) return { need: "", sources: [], hosts: [] };
  return {
    need: `; and it needs ${files.map(fileSaid).join(" and ")} beside them`,
    ...filesSetUp(files),
  };
}

/** A plugin's files fetched - the user having allowed it - from the hosts asking named, how far they have come kept as they come. */
async function fetchFiles(plugin: PythonPlugin, hosts: readonly string[]): Promise<void> {
  const stop = await listen<{ plugin: string; done: number; total: number }>("plugin-files:progress", (e) => {
    if (e.payload.plugin === plugin.id && e.payload.total > 0) useDownloads.setState({ [plugin.id]: e.payload.done / e.payload.total });
  });
  try {
    await filesOf(plugin, hosts);
  } finally {
    stop();
    // (replaced, not merged: a merge would keep the plugin's share it leaves out)
    useDownloads.setState((s) => Object.fromEntries(Object.entries(s).filter(([id]) => id !== plugin.id)), true);
  }
}

async function ensureDir(rel: string, baseDir: BaseDirectory) {
  const parts = rel.split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    const has = await exists(cur, { baseDir }).catch(() => false);
    if (!has) {
      try {
        // (with the folder it is in, where that is not there yet: the local data folder, the first time)
        await mkdir(cur, { baseDir, recursive: true });
      } catch {
        /* Ignore EEXIST, etc. */
      }
    }
  }
}

/** `data` as JSON at `rel` in Meno's local data folder, whole or not at all: a note cut short would have an environment set up again. */
async function writeJsonSafe(rel: string, data: unknown) {
  await writeAppFile(rel, JSON.stringify(data, null, 2), "local");
}

type PyEnvInfo = {
  os: "windows" | "macos" | "linux";
  /** What makes it: uv, or pixi - a reader's whose environment needs conda-forge. */
  host: "uv" | "pixi";
  lockPath: string;
  venvHome: string;
  venvPythonRel: string;
  stampPath: string;
  pythonVersion: string;
  /** What its downloads are for, as the user allows them, and in words. */
  purpose: string;
  label: string;
};

/** The plugin a profile is the environment of: one Meno knows, or none to set up. */
function pluginFor(profile: PyProfile): PythonPlugin {
  const plugin = pluginOf(profile);
  if (!plugin) throw new Error(`${profile} is not a plugin's environment`);
  return plugin;
}

/** Each profile's lock file, among the app's resources: its plugin's, in its folder. */
const lockOf = (profile: PyProfile) => pluginFor(profile).lock;

async function baseInfo(
  profile: PyProfile,
  lockPath: string,
  pyVer = "3.12"
): Promise<PyEnvInfo> {
  const os = await platform();
  const plugin = pluginOf(profile);
  const pixi = plugin?.env === "pixi";
  return {
    os: os as any,
    host: pixi ? "pixi" : "uv",
    lockPath,
    // (pixi's environments kept where pixi makes them: `.pixi/envs/default` beside the manifest)
    venvHome: pixi ? `pixi/${profile}` : `uv/${profile}/venv`,
    venvPythonRel: pixi
      ? os === "windows"
        ? ".pixi/envs/default/python.exe"
        : ".pixi/envs/default/bin/python"
      : os === "windows"
        ? "Scripts/python.exe"
        : "bin/python",
    stampPath: pixi ? `pixi/stamps/${profile}.json` : `uv/stamps/${profile}.json`,
    pythonVersion: pyVer,
    purpose: `python-env:${profile}`,
    label: `Setting up ${plugin?.name ?? profile}`,
  };
}

/** `through` false: its files' SHA-256 not read, only whether each is there (`filesOf`). */
type EnvOptions = {
  lockPath?: string;
  pythonVersion?: string;
  through?: boolean;
  /**
   * Its questions asked already, with others, in one (`setUpQuestions`, lib/net/network `askToConnectAll`): each not
   * asked again - but still no where Meno went offline since, or the leave was withdrawn; and one that is not among them
   * - a file found changed since, say - asked as ever.
   */
  asked?: readonly ConsentRequest[];
  /** Its questions only gathered here, nothing set up or fetched (`setUpQuestions`). */
  gather?: ConsentRequest[];
};

/** Where a profile's environment stands, and whether it needs setting up. */
async function envState(profile: PyProfile, opts?: EnvOptions) {
  const plugin = pluginFor(profile);
  const useDefault = await exists(plugin.lock, {
    baseDir: BaseDirectory.Resource,
  });
  // (a plugin's environment from its own lock, or none: never from another's)
  if (!useDefault && !opts?.lockPath) throw new Error(`${plugin.name}'s lock is not in its folder.`);
  const lockPath = opts?.lockPath ?? plugin.lock;

  const info = await baseInfo(profile, lockPath, opts?.pythonVersion ?? "3.12");

  const lockText = await readTextFile(info.lockPath, {
    baseDir: BaseDirectory.Resource,
  });
  const lockSha = await sha256(lockText);

  const stampExists = await exists(info.stampPath, {
    baseDir: BaseDirectory.AppLocalData,
  });

  // (and the files besides that the user was told of, as it was set up: by their SHA-256)
  let stamp: { lockSha?: string; py?: string; files?: string[] } = {};
  if (stampExists) {
    try {
      stamp = JSON.parse(
        await readTextFile(info.stampPath, { baseDir: BaseDirectory.AppLocalData })
      );
    } catch {}
  }

  const venvPy = await invoke<string>("py_env_python_path_uv", {
    payload: info,
  });

  // (made: its interpreter there - or, for pixi's, the activation kept once
  // it is made; the interpreter there is a link the webview's file scope
  // cannot follow, and in a folder whose name starts with a dot)
  const made = info.host === "pixi" ? `${info.venvHome}/activation.json` : `${info.venvHome}/${info.venvPythonRel}`;
  const needSetup =
    !(await exists(made, {
      baseDir: BaseDirectory.AppLocalData,
    })) ||
    stamp.lockSha !== lockSha ||
    stamp.py !== info.pythonVersion;
  // (a plugin's files besides, each there whole)
  const files = setUpFiles(plugin);
  const filesNow = plugin && files.length > 0 ? await filesOf(plugin, undefined, opts?.through ?? true) : null;
  const needFiles = !!filesNow?.missing.length;
  // (those there whose SHA-256 is not the one Meno carries: said, and asked again before they are fetched anew)
  const changed = filesNow?.changed ?? [];
  // (one that could not be read: not known to be changed - never fetched over; said, and read again next time)
  const unreadable = filesNow?.unreadable ?? [];
  // (one the user was not told of as it was set up - a plugin that has come to need more since: asked again, even where it was allowed)
  const untold = files.some((f) => !stamp.files?.includes(f.sha256));

  return { info, lockText, lockSha, venvPy, needSetup, needFiles, changed, unreadable, untold, told: files.map((f) => f.sha256) };
}

/**
 * Whether a profile's environment is set up as its lock file now says - so
 * that using it needs nothing downloaded. Sets nothing up, and asks nothing;
 * its files are looked for, not read through - as Meno asks it of every
 * plugin at launch - and are read through as it is used (`ensurePyEnv`).
 */
export async function pyEnvReady(profile: PyProfile): Promise<boolean> {
  try {
    // (its files there, not read through: asked of every plugin at launch - they are read as it is used, by ensurePyEnv)
    const state = await envState(profile, { through: false });
    return !state.needSetup && !state.needFiles;
  } catch {
    return false;
  }
}

/** What is said of a plugin's files there whose SHA-256 is not the one Meno carries for them, first: none where there are none. */
export function changedSaid(changed: readonly string[]): string {
  if (!changed.length) return "";
  const one = changed.length === 1;
  const names = one ? changed[0] : `${changed.slice(0, -1).join(", ")} and ${changed[changed.length - 1]}`;
  return `${names} ${one ? "is" : "are"} not the file${one ? "" : "s"} Meno downloaded: ${one ? "its" : "their"} size or fingerprint (SHA-256) is not the one Meno carries - changed, or damaged, since. `;
}

/** What asking to set a plugin up says first: an interface to a program installed separately (the ORCA interface) downloads that program never - only what the interface itself needs. */
const consentTitle = (plugin: { name: string; installed?: readonly unknown[] }) =>
  plugin.installed?.length ? `Set up the ${plugin.name}?` : `Download ${plugin.name}?`;

export async function ensurePyEnv(
  profile: PyProfile,
  opts?: EnvOptions
): Promise<string> {
  const { info, lockText, lockSha, venvPy, needSetup, needFiles, changed, unreadable, untold, told } = await envState(
    profile,
    opts
  );
  // (asked of the user - or, gathering, kept to be asked with others; asked already with others, not again)
  const gather = opts?.gather;
  const ask = async (request: ConsentRequest): Promise<boolean> => {
    if (gather) {
      gather.push(request);
      return true;
    }
    // (asked with others, the same question: that yes allowed its purpose - looked at again now, as anything that uses the
    //  network is; a question not asked then is asked now)
    const same = opts?.asked?.some((a) => a.purpose === request.purpose && a.detail === request.detail);
    return askToConnect(same ? { ...request, again: false } : request);
  };
  // (a file there that could not be read - held by another program, not allowed, a share gone: not known to be changed, so neither
  //  fetched over nor run with; said, with why, and read again the next time)
  if (unreadable.length) throw new Error(`${unreadable.join("; ")} - ${unreadable.length === 1 ? "it" : "they"} could not be read, so ${pluginOf(profile)?.name ?? profile} cannot run. Meno reads ${unreadable.length === 1 ? "it" : "them"} again the next time.`);
  // (set up, with the files besides the user was told of)
  const stampNow = () => writeJsonSafe(info.stampPath, { lockSha, py: info.pythonVersion, ...(told.length ? { files: told } : {}) });
  const extra = besides(pluginOf(profile));
  // (who downloads what: the packages' maker, and Meno the plugin's files besides)
  const downloads = (maker: string) => `${maker}, fetched the first time it is needed, downloads ${extra.need ? "the packages, and Meno the rest" : "them"} - once`;
  await ensureDir(info.host === "pixi" ? "pixi/stamps" : "uv/stamps", BaseDirectory.AppLocalData);

  if (needSetup && info.host === "pixi") {
    // (a conda-forge environment: what pixi downloads on this computer, from its lock)
    const plugin = pluginOf(profile)!;
    const download = pixiDownload(lockText, pixiPlatform(info.os, arch()));
    const mb = Math.round(download.bytes / 1e6 / 10) * 10;
    // (where from, as said - and all the set-up may reach: net.rs)
    const setUp = pixiSetUp(download.pypi, setUpFiles(plugin));
    const allowed = await ask({
      purpose: info.purpose,
      title: consentTitle(plugin),
      again: untold,
      detail:
        `${plugin.description}${licenceOf(plugin)} It runs in a Python of its own, ` +
        `with the ${download.packages} packages it needs` +
        (mb ? ` (about ${mb} MB)` : "") +
        `, in its data folder${extra.need}. ${downloads("pixi")}, ` +
        `every file checked against the fingerprint Meno carries for it:`,
      ...setUp,
    });
    if (!allowed) {
      throw new Error(`${info.label} needs the network, and was not allowed it (Meno is offline, or the download was declined).`);
    }
    if (gather) return venvPy as string;
    await invoke("py_env_setup_pixi", { payload: { ...info, hosts: setUp.hosts } });
    await stampNow();
  } else if (needSetup) {
    // The first time, the user says whether it may download at all.
    const packages = lockText
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z0-9_.-]+(==| @ )/.test(line)).length;
    const hashed = /^\s*--hash=/m.test(lockText);
    const plugin = pluginFor(profile);
    const setUp = uvSetUp(lockText, setUpFiles(plugin));
    const allowed = await ask({
      purpose: info.purpose,
      title: consentTitle(plugin),
      again: untold,
      detail:
        `${plugin.description}${licenceOf(plugin)} It runs in a Python ${info.pythonVersion} of its own, ` +
        // (a plugin that needs Python alone: no packages to fetch)
        (packages
          ? `with the ${packages} packages it needs${roomOf(plugin)}, in its data folder${extra.need}. ` +
            `${downloads("Astral's uv")}` +
            (hashed ? ", every file checked against the fingerprint Meno carries for it:" : ":")
          : extra.need
            ? `in its data folder${extra.need.replace(/ beside them$/, " beside it")}. Astral's uv, fetched the first time it is needed, ` +
              "downloads Python - once, and only where Meno has not fetched it before - and Meno the rest, once, " +
              "checked against the fingerprint Meno carries for it:"
            : "in its data folder, and needs nothing else. Astral's uv, fetched the first time it is needed, " +
              "downloads Python - once, and only where Meno has not fetched it before:"),
      ...setUp,
    });
    if (!allowed) {
      throw new Error(
        `${info.label} needs the network, and was not allowed it` +
          " (Meno is offline, or the download was declined).",
      );
    }
    if (gather) return venvPy as string;
    await invoke("py_env_setup_uv", { payload: { ...info, hosts: setUp.hosts } });
    await stampNow();
  }
  if (needFiles) {
    // (allowed as the plugin was set up - asked again where that leave was
    // withdrawn, or where the user was not told of these then)
    const plugin = pluginOf(profile)!;
    // (one there that is not the file Meno fetched - its fingerprint not the one Meno carries - is said plainly, and asked again, even where
    //  setting it up was allowed: it is downloaded anew only with a yes)
    const unlike = changedSaid(changed);
    const allowed = await ask({
      purpose: info.purpose,
      title: consentTitle(plugin),
      again: (untold && !needSetup) || !!unlike,
      detail: `${unlike}The ${plugin.name} plugin needs${extra.need.replace(/^; and it needs/, "").replace(/ beside them$/, "")}, downloaded once into its data folder, checked against the fingerprint Meno carries for it:`,
      sources: extra.sources,
      hosts: extra.hosts,
    });
    if (!allowed) throw new Error(`${unlike}${info.label} needs the network, and was not allowed it (Meno is offline, or the download was declined).`);
    if (gather) return venvPy as string;
    if (untold && !needSetup) await stampNow();
    await fetchFiles(plugin, extra.hosts);
  }

  return venvPy as string;
}

/** What setting a plugin up would ask of the network: gathered, nothing set up or fetched - none, where it needs nothing (lib/calc/workers, asking for a plugin and those it uses at once). */
export async function setUpQuestions(profile: PyProfile): Promise<ConsentRequest[]> {
  const gather: ConsentRequest[] = [];
  await ensurePyEnv(profile, { gather });
  return gather;
}

/**
 * Takes a plugin's environment away, and its record of being set up: what
 * Settings' *Plugins* removes.
 */
export async function removePyEnv(profile: PyProfile): Promise<void> {
  await invoke("py_env_remove", { payload: await baseInfo(profile, lockOf(profile)) });
}
