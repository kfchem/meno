/**
 * What an edit did to the configuration a drawing states (foundation part 15, phase 2; docs/EDITOR-2D.md, *When an edit turns a
 * configuration*): each structure the edit touched read before and after with the one reader (chem/engineLayout `stereoOf`: the
 * reader's `readStereo` with depth and the cage fit, by atom id) and the two compared unit by unit (lib/chem/perception/stereo/compare
 * `compared`, part 14 C's one comparison). What is said, of each unit:
 * - turned (`inverted`): its descriptor, before and after, where the CIP gives one ("C3: R, now S");
 * - no longer stated though its atom and its groups are all still there (`opened`): "now open" where the drawing says it is not known
 *   (a wavy bond, an "either" double bond), else "no longer read" with the reader's words where its marks say nothing readable, else
 *   "now open";
 * - stated again where its marks had said nothing readable (`read`): "now read".
 * Nothing is said where nothing changed, where a unit is simply new (a wedge just drawn), gone with its atom or one of its groups, or no
 * longer a unit because two of its groups are now alike. A structure whose every unit turned - two or more - is one note: its mirror
 * image. Pure: no DOM, no store.
 */
import type { ConfigurationUnit } from "../../../../lib/chem/perception/stereo/compare";
import { compared, type Said } from "../../../../lib/chem/perception/stereo/compare";
import { unreadWhy } from "../../../../lib/layout/drawn";
import { readStereo } from "../../../../lib/layout/drawn";
import { drawingOf } from "../chem/drawing";
import { stereoOf, unreadWedges } from "../chem/engineLayout";
import { fragmentsHolding } from "../chem/cleanUp";
import { keepsAny, keptFrom, keptReading, type KeptOf } from "./kept";
import type { Atom, Bond, Model } from "../store/types";

/** How a unit's configuration changed, as it is said. */
export type ChangeHow = "inverted" | "opened" | "unread" | "read" | "mirror";

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
export function configurationChanges(before: Model, after: Model): ConfigurationChange[] {
  const parts = partsTouched(before, after);
  if (!parts) return [];
  return changesBetween(readingOf(parts.was), readingOf(parts.now), parts.now);
}

/**
 * What an edit did, against what the drawing keeps (configuration/kept): the touched structures as they are read now against what their
 * atoms and bonds kept - or, where they keep nothing yet (a drawing from before this, or new), against how they read before. With what
 * they are to keep now.
 */
export function changesAgainstKept(before: Model, after: Model): { changes: ConfigurationChange[]; ids: Set<number>; kept: KeptOf } | null {
  const parts = partsTouched(before, after);
  if (!parts) return null;
  const now = readingOf(parts.now);
  const was = keepsAny(parts.now) ? keptReading(parts.now, now.said) : readingOf(parts.was);
  return { changes: changesBetween(was, now, parts.now), ids: new Set(parts.now.atoms.map((a) => a.id)), kept: keptFrom(parts.now, now) };
}

/** How `now` differs from `was`, as the header says it, of the part `nowPart`. */
function changesBetween(was: Reading, now: Reading, nowPart: Model): ConfigurationChange[] {
  const parts = { now: nowPart };
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
    if (d.how === "inverted") out.push({ unit, how: "inverted" });
    else if (d.how === "opened" && kept(unit)) {
      const why = unitAtoms(unit)
        .map((id) => now.unread.get(id))
        .find((w) => w != null);
      const notKnown = unitAtoms(unit).some((id) => now.open.has(id));
      out.push(notKnown || why == null ? { unit, how: "opened" } : { unit, how: "unread", why });
    } else if (d.how === "closed" && unitAtoms(unit).some((id) => was.unread.has(id))) out.push({ unit, how: "read" });
  }
  // (every unit the structure states turned, two or more: the chemist drew its mirror image - one note, not one for each)
  const units = was.said.centres.size + was.said.doubles.size + was.said.axes.size;
  const turned = out.filter((c) => c.how === "inverted");
  if (turned.length >= 2 && turned.length === out.length && turned.length === units) return [{ unit: turned[0].unit, how: "mirror" }];
  return out;
}

/** An atom's name in a note: its element and its place in the drawing, counted from 1 ("C3"); a label's own text. */
export function atomName(model: Model, id: number): string {
  const i = model.atoms.findIndex((a) => a.id === id);
  if (i < 0) return "an atom";
  const a: Atom = model.atoms[i];
  return `${a.el}${i + 1}`;
}

/** A unit's name in a note: "C3", "C4=C5" for a double bond, "the axis C4-C5". */
export function unitName(model: Model, unit: ConfigurationUnit): string {
  if (unit.kind === "centre") return atomName(model, unit.at);
  const [p, q] = unit.at.map((id) => atomName(model, id));
  return unit.kind === "double" ? `${p}=${q}` : `the axis ${p}-${q}`;
}

/**
 * A change in words, at its unit (docs/EDITOR-2D.md): "C3: R, now S" where both descriptors are known, "C3: turned" where not; "C3: now
 * open"; "C3: no longer read: " and why; "C3: now read: R"; "every centre turned: the mirror image". `by` names Meno's own move that made
 * it ("Clean-up"), said first: a change no move of Meno's should make.
 */
export function changeWords(model: Model, change: ConfigurationChange, label: { was?: string; now?: string } = {}, by?: string): string {
  const name = unitName(model, change.unit);
  const said = (() => {
    switch (change.how) {
      case "inverted":
        return label.was && label.now && label.was !== label.now ? `${name}: ${label.was}, now ${label.now}` : `${name}: turned`;
      case "opened":
        return `${name}: now open`;
      case "unread":
        return `${name}: no longer read: ${change.why}`;
      case "read":
        return label.now ? `${name}: now read: ${label.now}` : `${name}: now read`;
      case "mirror":
        return "every centre turned: the mirror image";
    }
  })();
  return by ? `changed by ${by}: ${said}` : said;
}
