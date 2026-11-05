/**
 * The plugins on offer online (docs/PLUGINS.md, *Plugins online*): a
 * catalogue, signed, of every plugin Meno may get - each one's name,
 * version, licence, terms and what to cite, the systems it is made for,
 * what it does, and where its files are, with their fingerprint and size.
 * Meno's backend fetches it and checks its signature before anything of it
 * is read; what comes here is read again as data, strictly, and anything
 * that is not as this says is refused, never guessed at. Meno names none
 * of its plugins: the catalogue does.
 */
import { compareVersions, versionParts } from "./depends";
import { SYSTEMS, type System } from "./manifest";
import { SYSTEM_NAMES } from "./here";
import { isRole, type RoleId } from "./roles";

/** The form of catalogue Meno reads. */
export const CATALOGUE_SCHEMA = 1;

/**
 * The plugin contracts Meno speaks: a plugin made for another is listed
 * as not for this Meno, and never got. (The manifest's own `contract`
 * comes with plugins read from a folder; until then, the same numbers.)
 */
export const CONTRACTS_SPOKEN: readonly number[] = [1];

/** What the catalogue is fetched under, asked once as any first use of the network is (lib/net/network). */
export const CATALOGUE_PURPOSE = "plugin-catalogue";

/**
 * Where the catalogue and the plugins' files come from: their releases, and
 * where those send their files. Each host exactly, as the address reads it -
 * letters made small, nothing more: a host only like one of them, or one with
 * a dot at its end, is none of them.
 */
export const CATALOGUE_HOSTS: readonly string[] = ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];

/** A plugin on offer: what Settings says of it before it is got, and where its files are. */
export type CatalogueEntry = {
  id: string;
  version: string;
  name: string;
  description?: string;
  homepage?: string;
  /** "BSD-3-Clause (RDKit) / Apache-2.0 (plugin)". */
  licence: string;
  /** Terms its program asks to be agreed to, where it has any. */
  terms?: string;
  /** What to cite, where its program asks to be. */
  cite?: string;
  /** The plugin contract it is made for (`CONTRACTS_SPOKEN`). */
  contract: number;
  /** The systems it is made for; none said, all. */
  systems: System[];
  /** The roles it fills, the kinds of step it adds and the kinds of file it reads: what an offer of it is made for. */
  roles: RoleId[];
  kinds: string[];
  reads: string[];
  /** Its files: one archive, its fingerprint and its size. */
  source: { url: string; sha256: string; bytes: number };
  /** Its manifest's fingerprint, checked once its files are unpacked. */
  manifestSha256: string;
};

/** A catalogue, as it was signed: when, its serial - which only grows - and its plugins. */
export type Catalogue = { schema: number; issued: string; serial: number; plugins: CatalogueEntry[] };

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const KIND = /^[a-z][a-z0-9-]{0,39}$/;

const text = (v: unknown, most: number): string | null => (typeof v === "string" && v.trim() && v.length <= most ? v.trim() : null);

/** A plugin's files' place: on https, at a host the catalogue's files come from, and nothing else. */
function sourceUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  return u.protocol === "https:" && !u.username && !u.password && !u.port && CATALOGUE_HOSTS.includes(u.hostname) ? u.href : null;
}

/** One plugin on offer, read strictly; why not, where it is not as a catalogue's entry is. */
function entryOf(raw: unknown): CatalogueEntry | string {
  const e = raw as Record<string, unknown> | null;
  if (!e || typeof e !== "object") return "an entry that is not one";
  const id = typeof e.id === "string" && ID.test(e.id) ? e.id : null;
  if (!id) return "an entry with no id Meno takes";
  const version = typeof e.version === "string" && versionParts(e.version)?.length === 3 ? e.version : null;
  const name = text(e.name, 60);
  const licence = text(e.licence, 200);
  const contract = typeof e.contract === "number" && Number.isInteger(e.contract) && e.contract > 0 ? e.contract : null;
  if (!version || !name || !licence || contract == null) return `${id}: its version, name, licence or contract missing`;
  const systems = e.systems ?? [];
  if (!Array.isArray(systems) || !systems.every((s) => SYSTEMS.includes(s as System))) return `${id}: a system Meno does not know`;
  const list = (v: unknown, ok: (s: string) => boolean): string[] | null => (v == null ? [] : Array.isArray(v) && v.every((s) => typeof s === "string" && ok(s)) ? [...new Set(v as string[])] : null);
  const roles = list(e.roles, isRole);
  const kinds = list(e.kinds, (k) => KIND.test(k));
  const reads = list(e.reads, (k) => KIND.test(k));
  if (!roles || !kinds || !reads) return `${id}: a role or kind Meno does not take`;
  const s = e.source as Record<string, unknown> | null;
  const url = sourceUrl(s?.url);
  const sha256 = typeof s?.sha256 === "string" && HEX64.test(s.sha256) ? s.sha256 : null;
  const bytes = typeof s?.bytes === "number" && Number.isSafeInteger(s.bytes) && s.bytes > 0 ? s.bytes : null;
  if (!url || !sha256 || bytes == null) return `${id}: where its files are, their fingerprint or their size not as Meno takes them`;
  const manifestSha256 = typeof e.manifestSha256 === "string" && HEX64.test(e.manifestSha256) ? e.manifestSha256 : null;
  if (!manifestSha256) return `${id}: its manifest's fingerprint missing`;
  const said = (k: string, most: number) => (e[k] == null ? undefined : (text(e[k], most) ?? null));
  const description = said("description", 400);
  const terms = said("terms", 2000);
  const cite = said("cite", 2000);
  const homepage = e.homepage == null ? undefined : typeof e.homepage === "string" && /^https:\/\/[^\s]{1,300}$/.test(e.homepage) ? e.homepage : null;
  if (description === null || terms === null || cite === null || homepage === null) return `${id}: a description, terms, cite or home page not as Meno takes them`;
  return {
    id,
    version,
    name,
    licence,
    contract,
    systems: systems as System[],
    roles: roles as RoleId[],
    kinds,
    reads,
    source: { url, sha256, bytes },
    manifestSha256,
    ...(description ? { description } : {}),
    ...(homepage ? { homepage } : {}),
    ...(terms ? { terms } : {}),
    ...(cite ? { cite } : {}),
  };
}

/**
 * A catalogue, read: every entry as it should be, or none of it - one
 * entry Meno cannot read refuses the whole, as a catalogue is signed whole.
 * A plugin offered twice is refused too.
 */
export function acceptCatalogue(raw: unknown): { catalogue: Catalogue } | { why: string } {
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c !== "object") return { why: "It is not a catalogue" };
  if (c.schema !== CATALOGUE_SCHEMA) return { why: "It is of a form this Meno does not read: a newer Meno may" };
  const serial = typeof c.serial === "number" && Number.isSafeInteger(c.serial) && c.serial > 0 ? c.serial : null;
  const issued = typeof c.issued === "string" && !Number.isNaN(Date.parse(c.issued)) ? c.issued : null;
  if (serial == null || !issued || !Array.isArray(c.plugins)) return { why: "Its serial, its date or its plugins are missing" };
  const plugins: CatalogueEntry[] = [];
  for (const raw of c.plugins) {
    const e = entryOf(raw);
    if (typeof e === "string") return { why: `It holds ${e}` };
    if (plugins.some((p) => p.id === e.id)) return { why: `It offers ${e.id} twice` };
    plugins.push(e);
  }
  return { catalogue: { schema: CATALOGUE_SCHEMA, issued, serial, plugins } };
}

/**
 * What Settings offers of a plugin on offer, beside the version of it
 * that is here, if any:
 * - `add`: none of it is here;
 * - `update`: an older version is here;
 * - `here`: this version, or a newer one, is;
 * - `not-here`: it is not made for this system, or for this Meno; `why` says which.
 */
export type Offer = { entry: CatalogueEntry; offer: "add" | "update" | "here" } | { entry: CatalogueEntry; offer: "not-here"; why: string };

/** What each plugin on offer is, beside what is here (`here`, each plugin's version by its id), on this system, for this Meno. */
export function offersOf(catalogue: Catalogue, here: ReadonlyMap<string, string>, system: System | null, contracts: readonly number[] = CONTRACTS_SPOKEN): Offer[] {
  return catalogue.plugins.map((entry): Offer => {
    const mine = here.get(entry.id);
    if (!contracts.includes(entry.contract)) return { entry, offer: "not-here", why: mine ? "Its newer versions are for a newer Meno" : "It is for a newer Meno" };
    if (system && entry.systems.length && !entry.systems.includes(system)) return { entry, offer: "not-here", why: `For ${entry.systems.map((s) => SYSTEM_NAMES[s]).join(" and ")} only` };
    if (mine == null) return { entry, offer: "add" };
    return { entry, offer: compareVersions(mine, entry.version) < 0 ? "update" : "here" };
  });
}
