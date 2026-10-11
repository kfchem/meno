/**
 * The colours a part of a structure can be given from its colour card
 * (docs/EDITOR-2D.md, *Colour*): sets of them - Meno's and Okabe and Ito's
 * built in, kept as they are, and the user's own, named - one of them in
 * use, set in Settings, General.
 */

/** A set of colours: its id, its name and its colours, in order, each #rrggbb. */
export type ColourSet = { id: string; name: string; colours: readonly string[] };

/**
 * Meno's set (the maintainer, 2026-10-11): colour makes a drawing look
 * cheap easily, so a few that look right as they are - its base and its
 * accent, a pale one of each for a highlight or a ring's fill, a black and
 * a gray.
 */
export const MENO_SET: ColourSet = { id: "meno", name: "Meno", colours: ["#317689", "#cd4560", "#b2d9e4", "#ebb3be", "#141414", "#c0c0c0"] };

/** Okabe and Ito's colours but black - told apart by those who see colours otherwise. */
export const OKABE_ITO_SET: ColourSet = { id: "okabe-ito", name: "Okabe–Ito", colours: ["#d55e00", "#e69f00", "#f0e442", "#009e73", "#56b4e9", "#0072b2", "#cc79a7"] };

/** The sets built in, kept as they are: copied to be changed. */
export const BUILT_IN_SETS: readonly ColourSet[] = [MENO_SET, OKABE_ITO_SET];

/** The user's own sets, and the one in use (a built-in's id or one of theirs). */
export type ColourSettings = { use: string; sets: ColourSet[] };

export const DEFAULT_COLOURS: ColourSettings = { use: MENO_SET.id, sets: [] };

/** How many colours a set holds at most, how many sets of their own the user keeps, and how long a set's name is. */
export const SET_COLOURS_MOST = 16;
export const SETS_MOST = 20;
export const SET_NAME_MOST = 40;

const COLOUR = /^#[0-9a-f]{6}$/;
const ID = /^[a-z0-9-]{1,40}$/;

/** A set's colours as the settings file holds them: each once, as #rrggbb, no more than a set holds. */
export function acceptSetColours(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const c = typeof v === "string" ? v.toLowerCase() : "";
    if (COLOUR.test(c) && !out.includes(c) && out.length < SET_COLOURS_MOST) out.push(c);
  }
  return out;
}

/** A set's name, as it is kept: on one line, trimmed, no longer than a name is; empty, none. */
export function setName(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, SET_NAME_MOST).trim() : "";
}

/**
 * The colour settings as the settings file holds them: the user's own
 * sets, each with an id of its own (not a built-in's), a name and only
 * colours, no more than they keep; the set in use where it is one, else
 * Meno's.
 */
export function acceptColours(raw: unknown): ColourSettings {
  const r = (raw ?? {}) as { use?: unknown; sets?: unknown };
  const taken = new Set(BUILT_IN_SETS.map((s) => s.id));
  const sets: ColourSet[] = [];
  for (const v of Array.isArray(r.sets) ? r.sets : []) {
    const s = v as { id?: unknown; name?: unknown; colours?: unknown } | null;
    const id = typeof s?.id === "string" && ID.test(s.id) && !taken.has(s.id) ? s.id : null;
    const name = setName(s?.name);
    if (!id || !name || sets.length >= SETS_MOST) continue;
    taken.add(id);
    sets.push({ id, name, colours: acceptSetColours(s?.colours) });
  }
  const use = typeof r.use === "string" && taken.has(r.use) ? r.use : MENO_SET.id;
  return { use, sets };
}

/** The sets there are, built in first. */
export function allSets(c: ColourSettings): ColourSet[] {
  return [...BUILT_IN_SETS, ...c.sets];
}

/** The set in use: the one named, else Meno's. */
export function setInUse(c: ColourSettings): ColourSet {
  return allSets(c).find((s) => s.id === c.use) ?? MENO_SET;
}

/** Whether a set is built in, and so kept as it is. */
export function isBuiltIn(id: string): boolean {
  return BUILT_IN_SETS.some((s) => s.id === id);
}

/** A new set's id, not one of `taken`. */
export function newSetId(taken: readonly string[]): string {
  for (let i = 1; ; i++) {
    const id = `set-${i}`;
    if (!taken.includes(id) && !isBuiltIn(id)) return id;
  }
}

/** A name for a new set like `base`, not one of `taken`: "My colours", "My colours 2", and so on. */
export function freshName(base: string, taken: readonly string[]): string {
  const b = setName(base) || "My colours";
  if (!taken.includes(b)) return b;
  for (let i = 2; ; i++) {
    const n = setName(`${b} ${i}`);
    if (!taken.includes(n)) return n;
  }
}

/** A colour as its red, green and blue, 0 to 255 each. */
export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The colour of red, green and blue, each 0 to 255 (rounded and held there), as #rrggbb. */
export function hexOf(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}
