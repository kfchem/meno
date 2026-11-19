import { describe, expect, it } from "vitest";
import { forgetLaidOut } from "../../../../lib/layout/engine";
import { MENO } from "../../../../lib/chem/style";
import type { Model } from "../store/types";
import { readMarks } from "../utils/figures";
import { ARRANGEMENT_SAID } from "../utils/arrangement";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { laidOut } from "./cleanUp";
import { drawingOf } from "./drawing";
import { wedgeOctahedron } from "./engineLayout";

// A six-bond metal laid out as the text draws an octahedron (Brecher 2006, ST-2.11; docs/LAYOUT-2D.md, section 7): three lines
// through it, one upright; drawn with wedges in one of the text's forms, read and kept as drawn.

/** A metal and six donors drawn by hand, each at `deg` degrees with its bond's wedge (narrow at the metal) or none. */
function octahedron(spokes: [string, number, ("up" | "down")?][], metal = "Co", charge = 3): Model {
  const atoms: Model["atoms"] = [{ id: 1, x: 0, y: 0, r: 0.9, el: metal, ...(charge ? { charge } : {}) }];
  const bonds: Model["bonds"] = [];
  spokes.forEach(([el, deg, stereo], k) => {
    const t = (deg * Math.PI) / 180;
    atoms.push({ id: k + 2, x: 1.4 * Math.cos(t), y: 1.4 * Math.sin(t), r: 0.9, el });
    bonds.push({ id: 100 + k, a: 1, b: k + 2, order: 1, ...(stereo ? { stereo, narrow: 1 } : {}) });
  });
  return { atoms, bonds } as Model;
}

/**
 * Round the metal (id 1): each donor's element, its bond's kind (+ solid, # hashed; ! after it where the wedge is not narrow at the metal)
 * and its way in whole degrees from 0 to 359.
 */
function spokes(m: Model): string[] {
  const c = m.atoms.find((a) => a.id === 1)!;
  return m.bonds
    .filter((b) => b.a === 1 || b.b === 1)
    .map((b) => {
      const o = m.atoms.find((a) => a.id === (b.a === 1 ? b.b : b.a))!;
      const deg = Math.round((((Math.atan2(o.y - c.y, o.x - c.x) * 180) / Math.PI) % 360 + 360) % 360) % 360;
      const wedge = b.stereo === "up" ? "+" : b.stereo === "down" ? "#" : "";
      return `${o.el}${wedge}${wedge && b.narrow !== 1 ? "!" : ""}@${deg}`;
    })
    .sort();
}

const FIRST: [string, number, ("up" | "down")?][] = [
  ["F", 90],
  ["Cl", 270],
  ["Br", 30, "down"],
  ["I", 150, "down"],
  ["N", 210, "up"],
  ["O", 330, "up"],
];

describe("an octahedron drawn with wedges", () => {
  it("is read in the text's first, third and fourth forms - its three lines, each two plain bonds or a solid and a hashed wedge - and a prism is not", () => {
    const read = (m: Model) => wedgeOctahedron(drawingOf(m), 0);
    expect(read(octahedron(FIRST))).not.toBeNull();
    expect(read(octahedron([["F", 90, "up"], ["Cl", 210, "up"], ["Br", 330, "up"], ["I", 270, "down"], ["N", 30, "down"], ["O", 150, "down"]]))).not.toBeNull();
    expect(read(octahedron([["F", 90], ["Cl", 270], ["Br", 0], ["I", 180], ["N", 225, "up"], ["O", 45, "down"]]))).not.toBeNull();
    // (a trigonal prism, ST-2.12: no three lines; a line of two solid wedges; a wedge narrow at its donor; no wedge at all)
    expect(read(octahedron([["F", 60], ["Cl", 120], ["Br", 240, "up"], ["I", 300, "up"], ["N", 0, "down"], ["O", 180, "down"]]))).toBeNull();
    expect(read(octahedron([["F", 90], ["Cl", 270], ["Br", 30, "up"], ["I", 150, "down"], ["N", 210, "up"], ["O", 330, "down"]]))).toBeNull();
    // (wedges in an order none of the forms has: both solids on one side of the plain line; three solids side by side)
    expect(read(octahedron([["F", 90], ["Cl", 270], ["Br", 30, "up"], ["I", 150, "down"], ["N", 210, "down"], ["O", 330, "up"]]))).toBeNull();
    expect(read(octahedron([["F", 30, "up"], ["Cl", 90, "up"], ["Br", 150, "up"], ["I", 210, "down"], ["N", 270, "down"], ["O", 330, "down"]]))).toBeNull();
    // (a pair 140 degrees apart: more than 30 off a line, none of the forms)
    expect(read(octahedron([["F", 90], ["Cl", 230], ["Br", 30, "down"], ["I", 150, "down"], ["N", 210, "up"], ["O", 330, "up"]]))).toBeNull();
    const narrowOut = octahedron(FIRST);
    narrowOut.bonds[2] = { ...narrowOut.bonds[2], narrow: 4 };
    expect(read(narrowOut)).toBeNull();
    expect(read(octahedron(FIRST.map(([el, deg]) => [el, deg])))).toBeNull();
  });

  it("is kept by Clean-up as drawn - every donor on its spoke, every bond its kind - in each form, and a prism refused", { timeout: 120000 }, async () => {
    forgetLaidOut();
    for (const drawn of [
      FIRST,
      [["F", 90, "up"], ["Cl", 210, "up"], ["Br", 330, "up"], ["I", 270, "down"], ["N", 30, "down"], ["O", 150, "down"]],
      [["F", 90], ["Cl", 270], ["Br", 0], ["I", 180], ["N", 225, "up"], ["O", 45, "down"]],
    ] as [string, number, ("up" | "down")?][][]) {
      const m = octahedron(drawn);
      expect(spokes(await laidOut(m, MENO)), JSON.stringify(drawn)).toEqual(spokes(m));
    }
    await expect(laidOut(octahedron([["F", 60], ["Cl", 120], ["Br", 240, "up"], ["I", 300, "up"], ["N", 0, "down"], ["O", 180, "down"]]), MENO)).rejects.toThrow(/wedges at Co/);
  });

  it("is straightened onto the form's angles where drawn by hand, its order round the metal the same", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const byHand = octahedron([["F", 93], ["Cl", 268], ["Br", 28, "down"], ["I", 155, "down"], ["N", 212, "up"], ["O", 326, "up"]]);
    expect(spokes(await laidOut(byHand, MENO))).toEqual(spokes(octahedron(FIRST)));
  });

  it("straightens a spoke drawn 11 degrees off its line onto it, the others where they are", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const oneOff = octahedron(FIRST.map(([el, deg, st]) => [el, el === "Br" ? deg + 11 : deg, st] as [string, number, ("up" | "down")?]));
    expect(spokes(await laidOut(oneOff, MENO))).toEqual(spokes(octahedron(FIRST)));
  });

  it("keeps its hand: drawn and drawn mirrored left to right, both kept, and the two results still each other's mirror image", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const mirrored = FIRST.map(([el, deg, st]) => [el, (540 - deg) % 360, st] as [string, number, ("up" | "down")?]);
    const one = spokes(await laidOut(octahedron(FIRST), MENO));
    const other = spokes(await laidOut(octahedron(mirrored), MENO));
    expect(other).toEqual(spokes(octahedron(mirrored)));
    // (the other, mirrored back, is the first)
    const back = other.map((s) => s.replace(/@(\d+)/, (_, d) => `@${(540 - Number(d)) % 360}`)).sort();
    expect(back).toEqual(one);
    expect(other).not.toEqual(one);
  });

  it("is refused where one ligand holds two of its donors: a chelate drawn in a wedge form is no case Clean-up keeps", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const m = octahedron([["N", 90], ["N", 30, "down"], ["Cl", 270], ["Br", 150, "down"], ["F", 210, "up"], ["I", 330, "up"]]);
    // (the two N joined by two carbons: ethane-1,2-diamine, its ends 60 degrees apart)
    m.atoms.push({ id: 20, x: 0.5, y: 2.2, r: 0.9, el: "C" }, { id: 21, x: 1.8, y: 1.4, r: 0.9, el: "C" });
    m.bonds.push({ id: 200, a: 2, b: 20, order: 1 }, { id: 201, a: 20, b: 21, order: 1 }, { id: 202, a: 21, b: 3, order: 1 });
    await expect(laidOut(m, MENO)).rejects.toThrow(/donors opposite each other as drawn/);
  });
});

describe("a six-bond metal laid out from its SMILES", () => {
  /** The metal's spokes, as ways in whole degrees, sorted. */
  const ways = (m: Model, el: string) => {
    const c = m.atoms.find((a) => a.el === el)!;
    return m.bonds
      .filter((b) => b.a === c.id || b.b === c.id)
      .map((b) => m.atoms.find((a) => a.id === (b.a === c.id ? b.b : b.a))!)
      .map((o) => (Math.round((Math.atan2(o.y - c.y, o.x - c.x) * 180) / Math.PI) + 360) % 360)
      .sort((p, q) => p - q);
  };

  it("is three lines through it, 60 degrees apart, one upright, with plain bonds: SF6 and PCl6- (the text's own samples)", { timeout: 120000 }, async () => {
    forgetLaidOut();
    for (const [smiles, el] of [["FS(F)(F)(F)(F)F", "S"], ["Cl[P-](Cl)(Cl)(Cl)(Cl)Cl", "P"]] as const) {
      const laid = await laidOut(drawnFromSmiles(smiles), MENO, undefined, undefined, true);
      expect(ways(laid, el), smiles).toEqual([30, 90, 150, 210, 270, 330]);
      expect(laid.bonds.every((b) => !b.stereo || b.stereo === "none"), smiles).toBe(true);
    }
  });

  it("keeps every donor on its spoke where its chelates' donors are NH2: a single donor beside an NH2 is turned back onto its line, however far a later step moved it", { timeout: 120000 }, async () => {
    forgetLaidOut();
    for (const smiles of ["Cl[Co+]1234Cl.[NH2]1CC[NH2]2.[NH2]3CC[NH2]4", "Cl[Co+2]1234[NH3].[NH2]1CC[NH2]2.[NH2]3CC[NH2]4", "Cl[Ru]1234Cl.[NH2]1CC[OH]2.[NH2]3CC[OH]4"]) {
      const laid = await laidOut(drawnFromSmiles(smiles), MENO, undefined, undefined, true);
      const metal = laid.atoms.find((a) => a.el === "Co" || a.el === "Ru")!.el;
      expect(ways(laid, metal), smiles).toEqual([30, 90, 150, 210, 270, 330]);
    }
  });

  it("is three lines with one chelate or three, its other ligands on the spokes left: Ru(en)Cl4, [Co(en)(NH3)4]3+, [Co(en)3]3+", { timeout: 120000 }, async () => {
    forgetLaidOut();
    for (const [smiles, metal] of [
      ["Cl[Ru-2]12(Cl)(Cl)Cl.[NH2]1CC[NH2]2", "Ru"],
      ["N[Co+3]12(N)(N)N.[NH2]1CC[NH2]2", "Co"],
      ["N1CCN[Co+3]123(NCCN2)NCCN3", "Co"],
    ] as const) {
      const laid = await laidOut(drawnFromSmiles(smiles), MENO, undefined, undefined, true);
      expect(ways(laid, metal), smiles).toEqual([30, 90, 150, 210, 270, 330]);
    }
  });

  it("keeps a macrocycle's four donors square round the metal, its two other ligands beside: cyclam's and a porphyrin's", { timeout: 120000 }, async () => {
    forgetLaidOut();
    for (const [smiles, metal] of [
      ["Cl[Co+3]1234Cl.[NH]15CC[NH]2CCC[NH]3CC[NH]4CCC5", "Co"],
      ["Cl[Co+3]1234N.[NH]15CC[NH]2CCC[NH]3CC[NH]4CCC5", "Co"],
      ["N[Fe+2]6789N.C1=CC2=CC3=CC=C([N-]36)C=C4C=CC(=N47)C=C5C=CC(=CC1=N28)[N-]59", "Fe"],
    ] as const) {
      // (laid out, not refused: a macrocycle's donors cannot stand on spokes side by side)
      const laid = await laidOut(drawnFromSmiles(smiles), MENO, undefined, undefined, true);
      const c = laid.atoms.find((a) => a.el === metal)!;
      const ring = laid.bonds
        .filter((b) => b.a === c.id || b.b === c.id)
        .map((b) => laid.atoms.find((a) => a.id === (b.a === c.id ? b.b : b.a))!)
        .filter((o) => laid.bonds.some((b) => (b.a === o.id || b.b === o.id) && b.a !== c.id && b.b !== c.id && laid.atoms.find((a) => a.id === (b.a === o.id ? b.b : b.a))!.el === "C"));
      expect(ring, smiles).toHaveLength(4);
      const at = ring.map((o) => (((Math.atan2(o.y - c.y, o.x - c.x) * 180) / Math.PI) % 360 + 360) % 360).sort((p, q) => p - q);
      at.forEach((t, i) => expect(((at[(i + 1) % 4] - t + 360) % 360), smiles).toBeCloseTo(90, 0));
    }
  });

  it("with no arrangement given, draws one and marks the metal: [Co(en)2Cl2]+", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const laid = await laidOut(drawnFromSmiles("Cl[Co+]1234Cl.N1CCN2.N3CCN4"), MENO, undefined, undefined, true);
    expect(ways(laid, "Co")).toEqual([30, 90, 150, 210, 270, 330]);
    const co = laid.atoms.find((a) => a.el === "Co")!;
    expect(readMarks(laid).atoms.get(co.id)).toBe(ARRANGEMENT_SAID);
  });
});

describe("a four-bond metal with one chelate, laid out from its SMILES", () => {
  it("has its four bonds a right angle apart: the chelate's two ends side by side, its other two ligands on the two right angles left - Pt(en)Cl2, Pt(bpy)Cl2", { timeout: 120000 }, async () => {
    forgetLaidOut();
    for (const smiles of ["Cl[Pt]12Cl.N1CCN2", "Cl[Pt]12Cl.c3ccn1c(c3)-c4ccccn42"]) {
      const laid = await laidOut(drawnFromSmiles(smiles), MENO, undefined, undefined, true);
      const pt = laid.atoms.find((a) => a.el === "Pt")!;
      const round = laid.bonds
        .filter((b) => b.a === pt.id || b.b === pt.id)
        .map((b) => laid.atoms.find((a) => a.id === (b.a === pt.id ? b.b : b.a))!)
        .map((o) => ({ el: o.el, t: Math.atan2(o.y - pt.y, o.x - pt.x) }))
        .sort((p, q) => p.t - q.t);
      // (each next a right angle on, all round; the two Cl side by side, as are the two N)
      round.forEach((o, k) => {
        const next = round[(k + 1) % 4];
        const gap = (((next.t - o.t) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        expect(Math.abs(gap - Math.PI / 2), smiles).toBeLessThan(0.02);
      });
      const els = round.map((o) => o.el).join(",");
      expect(["Cl,Cl,N,N", "N,Cl,Cl,N", "N,N,Cl,Cl", "Cl,N,N,Cl"], smiles).toContain(els);
    }
  });
});

describe("a six-bond metal with a tridentate", () => {
  it("is laid out on three lines where it can be - fac-Co(tacn)Cl3, Co(dien)Cl3 - and refused, saying so, where it cannot yet: Ru(terpy)Cl3", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const ways = (m: Model) => {
      const c = m.atoms.find((a) => a.el === "Co")!;
      return m.bonds
        .filter((b) => b.a === c.id || b.b === c.id)
        .map((b) => m.atoms.find((a) => a.id === (b.a === c.id ? b.b : b.a))!)
        .map((o) => (Math.round((Math.atan2(o.y - c.y, o.x - c.x) * 180) / Math.PI) + 360) % 360)
        .sort((p, q) => p - q);
    };
    for (const smiles of ["Cl[Co]123(Cl)Cl.N14CCN2CCN3CC4", "Cl[Co]123(Cl)Cl.N1CCN2CCN3"]) {
      expect(ways(await laidOut(drawnFromSmiles(smiles), MENO, undefined, undefined, true)), smiles).toEqual([30, 90, 150, 210, 270, 330]);
    }
    await expect((async () => laidOut(drawnFromSmiles("Cl[Ru]123(Cl)Cl.c4ccc(n1c4)-c5cccc(n25)-c6ccccn63"), MENO, undefined, undefined, true))()).rejects.toThrow(/tridentate could not be laid out as three lines/);
  });

  it("is kept by Clean-up meridional where drawn meridional and facial where drawn facial, never the one made the other - and refused where two of its joined donors are drawn across: Co(dien)Cl3", { timeout: 180000 }, async () => {
    forgetLaidOut();
    // (dien's two ends - each N with one C - across each other: meridional; not: facial. Read by the angles round the Co)
    const mer = (m: Model) => {
      const c = m.atoms.find((a) => a.el === "Co")!;
      const ends = m.bonds
        .filter((b) => b.a === c.id || b.b === c.id)
        .map((b) => m.atoms.find((a) => a.id === (b.a === c.id ? b.b : b.a))!)
        .filter((o) => o.el === "N" && m.bonds.filter((b) => (b.a === o.id || b.b === o.id) && b.a !== c.id && b.b !== c.id).length === 1);
      expect(ends).toHaveLength(2);
      const [p, q] = ends.map((o) => Math.atan2(o.y - c.y, o.x - c.x));
      return Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q))) > (150 * Math.PI) / 180;
    };
    const laid = await laidOut(drawnFromSmiles("Cl[Co]123(Cl)Cl.N1CCN2CCN3"), MENO, undefined, undefined, true);
    const co = laid.atoms.find((a) => a.el === "Co")!;
    const round = laid.bonds.filter((b) => b.a === co.id || b.b === co.id).map((b) => laid.atoms.find((a) => a.id === (b.a === co.id ? b.b : b.a))!);
    const end = round.find((o) => o.el === "N" && laid.bonds.filter((b) => (b.a === o.id || b.b === o.id) && b.a !== co.id && b.b !== co.id).length === 1)!;
    // (the other isomer, drawn: one end of dien and a Cl changed places round the Co - each Cl tried, for a drawing of each kind twice)
    const drawings: Model[] = [laid];
    for (const cl of round.filter((o) => o.el === "Cl")) {
      drawings.push({ ...laid, atoms: laid.atoms.map((a) => (a.id === end.id ? { ...a, x: cl.x, y: cl.y } : a.id === cl.id ? { ...a, x: end.x, y: end.y } : a)) });
    }
    // (dien's middle N - the one with two C - drawn across one of its ends: two donors joined in one chelate, which cannot be across)
    const strained = (m: Model) => {
      const c = m.atoms.find((a) => a.el === "Co")!;
      const way = (o: { x: number; y: number }) => Math.atan2(o.y - c.y, o.x - c.x);
      const ns = m.bonds.filter((b) => b.a === c.id || b.b === c.id).map((b) => m.atoms.find((a) => a.id === (b.a === c.id ? b.b : b.a))!).filter((o) => o.el === "N");
      const others = (o: { id: number }) => m.bonds.filter((b) => (b.a === o.id || b.b === o.id) && b.a !== c.id && b.b !== c.id).length;
      const middle = ns.find((o) => others(o) === 2)!;
      return ns.some((o) => o !== middle && Math.abs(Math.atan2(Math.sin(way(o) - way(middle)), Math.cos(way(o) - way(middle)))) > (150 * Math.PI) / 180);
    };
    const kinds = drawings.map(mer);
    const can = drawings.map((d) => !strained(d));
    expect(kinds.filter((_, k) => can[k]), "both kinds drawn").toContain(true);
    expect(kinds.filter((_, k) => can[k]), "both kinds drawn").toContain(false);
    for (const [k, drawn] of drawings.entries()) {
      forgetLaidOut();
      if (!can[k]) {
        await expect(laidOut(drawn, MENO), `drawing ${k}, a chelate's two donors across`).rejects.toThrow(/opposite each other as drawn/);
        continue;
      }
      const out = await laidOut(drawn, MENO);
      expect(mer(out), `drawing ${k}, ${kinds[k] ? "meridional" : "facial"}`).toBe(kinds[k]);
    }
  });
});
