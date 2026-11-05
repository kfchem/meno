/**
 * The kinds of bond the right-click menu of a bond chooses among
 * (docs/EDITOR-2D.md, *Menus*): what a bond is drawn as - its order, its
 * wedge or wave, how a single one is drawn (bold, hashed, dashed), a dative
 * one - each a patch to the bond that makes it that kind and nothing else
 * (its stereo orientation, its colour and the rest it has are kept).
 */
import type { Bond } from "../store/types";
import { degrees, narrowEnd } from "../chem/drawing";

export type BondKindName = "single" | "double" | "triple" | "wedge" | "hashed-wedge" | "wavy" | "bold" | "hashed" | "dashed" | "dative";

/** The five that are done most, as icons; the rest in a second row, shown as "more" is pressed. */
export const COMMON_BOND_KINDS: readonly BondKindName[] = ["single", "double", "triple", "wedge", "hashed-wedge"];
export const OTHER_BOND_KINDS: readonly BondKindName[] = ["wavy", "bold", "hashed", "dashed", "dative"];

/** What each kind is called where it is named. */
export const BOND_KIND_NAMES: Record<BondKindName, string> = {
  single: "Single bond",
  double: "Double bond",
  triple: "Triple bond",
  wedge: "Wedge",
  "hashed-wedge": "Hashed wedge",
  wavy: "Wavy bond",
  bold: "Bold bond",
  hashed: "Bold dashed bond",
  dashed: "Dashed bond",
  dative: "Dative bond",
};

/** The bond key that makes each kind, said with its name where it is named (`bondKeyOf`). */
export const BOND_KIND_KEYS: Partial<Record<BondKindName, string>> = { single: "1", double: "2", triple: "3" };

type KindPatch = Pick<Bond, "order" | "stereo" | "display" | "dative">;

/** The patch that makes a bond of `kind`. */
export function bondKindPatch(kind: BondKindName): KindPatch {
  const plain = { stereo: "none" as const, display: undefined, dative: undefined };
  switch (kind) {
    case "single":
      return { order: 1, ...plain };
    case "double":
      return { order: 2, ...plain };
    case "triple":
      return { order: 3, ...plain };
    case "wedge":
      return { order: 1, ...plain, stereo: "up" };
    case "hashed-wedge":
      return { order: 1, ...plain, stereo: "down" };
    case "wavy":
      return { order: 1, ...plain, stereo: "wavy" };
    case "bold":
      return { order: 1, ...plain, display: "bold" };
    case "hashed":
      return { order: 1, ...plain, display: "hashed" };
    case "dashed":
      return { order: 1, ...plain, display: "dashed" };
    case "dative":
      return { order: 1, ...plain, dative: true };
  }
}

/** The kind a bond is, or null where it is none of these (a ring's perspective bond, say). */
export function bondKindOf(b: Pick<Bond, "order" | "stereo" | "display" | "dative">): BondKindName | null {
  if (b.dative) return "dative";
  if (b.order === 3) return "triple";
  if (b.order === 2) return "double";
  if (b.stereo === "up") return "wedge";
  if (b.stereo === "down") return "hashed-wedge";
  if (b.stereo === "wavy") return "wavy";
  if (b.display === "bold") return "bold";
  if (b.display === "hashed") return "hashed";
  if (b.display === "dashed") return "dashed";
  if (b.display === "wedge") return null;
  return "single";
}

/**
 * What a click on a single bond makes of it, the cycle drawing wants: plain,
 * wedge, hashed wedge, plain again with the wedge's other end narrow. A
 * bond that is another kind - wavy, or bold, hashed, dashed or dative, as
 * its menu or a file made it - is taken out of it into the cycle's plain,
 * not left as it was (a wavy bond clicked stayed wavy). `narrowNow` is the
 * end a wedge is narrow at as drawn (chem/drawing `narrowEnd`).
 */
export function singleClickPatch(b: Pick<Bond, "a" | "b" | "stereo" | "display" | "dative">, narrowNow: number): Partial<Bond> {
  const stereo = b.stereo ?? "none";
  // (another kind of single: the plain one first)
  const other = stereo === "wavy" || stereo === "either" || b.dative || b.display === "bold" || b.display === "hashed" || b.display === "dashed";
  if (other) return { stereo: "none", display: undefined, dative: undefined };
  if (stereo === "none") return { stereo: "up", narrow: narrowNow };
  if (stereo === "up") return { stereo: "down", narrow: narrowNow };
  return { stereo: "none", narrow: narrowNow === b.a ? b.b : b.a };
}

type At = { id: number; x: number; y: number };
type Link = { id: number; a: number; b: number };
type Side = NonNullable<Bond["doubleMode"]>;

/**
 * The side a double bond is drawn on by itself (`doubleMode` "auto"): towards the side more of its neighbours stand on,
 * left or right of it from its first atom to its second; in the middle where as many stand on each.
 */
export function doubleSideAuto(b: Link, atoms: readonly At[], bonds: readonly Link[]): "left" | "center" | "right" {
  const a1 = atoms.find((a) => a.id === b.a);
  const a2 = atoms.find((a) => a.id === b.b);
  if (!a1 || !a2) return "center";
  const dx = a2.x - a1.x,
    dy = a2.y - a1.y;
  const L0 = Math.hypot(dx, dy);
  const nx = L0 > 1e-9 ? -dy / L0 : 0,
    ny = L0 > 1e-9 ? dx / L0 : 1;
  const EPS = Math.max(1e-4, L0 * 0.06);
  let plus = 0,
    minus = 0;
  for (const bb of bonds) {
    if (bb.id === b.id) continue;
    for (const end of [a1, a2]) {
      if (bb.a !== end.id && bb.b !== end.id) continue;
      const other = bb.a === end.id ? bb.b : bb.a;
      if (other === a1.id || other === a2.id) continue;
      const p = atoms.find((x) => x.id === other);
      if (!p) continue;
      const s = (p.x - end.x) * nx + (p.y - end.y) * ny;
      if (s > EPS) plus++;
      else if (s < -EPS) minus++;
    }
  }
  if (plus === minus) return "center";
  return plus > minus ? "left" : "right";
}

/**
 * What a double-click makes of a bond, the cycle drawing wants: one that is not double becomes a plain double drawn on its
 * own side; a double one is drawn on the next side that looks different - its own side first, then the middle, then the
 * other side - never one that looks as it does now.
 */
export function doubleClickPatch(b: Link & Pick<Bond, "order" | "doubleMode">, atoms: readonly At[], bonds: readonly Link[]): Partial<Bond> {
  if (b.order !== 2) return { order: 2, doubleMode: "auto", stereo: "none", display: undefined, dative: undefined };
  const dm: Side = b.doubleMode ?? "auto";
  const auto = doubleSideAuto(b, atoms, bonds);
  const now = dm === "auto" ? auto : dm;
  // (from each side it can be drawn on, in the order a double-click takes them)
  const order: Record<"left" | "center" | "right", Record<Side, Side[]>> = {
    left: { auto: ["center", "right", "left"], left: ["center", "right", "auto"], center: ["right", "auto", "left"], right: ["auto", "left", "center"] },
    right: { auto: ["center", "left", "right"], right: ["center", "left", "auto"], center: ["left", "auto", "right"], left: ["auto", "right", "center"] },
    center: { auto: ["left", "right", "center"], center: ["right", "left", "auto"], left: ["right", "auto", "center"], right: ["left", "auto", "center"] },
  };
  const next = order[auto][dm].find((c) => (c === "auto" ? auto : c) !== now) ?? (dm === "right" ? "left" : "right");
  return { doubleMode: next };
}

/** The keys that set a bond's kind, with the pointer on it (docs/EDITOR-2D.md, *Bond keys*). */
export type BondKey = 1 | 2 | 3;

/**
 * What a bond key makes of a bond (the maintainer, 2026-11-04: pressed again, it goes on as clicks do), as all it is, so
 * that every bond selected can take it alike: 1, a single - on a single, the click's cycle (`singleClickPatch`); 2, a
 * double - on a double, the double-click's sides (`doubleClickPatch`); 3, a triple.
 */
export function bondKeyPatch(key: BondKey, b: Link & Pick<Bond, "order" | "doubleMode" | "stereo" | "narrow" | "display" | "dative">, atoms: readonly At[], bonds: readonly Link[]): Partial<Bond> {
  const plain = { stereo: "none" as const, display: undefined, dative: undefined };
  if (key === 3) return { order: 3, ...plain };
  if (key === 2) return b.order === 2 ? { order: 2, ...plain, ...doubleClickPatch(b, atoms, bonds) } : doubleClickPatch(b, atoms, bonds);
  return b.order === 1 ? { order: 1, display: undefined, dative: undefined, ...singleClickPatch(b, narrowEnd(b, degrees(bonds))) } : { order: 1, ...plain };
}

/**
 * `patch`, made of the bond `from`, for another bond selected with it, `to`: the same, but where it says which end is
 * narrow (`Bond.narrow`, an atom's id) - that end of `to` as it is now where the patch keeps `from`'s, its other end
 * where the patch turns `from`'s round.
 */
export function patchAlike(patch: Partial<Bond>, from: Pick<Bond, "a" | "b" | "narrow">, to: Pick<Bond, "a" | "b" | "narrow">, bonds: readonly Link[]): Partial<Bond> {
  if (patch.narrow == null) return patch;
  const degree = degrees(bonds);
  const kept = patch.narrow === narrowEnd(from, degree);
  const now = narrowEnd(to, degree);
  return { ...patch, narrow: kept ? now : now === to.a ? to.b : to.a };
}

/** Whether `patch` would change nothing of `b`: each field as it reads where it is not set. */
export function patchChangesNothing(b: Partial<Bond>, patch: Partial<Bond>): boolean {
  const unset: Partial<Record<keyof Bond, unknown>> = { stereo: "none", doubleMode: "auto", dative: false };
  return (Object.keys(patch) as (keyof Bond)[]).every((k) => (b[k] ?? unset[k]) === (patch[k] ?? unset[k]));
}

/**
 * The bond key a key press is, or null: read by the key the hand pressed (`code`, the top row's or the keypad's), so that
 * a keyboard whose digits take Shift (AZERTY) or an input method that is on (Japanese, keyCode 229) sets it all the same;
 * none with Ctrl, Cmd or Alt held - those chords are others' (Cmd+1 fits the view) - nor a key held down and coming again.
 */
export function bondKeyOf(e: { code?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean }): BondKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  const m = /^(?:Digit|Numpad)([1-3])$/.exec(e.code ?? "");
  return m ? (Number(m[1]) as BondKey) : null;
}
