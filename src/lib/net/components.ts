/**
 * Chemical components fetched from the wwPDB's Chemical Component
 * Dictionary for the window (lib/chem/ccd reads them): those Meno keeps
 * already, and the rest fetched by the app - asking first, the first time -
 * and kept (src-tauri/src/ccd.rs).
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { askToConnect, type ConsentRequest } from "./network";
import { isComponentId, readComponent, type Component } from "../chem/ccd";

/** The network's purpose for fetching components, as consent is given. */
export const CCD_PURPOSE = "ccd";

const CONSENT: ConsentRequest = {
  purpose: CCD_PURPOSE,
  title: "Look up chemical components in the wwPDB's dictionary?",
  detail:
    "Each component of the entry - its atoms, bonds and charges, as the Chemical Component Dictionary (CC0) defines it - is fetched once and kept. Only the components' names are sent.",
  sources: ["The Chemical Component Dictionary: files.wwpdb.org"],
};

type Answer = { found: Record<string, string>; absent: string[]; missing: string[] };

/**
 * The components named, as the dictionary defines them: those kept
 * already, and the rest fetched - asking first, the first time - and kept.
 * Null where the chemist said no. Names the dictionary has no file for are
 * left out (`absent`).
 */
export async function componentsNamed(names: readonly string[]): Promise<{ components: Map<string, Component>; absent: string[] } | null> {
  if (!isTauri()) throw new Error("the dictionary is reached from the app only");
  const ids = [...new Set(names.filter(isComponentId))];
  let answer = await invoke<Answer>("ccd_components", { ids, fetch: false });
  if (answer.missing.length) {
    if (!(await askToConnect(CONSENT))) return null;
    const fetched = await invoke<Answer>("ccd_components", { ids: answer.missing, fetch: true });
    answer = { found: { ...answer.found, ...fetched.found }, absent: fetched.absent, missing: [] };
  }
  const components = new Map<string, Component>();
  for (const [id, text] of Object.entries(answer.found)) {
    try {
      const c = readComponent(text);
      if (c) components.set(id, c);
    } catch {
      // (a file that does not read: as if it were not there)
    }
  }
  return { components, absent: answer.absent };
}
