/**
 * Programs installed separately - ORCA, Gaussian - that plugins' steps run
 * (docs/WORKFLOWS.md, *Programs installed separately*): never fetched or
 * shipped by Meno; found where the system finds programs, or where the
 * chemist located one in Settings, Plugins (`plugins.programs`, by
 * "plugin:program"). Meno's backend looks (src-tauri/src/jobs.rs
 * `program_where`), and takes a place located only where it is that
 * program; where each is, as Meno last looked, is kept here for a step's
 * card and Settings to say at once.
 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { useAppSettings } from "../settings/appSettings";
import type { InstalledDecl } from "./manifest";
import { systemHere } from "./here";

/** A program installed separately, as it is known: by its plugin and its name there. */
export const programKey = (plugin: string, name: string) => `${plugin}:${name}`;

/** Where each program installed separately is, by key: its path, or null where it is found nowhere; unset, not looked for yet. */
export const useInstalled = create<{ where: Record<string, string | null> }>(() => ({ where: {} }));

/** Where Meno last found a program installed separately: its path; null, nowhere; undefined, not looked for yet. */
export const whereIs = (plugin: string, name: string): string | null | undefined => useInstalled.getState().where[programKey(plugin, name)];

/** Looks for a program installed separately - where the chemist located it, else where the system finds programs - and keeps where it is. */
export async function lookFor(plugin: string, name: string, ask: typeof invoke = invoke): Promise<string | null> {
  const key = programKey(plugin, name);
  const located = useAppSettings.getState().plugins.programs[key];
  let where: string | null = null;
  try {
    where = (await ask<string | null>("program_where", { plugin, name, located: located ?? null })) ?? null;
  } catch {
    where = null;
  }
  useInstalled.setState((s) => ({ where: { ...s.where, [key]: where } }));
  return where;
}

/** Looks for every program installed separately that `plugins` run, for this system. */
export async function lookForAll(plugins: readonly { id: string; installed: readonly InstalledDecl[] }[], ask: typeof invoke = invoke): Promise<void> {
  const here = systemHere();
  await Promise.all(plugins.flatMap((p) => p.installed.filter((d) => here == null || d.files[here]).map((d) => lookFor(p.id, d.name, ask))));
}

/**
 * Locates a program installed separately: the chemist picks its file - or,
 * on macOS, the app that holds it (Blender.app) - which is kept where it is
 * that program: its file's name, and one that can be run. Where it was
 * taken - the program, inside an app picked; null where nothing was picked;
 * throws, saying why, where what was picked is not it.
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
  const where = await ask<string | null>("program_where", { plugin, name: decl.name, located: picked }).catch(() => null);
  // (an app picked: the program the backend found inside it)
  const app = picked.replace(/\/+$/, "");
  const inApp = !!where && /\.app$/i.test(app) && where.startsWith(`${app}/`);
  if (!where || (where !== picked && !inApp)) throw new Error(`That is not ${decl.label}: its program is ${file ? `the file called ${file}` : "not made for this system"}, one that can be run.`);
  const settings = useAppSettings.getState();
  settings.setPlugins({ ...settings.plugins, programs: { ...settings.plugins.programs, [programKey(plugin, decl.name)]: where } });
  useInstalled.setState((s) => ({ where: { ...s.where, [programKey(plugin, decl.name)]: where } }));
  return where;
}
