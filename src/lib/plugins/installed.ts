/**
 * Programs installed separately - ORCA, Gaussian - that plugins' steps run
 * (docs/WORKFLOWS.md, *Programs installed separately*): never fetched or
 * shipped by Meno; found where the system finds programs, or where the
 * chemist located one in Settings, Plugins (`plugins.programs`, by
 * "plugin:program"). Meno's backend looks (src-tauri/src/jobs.rs
 * `program_where`), and takes a place located only where it is that
 * program - and, where its plugin says how to ask, of a version Meno takes,
 * the newest such copy found; where each is, as Meno last looked, and its
 * version, are kept here for a step's card and Settings to say at once.
 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { useAppSettings } from "../settings/appSettings";
import type { InstalledDecl } from "./manifest";
import { systemHere } from "./here";

/** A program installed separately, as it is known: by its plugin and its name there. */
export const programKey = (plugin: string, name: string) => `${plugin}:${name}`;

/** A copy of a program installed separately, as the backend chose it (jobs.rs `Chosen`): where it is; its version, where it says; why it will not do, where it is too old for Meno. */
export type Chosen = { path: string; version?: string; why?: string };

const chosenOf = (v: unknown): Chosen | null => {
  const c = v as Partial<Chosen> | null;
  if (!c || typeof c.path !== "string") return null;
  return { path: c.path, ...(typeof c.version === "string" ? { version: c.version } : {}), ...(typeof c.why === "string" ? { why: c.why } : {}) };
};

/**
 * Where each program installed separately is, by key: its path, or null
 * where none fit to run is found; unset, not looked for yet - and the copy
 * chosen, as the backend said (`chosen`): its version, and why it will not
 * do, where it is too old.
 */
export const useInstalled = create<{ where: Record<string, string | null>; chosen: Record<string, Chosen | null> }>(() => ({ where: {}, chosen: {} }));

/** Where Meno last found a program installed separately: its path; null, nowhere fit to run; undefined, not looked for yet. */
export const whereIs = (plugin: string, name: string): string | null | undefined => useInstalled.getState().where[programKey(plugin, name)];

/** Why a program installed separately will not do, as Meno last looked: the copy found is too old ("Meno needs Blender 5.0 or later; this one is 4.1"); undefined where it will, or none is found. */
export const tooOld = (plugin: string, name: string): string | undefined => useInstalled.getState().chosen[programKey(plugin, name)]?.why;

/**
 * Each program's latest look, by key: a look answers only where none was
 * begun after it - a look begun as a file dialog closes (the window come
 * back) never undoing what was located in it.
 */
const latest = new Map<string, number>();
let looks = 0;

/**
 * Looks for a program installed separately - where the chemist located it,
 * else where the system finds programs, else where it is usually installed;
 * where its plugin says how to ask, the newest copy of a version Meno takes -
 * and keeps where it is: its path, or null where none will do (`tooOld` says
 * why, where one is too old).
 */
export async function lookFor(plugin: string, name: string, ask: typeof invoke = invoke): Promise<string | null> {
  const key = programKey(plugin, name);
  const mine = ++looks;
  latest.set(key, mine);
  const located = useAppSettings.getState().plugins.programs[key];
  let chosen: Chosen | null = null;
  try {
    chosen = chosenOf(await ask("program_where", { plugin, name, located: located ?? null }));
  } catch {
    chosen = null;
  }
  const where = chosen && !chosen.why ? chosen.path : null;
  // (a look begun after this one says where it is, for all to see: this one answers its caller alone)
  if (latest.get(key) !== mine) return where;
  useInstalled.setState((s) => ({ where: { ...s.where, [key]: where }, chosen: { ...s.chosen, [key]: chosen } }));
  return where;
}

/** Looks for every program installed separately that `plugins` run, for this system. */
export async function lookForAll(plugins: readonly { id: string; installed: readonly InstalledDecl[] }[], ask: typeof invoke = invoke): Promise<void> {
  const here = systemHere();
  await Promise.all(plugins.flatMap((p) => p.installed.filter((d) => here == null || d.files[here]).map((d) => lookFor(p.id, d.name, ask))));
}

/**
 * Locates a program installed separately: the chemist picks its file - or,
 * on macOS, the app that holds it (its `.app`) - which is kept where it is
 * that program: its file's name, and one that can be run - and, where its
 * plugin says how to ask, of a version Meno takes. Where it was taken - the
 * program, inside an app picked; null where nothing was picked; throws,
 * saying why, where what was picked is not it, or is too old.
 */
export async function locate(
  plugin: string,
  decl: InstalledDecl,
  pick: () => Promise<string | null> = async () => {
    const picked = await openDialog({ title: `Locate ${decl.label}`, multiple: false, directory: false });
    return typeof picked === "string" ? picked : null;
  },
  ask: typeof invoke = invoke,
): Promise<string | null> {
  const picked = await pick();
  if (!picked) return null;
  const file = systemHere() ? decl.files[systemHere()!] : undefined;
  // (what was picked alone - never another copy found elsewhere)
  const chosen = chosenOf(await ask("program_where", { plugin, name: decl.name, located: picked, exact: true }).catch(() => null));
  const where = chosen?.path ?? null;
  // (an app picked: the program the backend found inside it)
  const app = picked.replace(/\/+$/, "");
  const inApp = !!where && /\.app$/i.test(app) && where.startsWith(`${app}/`);
  if (!chosen || !where || (where !== picked && !inApp)) throw new Error(`That is not ${decl.label}: its program is ${file ? `the file called ${file}` : "not made for this system"}, one that can be run.`);
  if (chosen.why) throw new Error(`${chosen.why}.`);
  const key = programKey(plugin, decl.name);
  // (what is located is what is: any look begun before answers to nothing)
  latest.set(key, ++looks);
  const settings = useAppSettings.getState();
  settings.setPlugins({ ...settings.plugins, programs: { ...settings.plugins.programs, [key]: where } });
  useInstalled.setState((s) => ({ where: { ...s.where, [key]: where }, chosen: { ...s.chosen, [key]: chosen } }));
  return where;
}
