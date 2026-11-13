import { describe, expect, it } from "vitest";
import { forgetLaidOut } from "../../../../lib/layout/engine";
import type { Model } from "../store/types";
import { readMarks } from "../utils/figures";
import { ARRANGEMENT_SAID } from "../utils/arrangement";
import { drawingOf } from "./fromSmiles";
import { laidOut } from "./cleanUp";
import { editorModelOf, processFileContent } from "../utils/io";

// A typed SMILES reaches the page as the plugin's MOL block, laid out by Meno (chem/fromSmiles `drawingOf`). The block's
// coordinates are the plugin's, nobody's drawing: a four-bond metal is laid out as from a SMILES - the X where it is surely square
// planar and its donors lie round it one way only, the upright cross and marked where they lie more ways, the upright cross where
// it is not surely square planar - not kept in whichever form the plugin's coordinates happen to have, as a chemist's drawing is.

type A = { el: string; x: number; y: number; charge?: number; valence?: number };

/** A V2000 MOL block of `atoms` bonded singly to the first, set round it at `turn` degrees and every 90 from there. */
function block(atoms: readonly Omit<A, "x" | "y">[], turn: number): string {
  const at: A[] = atoms.map((a, k) =>
    k === 0 ? { ...a, x: 0, y: 0 } : { ...a, x: 1.5 * Math.cos(((turn + 90 * (k - 1)) * Math.PI) / 180), y: 1.5 * Math.sin(((turn + 90 * (k - 1)) * Math.PI) / 180) },
  );
  const f = (v: number) => v.toFixed(4).padStart(10);
  const n = (v: number, w = 3) => String(v).padStart(w);
  const lines = [
    "",
    "  hand-written",
    "",
    `${n(at.length)}${n(at.length - 1)}  0  0  0  0  0  0  0  0999 V2000`,
    ...at.map((a) => `${f(a.x)}${f(a.y)}${f(0)} ${a.el.padEnd(3)} 0  0  0  0  0${n(a.valence ?? 0)}  0  0  0  0  0  0`),
    ...at.slice(1).map((_, k) => `${n(1)}${n(k + 2)}  1  0`),
    ...at.flatMap((a, k) => (a.charge ? [`M  CHG  1${n(k + 1, 4)}${n(a.charge, 4)}`] : [])),
    "M  END",
  ];
  return lines.join("\n");
}

const metalOf = (m: Model) => m.atoms.find((a) => ["Ti", "Pt", "Pd", "Au"].includes(a.el))!;
/** The directions of the metal's four bonds, in degrees from -180 up. */
function directions(m: Model): number[] {
  const c = metalOf(m);
  return m.bonds
    .filter((b) => b.a === c.id || b.b === c.id)
    .map((b) => m.atoms.find((a) => a.id === (b.a === c.id ? b.b : b.a))!)
    .map((o) => Math.round((Math.atan2(o.y - c.y, o.x - c.x) * 180) / Math.PI))
    .map((d) => (d === 180 ? -180 : d === 0 ? 0 : d))
    .sort((p, q) => p - q);
}

const X = [-135, -45, 45, 135];
const CROSS = [-180, -90, 0, 90];
const Cl = { el: "Cl" };
// (an NH3 on the metal: its valence 4, as a file sets one - three H and the bond)
const NH3 = { el: "N", valence: 4 };

describe("a four-bond metal from a typed SMILES - the plugin's MOL block", () => {
  it("is laid out as new, not kept in the form the plugin's coordinates have", { timeout: 120000 }, async () => {
    forgetLaidOut();
    // (TiCl4, not surely square planar, given as an X: the upright cross)
    expect(directions(await drawingOf(block([{ el: "Ti" }, Cl, Cl, Cl, Cl], 45)))).toEqual(CROSS);
    // (PtCl4 2-, its donors lying round it one way only, given upright: the X)
    expect(directions(await drawingOf(block([{ el: "Pt", charge: -2 }, Cl, Cl, Cl, Cl], 0)))).toEqual(X);
    // (cisplatin, given as an X with its two Cl next to each other: the upright cross, marked - which donors are next to each other is not given)
    const cis = await drawingOf(block([{ el: "Pt" }, Cl, Cl, NH3, NH3], 45));
    expect(directions(cis)).toEqual(CROSS);
    expect(readMarks(cis).atoms.get(metalOf(cis).id)).toBe(ARRANGEMENT_SAID);
  });

  it("where a chemist's file has the form - the same blocks opened and cleaned up - keeps it", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const opened = async (mol: string) => laidOut(editorModelOf((await processFileContent("drawn.mol", mol)).model));
    expect(directions(await opened(block([{ el: "Ti" }, Cl, Cl, Cl, Cl], 45)))).toEqual(X);
    expect(directions(await opened(block([{ el: "Pt", charge: -2 }, Cl, Cl, Cl, Cl], 0)))).toEqual(CROSS);
  });
});
