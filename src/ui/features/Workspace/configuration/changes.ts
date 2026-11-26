/**
 * What an edit did to the configuration a drawing states (foundation part 15, phase 2; docs/EDITOR-2D.md, *When an edit turns a
 * configuration*): each structure the edit touched read before and after with the one reader (chem/engineLayout `stereoOf`: the
 * reader's `readStereo` with depth and the cage fit, by atom id) and the two compared unit by unit (lib/chem/perception/stereo/compare
 * `compared`, part 14 C's one comparison). What is said, of each unit (the words: `changeWords`):
 * - inverted (`inverted`): "C3: S, now R" where the CIP gives both descriptors, else "C3: inverted";
 * - no longer stated though its atom and its groups are all still there: "now marked unknown" where the drawing says it is not known
 *   (`unknown`: a wavy bond, an "either" double bond), "now unclear" with the reader's words where its marks are there but say nothing
 *   readable (`unread`), else "now unspecified" (`opened`: a plain bond) - each after the descriptor it had, where it had one;
 * - stated again where its marks had been unclear (`read`): "C3: now R", or "C3: stated again" without one.
 * Nothing is said where nothing changed, where a unit is simply new (a wedge just drawn), gone with its atom or one of its groups, or no
 * longer a unit because two of its groups are now alike, nor at a place whose configuration sets nothing before the edit or after it
 * (chem/candidatesDrawn: a Newman's or a Haworth's atom with two like groups) - nor, asked `byHand`, of a unit the chemist changed by
 * turning a stereo bond of its own and nothing else there (`turnedByHand`): its label shows it. A structure whose every unit inverted -
 * two or more - is one note: its mirror image. No DOM, no store: identity's answers it asks are kept by chem/identityOff.
 */
import type { ConfigurationUnit } from "../../../../lib/chem/perception/stereo/compare";
import { compared, type Said } from "../../../../lib/chem/perception/stereo/compare";
import { unreadWhy } from "../../../../lib/layout/drawn";
import { readStereo } from "../../../../lib/layout/drawn";
import { drawingOf } from "../chem/drawing";
import { stereoOf, unreadWedges } from "../chem/engineLayout";
import { fragmentsHolding } from "../chem/cleanUp";
import { candidatesDrawn } from "../chem/candidatesDrawn";
import { keepsAny, keptFrom, keptReading, type KeptOf } from "./kept";
import type { Bond, Model } from "../store/types";
import { placeNames } from "./names";

/** How a unit's configuration changed, as it is said. */
export type ChangeHow = "inverted" | "opened" | "unknown" | "unread" | "read" | "mirror";

/** A change said at a unit: how, and for `unread` the reader's words why its marks say nothing. */
export type ConfigurationChange = { unit: ConfigurationUnit; how: ChangeHow; why?: string };

/** A drawing's reading of configuration, by atom id: what it states, and each atom whose marks it cannot read, with why. */
export type Reading = { said: Said; unread: Map<number, string>; open: Set<number> };

/** What `part` states (`stereoOf`), the atoms whose wedges say nothing readable (`unreadWedges`, with `unreadWhy`'s words), and those a wavy bond or an "either" double bond leaves not known. */
export function readingOf(part: Model): Reading {
  const said = stereoOf(part);
  const drawing = drawingOf(part);
  const stereo = readStereo(drawing.atoms, drawing.bonds);
  const unread = new Map(unreadWedges(drawing, stereo).map((i) => [part.atoms[i].id, unreadWhy(drawing.atoms, drawing.bonds, i)]));
  const open = new Set<number>();
  for (const b of part.bonds) {
    if (b.stereo !== "wavy" && b.stereo !== "either") continue;
    open.add(b.a);
    open.add(b.b);
  }
  return { said, unread, open };
}

/** The atoms whose own fields, or whose bonds, differ between `before` and `after` - and those only in one of them. */
export function touchedAtoms(before: Model, after: Model): Set<number> {
  const out = new Set<number>();
  if (before === after) return out;
  const was = new Map(before.atoms.map((a) => [a.id, a]));
  const now = new Map(after.atoms.map((a) => [a.id, a]));
  const same = <T>(p: T, q: T) => p === q || JSON.stringify(p) === JSON.stringify(q);
  for (const [id, a] of now) if (!same(a, was.get(id))) out.add(id);
  for (const id of was.keys()) if (!now.has(id)) out.add(id);
  const bondsWas = new Map(before.bonds.map((b) => [b.id, b]));
  const bondsNow = new Map(after.bonds.map((b) => [b.id, b]));
  const ends = (b: Bond) => [b.a, b.b, ...(b.endpoints ?? [])];
  for (const [id, b] of bondsNow) {
    const w = bondsWas.get(id);
    if (same(b, w)) continue;
    ends(b).forEach((x) => out.add(x));
    if (w) ends(w).forEach((x) => out.add(x));
  }
  for (const [id, w] of bondsWas) if (!bondsNow.has(id)) ends(w).forEach((x) => out.add(x));
  return out;
}

/** The atoms of `model` in `ids`, and its bonds between them. */
function partOf(model: Model, ids: ReadonlySet<number>): Model {
  return { atoms: model.atoms.filter((a) => ids.has(a.id)), bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
}

/** The ends of a unit, by atom id: a centre's own atom, or a double bond's or an axis's two. */
export function unitAtoms(unit: ConfigurationUnit): number[] {
  return unit.kind === "centre" ? [unit.at] : [...unit.at];
}

/**
 * The structures `before` and `after` hold that the edit touched, each as it was and as it is: `after`'s structures holding a touched atom,
 * and `before`'s holding a touched atom or one of those.
 */
export function partsTouched(before: Model, after: Model): { was: Model; now: Model } | null {
  const touched = touchedAtoms(before, after);
  if (!touched.size) return null;
  const now = new Set<number>();
  for (const f of fragmentsHolding(after, touched)) f.forEach((id) => now.add(id));
  const was = new Set<number>();
  for (const f of fragmentsHolding(before, [...touched, ...now])) f.forEach((id) => was.add(id));
  return { was: partOf(before, was), now: partOf(after, now) };
}

/**
 * What the edit from `before` to `after` did to the configurations they state (see the file's header), unit by unit, in the comparison's
 * order: centres, double bonds, axes.
 */
export function configurationChanges(before: Model, after: Model, { byHand = false }: { byHand?: boolean } = {}): ConfigurationChange[] {
  const parts = partsTouched(before, after);
  if (!parts) return [];
  return changesBetween(readingOf(parts.was), readingOf(parts.now), parts, byHand ? (unit) => turnedByHand(before, after, unit) : undefined);
}

/** What an atom or a bond carries that says how it is shown or what is kept of it, not what it is or where: set aside by `turnedByHand`. */
const SHOWN_OR_KEPT = ["config", "stereoAt", "stereoShown", "color", "highlight"] as const;

/** `x` without `keys` and what is shown or kept (`SHOWN_OR_KEPT`), as one string to compare - a field set to undefined as one not there. */
function rest<T extends object>(x: T, keys: readonly string[] = []): string {
  const aside = new Set<string>([...SHOWN_OR_KEPT, ...keys]);
  const fields = Object.entries(x).filter(([k, v]) => v !== undefined && !aside.has(k));
  return JSON.stringify(fields.sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)));
}

/**
 * Whether bond `now` is bond `was` with only its stereo kind - plain, wedge, hashed wedge, wavy, either - or its narrow end changed (and,
 * with its kind, how a plain one is drawn): what a click, the click's round, the bond's menu or a key does to a stereo bond.
 */
export function stereoTurned(was: Bond, now: Bond): boolean {
  if ((was.stereo ?? "none") === (now.stereo ?? "none") && was.narrow === now.narrow) return false;
  return rest(was, ["stereo", "narrow", "display"]) === rest(now, ["stereo", "narrow", "display"]);
}

/**
 * Whether the edit from `before` to `after` was, at `unit`, the chemist's own change of a stereo bond there (docs/EDITOR-2D.md, *When an
 * edit changes a configuration*): a bond at its atom - for a double bond or an axis, the bond itself or one at either end - turned in kind
 * or narrow end (`stereoTurned`), and nothing else done there: every other bond at its atoms as it was, none made or taken away, and its
 * atoms and their neighbours unmoved and unchanged. Such a change needs no note: the chemist made it, and the unit's own label shows it.
 */
export function turnedByHand(before: Model, after: Model, unit: ConfigurationUnit): boolean {
  const ends = new Set(unitAtoms(unit));
  const at = (m: Model) => new Map(m.bonds.filter((b) => ends.has(b.a) || ends.has(b.b)).map((b) => [b.id, b]));
  const was = at(before);
  const now = at(after);
  if (was.size !== now.size) return false;
  let turned = false;
  const near = new Set(ends);
  for (const [id, w] of was) {
    const b = now.get(id);
    if (!b) return false;
    [w.a, w.b, b.a, b.b].forEach((x) => near.add(x));
    if (stereoTurned(w, b)) turned = true;
    else if (rest(w) !== rest(b)) return false;
  }
  if (!turned) return false;
  const atomsWas = new Map(before.atoms.map((a) => [a.id, a]));
  const atomsNow = new Map(after.atoms.map((a) => [a.id, a]));
  for (const id of near) {
    const [p, q] = [atomsWas.get(id), atomsNow.get(id)];
    if (!p || !q || rest(p) !== rest(q)) return false;
  }
  return true;
}

/**
 * What an edit did, against what the drawing keeps (configuration/kept): the touched structures as they are read now against what their
 * atoms and bonds kept - or, where they keep nothing yet (a drawing from before this, or new), against how they read before. With what
 * they are to keep now.
 */
export function changesAgainstKept(
  before: Model,
  after: Model,
  { byHand = false }: { byHand?: boolean } = {},
): { changes: ConfigurationChange[]; ids: Set<number>; kept: KeptOf } | null {
  const parts = partsTouched(before, after);
  if (!parts) return null;
  const now = readingOf(parts.now);
  // (against what was kept before the edit - the drawing's before, not its after, which the keep made at once may already have rewritten)
  const read = readingOf(parts.was);
  const was = keepsAny(parts.was) ? keptReading(parts.was, read.said) : read;
  const answered = byHand ? (unit: ConfigurationUnit) => turnedByHand(before, after, unit) : undefined;
  return { changes: changesBetween(was, now, parts, answered), ids: new Set(parts.now.atoms.map((a) => a.id)), kept: keptFrom(parts.now, now) };
}

/**
 * Whether `unit` is, in `part`, a place whose configuration sets something (chem/candidatesDrawn: the core's candidates, then
 * identity's units) - a centre by its atom, a double bond by the bond between its ends; an axis or a run is taken to be one.
 */
function setsSomethingIn(part: Model): (unit: ConfigurationUnit) => boolean {
  let places: ReturnType<typeof candidatesDrawn> | null = null;
  return (unit) => {
    places ??= candidatesDrawn(part);
    if (unit.kind === "centre") return places.atom(unit.at);
    const [p, q] = unit.at;
    const bond = part.bonds.find((b) => (b.a === p && b.b === q) || (b.a === q && b.b === p));
    return unit.kind === "axis" || !bond || places.bond(bond.id);
  };
}

/**
 * How `now` differs from `was`, as the header says it, of the parts `parts` - nothing said of a unit `answered` gives (`turnedByHand`: the
 * chemist's own turn of a stereo bond there), nor of one that sets nothing before the edit or after it (`setsSomethingIn`).
 */
function changesBetween(was: Reading, now: Reading, parts: { was: Model; now: Model }, answered?: (unit: ConfigurationUnit) => boolean): ConfigurationChange[] {
  const before = setsSomethingIn(parts.was);
  const after = setsSomethingIn(parts.now);
  const atomsNow = new Map(parts.now.atoms.map((a) => [a.id, a]));
  const there = (id: number) => id === -1 || atomsNow.has(id);
  // (a unit whose atoms and groups are all still there: one the edit could have turned or opened - not one gone with an atom)
  const kept = (unit: ConfigurationUnit) => {
    if (!unitAtoms(unit).every(there)) return false;
    if (unit.kind === "centre") return (was.said.centres.get(unit.at)?.neighbours ?? []).every(there);
    const key = unit.at[0] < unit.at[1] ? `${unit.at[0]},${unit.at[1]}` : `${unit.at[1]},${unit.at[0]}`;
    return (was.said.doubles.get(key)?.refs ?? []).every(there);
  };
  const out: ConfigurationChange[] = [];
  for (const d of compared(was.said, now.said)) {
    const { how: _how, ...unit } = d;
    if (answered?.(unit)) continue;
    // (a place that sets nothing before the edit or after it - a Newman's atom with two like groups, a ring's C with two methyls -
    //  states nothing to change: its marks or its depth said what is no configuration)
    if (!before(unit) || !after(unit)) continue;
    if (d.how === "inverted") out.push({ unit, how: "inverted" });
    else if (d.how === "opened" && kept(unit)) {
      const why = unitAtoms(unit)
        .map((id) => now.unread.get(id))
        .find((w) => w != null);
      const notKnown = unitAtoms(unit).some((id) => now.open.has(id));
      out.push(notKnown ? { unit, how: "unknown" } : why == null ? { unit, how: "opened" } : { unit, how: "unread", why });
    } else if (d.how === "closed" && unitAtoms(unit).some((id) => was.unread.has(id))) out.push({ unit, how: "read" });
  }
  // (every unit the structure states turned, two or more: the chemist drew its mirror image - one note, not one for each)
  const units = was.said.centres.size + was.said.doubles.size + was.said.axes.size;
  const turned = out.filter((c) => c.how === "inverted");
  if (turned.length >= 2 && turned.length === out.length && turned.length === units) return [{ unit: turned[0].unit, how: "mirror" }];
  return out;
}

/**
 * An atom's name in a note: its element and its number in its own molecule (configuration/names) - as `names` gives it, worked out off
 * the drawing's thread, else its place among its molecule's atoms ("C3").
 */
export function atomName(model: Model, id: number, names?: ReadonlyMap<number, string>): string {
  return names?.get(id) ?? placeNames(model, [id]).get(id) ?? "an atom";
}

/** A unit's name in a note: "C3", "C4=C5" for a double bond, "the axis C4-C5". */
export function unitName(model: Model, unit: ConfigurationUnit, names?: ReadonlyMap<number, string>): string {
  if (unit.kind === "centre") return atomName(model, unit.at, names);
  const [p, q] = unit.at.map((id) => atomName(model, id, names));
  return unit.kind === "double" ? `${p}=${q}` : `the axis ${p}-${q}`;
}

/**
 * A change in words, at its unit (docs/EDITOR-2D.md, *When an edit changes a configuration*), `label` its descriptors before and after
 * where the CIP gives them, `names` the atoms' names (`atomName`):
 * - "C3: S, now R" - "C3: inverted" where either descriptor is not known;
 * - "C3: S, now unspecified" (a plain bond), "C3: S, now marked unknown" (a wavy bond, an "either" double bond), "C3: S, now unclear: "
 *   and the reader's words - each without its "S, " where it had none;
 * - "C3: now R" where it is stated again, "C3: stated again" without one;
 * - "Every stereocentre inverted: the mirror image".
 * `by` names Meno's own move that made it ("Clean-up"), said first: a change no move of Meno's should make.
 */
export function changeWords(
  model: Model,
  change: ConfigurationChange,
  label: { was?: string; now?: string } = {},
  by?: string,
  names?: ReadonlyMap<number, string>,
): string {
  const name = unitName(model, change.unit, names);
  const had = label.was ? `${label.was}, ` : "";
  const said = (() => {
    switch (change.how) {
      case "inverted":
        return label.was && label.now && label.was !== label.now ? `${name}: ${label.was}, now ${label.now}` : `${name}: inverted`;
      case "opened":
        return `${name}: ${had}now unspecified`;
      case "unknown":
        return `${name}: ${had}now marked unknown`;
      case "unread":
        return `${name}: ${had}now unclear: ${change.why}`;
      case "read":
        return label.now ? `${name}: now ${label.now}` : `${name}: stated again`;
      case "mirror":
        return "Every stereocentre inverted: the mirror image";
    }
  })();
  return by ? `changed by ${by}: ${said}` : said;
}
