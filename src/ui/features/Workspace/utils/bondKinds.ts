/**
 * The kinds of bond the right-click menu of a bond chooses among
 * (docs/EDITOR-2D.md, *Menus*): what a bond is drawn as - its order, its
 * wedge or wave, how a single one is drawn (bold, hashed, dashed), a dative
 * one - each a patch to the bond that makes it that kind and nothing else
 * (its stereo orientation, its colour and the rest it has are kept).
 */
import type { Bond } from "../store/types";

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
 * not left as it was (a wavy bond clicked stayed wavy).
 */
export function singleClickPatch(b: Pick<Bond, "stereo" | "stereoOrient" | "display" | "dative">): Partial<Bond> {
  const stereo = b.stereo ?? "none";
  const orient = b.stereoOrient ?? "principle";
  // (another kind of single: the plain one first)
  const other = stereo === "wavy" || stereo === "either" || b.dative || b.display === "bold" || b.display === "hashed" || b.display === "dashed";
  if (other) return { stereo: "none", display: undefined, dative: undefined, stereoOrient: orient };
  if (stereo === "none") return { stereo: "up", stereoOrient: orient };
  if (stereo === "up") return { stereo: "down", stereoOrient: orient };
  return { stereo: "none", stereoOrient: orient === "principle" ? "reverse" : "principle" };
}
