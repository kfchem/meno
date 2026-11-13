/**
 * A structure found by its name, in a database outside Meno: the names role
 * (docs/PLUGINS.md, *Roles*; docs/EDITOR-2D.md, *Quick Add*). What a plugin
 * that fills it answers is read here strictly - never guessed at - and what
 * it gives is checked before anything is drawn: the structure Meno reads
 * from its SMILES must have the formula and charge it gives. Plain, to be
 * tested without a page. The service is named by its plugin's own name:
 * Meno's core names none.
 */
import type { PythonPlugin } from "../../../../lib/calc/catalog";
import type { ConsentRequest } from "../../../../lib/net/network";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { Model } from "../store/types";
import { undrawnHydrogens } from "./drawing";

/** The role (lib/plugins/roles). */
export const NAMES_ROLE = "names" as const;

/**
 * The most matches asked for: what a Quick Add list holds without
 * scrolling. The maintainer's to change.
 */
export const MOST_NAMED = 8;

/** The longest name sent, and the longest title and SMILES taken back. */
export const NAME_MOST = 300;
const TITLE_MOST = 300;
const SMILES_MOST = 4000;
const FORMULA_MOST = 300;
const ID_MOST = 100;
/** The most stereocentres, double bonds or parts a record may say it has: anything more is no record. */
const COUNT_MOST = 100_000;

/** Names in words: "a", "a and b", "a, b and c". */
const listSaid = (names: readonly string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * The purpose a names plugin uses the network under, its hosts in it, in
 * order (src-tauri/src/model.rs `Hosted::purpose`, the same): a yes is for
 * those hosts - a plugin updated to name others is asked of again.
 */
export const lookupPurpose = (plugin: string, hosts: readonly string[]) => `lookup:${plugin}@${[...hosts].sort().join(",")}`;

/** The hosts a names plugin talks to, as its manifest names them. */
export const lookupHosts = (p: PythonPlugin): readonly string[] => p.roleHosts?.[NAMES_ROLE] ?? [];

/** The question asked the first time a name is looked up: where it goes, and that nothing else does. */
export function lookupConsentOf(p: PythonPlugin): ConsentRequest {
  const hosts = lookupHosts(p);
  return {
    purpose: lookupPurpose(p.id, hosts),
    title: `Look names up at ${listSaid(hosts)}, for ${p.name}?`,
    detail: "Each name you choose to look up goes there. Nothing else does.",
    sources: [`${p.name}: ${hosts.join(", ")}`],
    hosts: [...hosts],
  };
}

/** A compound found by its name, as the service gives it. */
export type NamedStructure = {
  /** The service's own id for it, as the service writes it: "CID 2244". */
  id: string;
  /** Its page at the service: https, on a host the plugin names. */
  page: string;
  /** What the service calls it. */
  title: string;
  /** With its configurations and isotopes, as the service gives it. */
  smiles: string;
  /** The service's formula. */
  formula: string;
  charge: number;
  centres: { defined: number; undefined: number };
  doubleBonds: { defined: number; undefined: number };
  /** Covalently bound units. */
  parts: number;
};

/** What a lookup found: the first matches, and how many more the service has; none by this name; or an error, in the plugin's words. */
export type NameFound = { found: NamedStructure[]; more: number } | { none: true } | { error: string };

/** What Meno does not read of a plugin's answer. */
export const NOT_READ = "The plugin that looks names up gave what Meno does not read";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= COUNT_MOST;
const text = (v: unknown, most: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= most;

/** A page at the service: https, on one of `hosts` exactly, with no port and no one's name in it. */
function pageOk(page: unknown, hosts: readonly string[]): page is string {
  if (typeof page !== "string" || page.length > 2000) return false;
  try {
    const u = new URL(page);
    return u.protocol === "https:" && hosts.includes(u.hostname) && !u.port && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Defined and undefined, each a count. */
function pairOf(v: unknown): { defined: number; undefined: number } | null {
  return isRecord(v) && count(v.defined) && count(v.undefined) ? { defined: v.defined, undefined: v.undefined } : null;
}

/** One compound, read strictly; null where anything of it is amiss. */
function namedOf(v: unknown, hosts: readonly string[]): NamedStructure | null {
  if (!isRecord(v)) return null;
  const centres = pairOf(v.centres);
  const doubleBonds = pairOf(v.doubleBonds);
  if (!text(v.id, ID_MOST) || !pageOk(v.page, hosts) || !text(v.title, TITLE_MOST) || !text(v.smiles, SMILES_MOST) || !text(v.formula, FORMULA_MOST)) return null;
  if (typeof v.charge !== "number" || !Number.isInteger(v.charge) || Math.abs(v.charge) > COUNT_MOST || !centres || !doubleBonds || !count(v.parts) || v.parts < 1) return null;
  return { id: v.id, page: v.page, title: v.title, smiles: v.smiles, formula: v.formula, charge: v.charge, centres, doubleBonds, parts: v.parts };
}

/**
 * A plugin's answer to `find_name`, read strictly: its matches - at most
 * `most`, each whole, its page on a host the plugin names - and how many
 * more the service has; none by this name; or its error in its words.
 * Anything else is refused whole (NOT_READ), never guessed at.
 */
export function foundOf(raw: unknown, most: number, hosts: readonly string[]): NameFound {
  if (!isRecord(raw)) throw new Error(NOT_READ);
  const keys = Object.keys(raw);
  if (keys.length === 1 && raw.none === true) return { none: true };
  if (keys.length === 1 && text(raw.error, 2000)) return { error: raw.error };
  if (keys.length !== 2 || !Array.isArray(raw.found) || !count(raw.more)) throw new Error(NOT_READ);
  if (!raw.found.length || raw.found.length > most) throw new Error(NOT_READ);
  const found = raw.found.map((v) => namedOf(v, hosts));
  if (found.some((f) => !f) || new Set(found.map((f) => f!.id)).size !== found.length) throw new Error(NOT_READ);
  return { found: found as NamedStructure[], more: raw.more };
}

/** A formula read: each element's count, and its charge. */
export type Formula = { counts: ReadonlyMap<string, number>; charge: number };

/** Deuterium and tritium, written as their own symbols: counted as hydrogen. */
const HYDROGEN_ISOTOPES = new Set(["D", "T"]);

/**
 * A formula as a database writes one - Hill order or any other, the charge
 * after it ("C2H3O2-", "Fe+2", "SO4-2"), parts after dots with a count
 * before each ("C2H3O2.Na", "CuO4S.5H2O") - read as counts, never as text.
 * D and T count as hydrogen: no isotope is told apart. Null where it does
 * not read so: a number at its very start ("13CH4" - a count stands only
 * before a part after a dot), a symbol that is no element, brackets,
 * anything else.
 */
export function formulaRead(written: string): Formula | null {
  const counts = new Map<string, number>();
  let charge = 0;
  for (const [i, part] of written.split(".").entries()) {
    const m = /^(\d*)((?:[A-Z][a-z]?\d*)+)([+-]\d*)?$/.exec(part);
    if (!m || (i === 0 && m[1])) return null;
    const times = m[1] ? Number(m[1]) : 1;
    if (!times) return null;
    for (const [, symbol, n] of m[2].matchAll(/([A-Z][a-z]?)(\d*)/g)) {
      const el = HYDROGEN_ISOTOPES.has(symbol) ? "H" : symbol;
      if (!isElementSymbol(el)) return null;
      const k = n ? Number(n) : 1;
      if (!k) return null;
      counts.set(el, (counts.get(el) ?? 0) + times * k);
    }
    if (m[3]) charge += times * (m[3][0] === "-" ? -1 : 1) * (m[3].length > 1 ? Number(m[3].slice(1)) : 1);
  }
  return counts.size ? { counts, charge } : null;
}

/** What Meno reads a drawing as: each element's count - its hydrogens too, drawn or not - and its charge; null where an atom is no element. */
export function formulaOfDrawn(model: Model): Formula | null {
  const hs = undrawnHydrogens(model);
  const counts = new Map<string, number>();
  let charge = 0;
  for (const a of model.atoms) {
    const el = HYDROGEN_ISOTOPES.has(a.el) ? "H" : a.el;
    if (!isElementSymbol(el) || a.abbrev) return null;
    counts.set(el, (counts.get(el) ?? 0) + 1);
    const h = hs.get(a.id) ?? 0;
    if (h) counts.set("H", (counts.get("H") ?? 0) + h);
    charge += a.charge ?? 0;
  }
  return { counts, charge };
}

/** A formula written in Hill order - carbon, hydrogen, then the rest alphabetically; with no carbon, all alphabetically - its charge after it: "C9H8O4", "C2H3O2-", "Na+". */
export function formulaWritten(f: Formula): string {
  const els = [...f.counts.keys()].filter((el) => f.counts.get(el));
  const order = f.counts.get("C") ? ["C", ...(f.counts.get("H") ? ["H"] : []), ...els.filter((e) => e !== "C" && e !== "H").sort()] : els.sort();
  const charge = f.charge ? `${f.charge > 0 ? "+" : "-"}${Math.abs(f.charge) > 1 ? Math.abs(f.charge) : ""}` : "";
  return order.map((el) => `${el}${f.counts.get(el)! > 1 ? f.counts.get(el) : ""}`).join("") + charge;
}

/** Whether two formulae are alike: the same elements, each as many, and the same charge. */
const alike = (a: Formula, b: Formula) => a.charge === b.charge && a.counts.size === b.counts.size && [...a.counts].every(([el, n]) => b.counts.get(el) === n);

/**
 * Why what was found is not drawn, or null where it may be: the structure
 * Meno reads from its SMILES (`drawn`) must have the formula and charge the
 * service gives - in words that put the fault on neither side. A formula
 * Meno cannot read is said so, never "unlike".
 */
export function notDrawnWhy(drawn: Model, found: NamedStructure, service: string): string | null {
  // (their formula quoted as they wrote it - spaces about it aside - never as Meno would write it)
  const written = found.formula.trim();
  const theirs = formulaRead(written);
  if (!theirs) return `Meno does not read ${service}'s formula for ${found.title}, ${written}: not drawn.`;
  const ours = formulaOfDrawn(drawn);
  if (!ours) return `Meno does not read ${service}'s structure for ${found.title} as a formula: not drawn.`;
  const given = { counts: theirs.counts, charge: found.charge };
  // (the charge the formula writes, where it writes one, is the record's too)
  if (theirs.charge !== found.charge && theirs.charge !== 0) return `${service} gives ${found.title} the formula ${written} and the charge ${chargeSaid(found.charge)}: not drawn.`;
  if (alike(ours, given)) return null;
  // (a charge the record gives that its formula does not write: said beside it)
  const charge = found.charge && !theirs.charge ? `, charge ${chargeSaid(found.charge)}` : "";
  return `Meno reads ${service}'s structure for ${found.title} as ${formulaWritten(ours)}; ${service}'s formula is ${written}${charge}. Not drawn.`;
}

/** A charge as a chemist says it: "+1", "−2", "0". */
const chargeSaid = (c: number) => (c ? `${c > 0 ? "+" : "−"}${Math.abs(c)}` : "0");

/** What is not plain about a compound found, in words: its stereo left undefined, its parts, its charge. */
export function foundNotes(f: NamedStructure): string[] {
  const of = (p: { defined: number; undefined: number }, one: string, many: string) =>
    p.undefined ? `${p.undefined} of ${p.defined + p.undefined} ${p.defined + p.undefined === 1 ? one : many} not defined` : "";
  return [
    of(f.centres, "stereocentre", "stereocentres"),
    of(f.doubleBonds, "stereo double bond", "stereo double bonds"),
    f.parts > 1 ? `${f.parts} parts` : "",
    f.charge ? `charge ${chargeSaid(f.charge)}` : "",
  ].filter(Boolean);
}

/** The undo step's name for a compound drawn from what was found: "Add aspirin (CID 2244)". */
export const addedName = (f: NamedStructure) => `Add ${f.title} (${f.id})`;
