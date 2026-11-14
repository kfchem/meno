import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { laidOut } from "./cleanUp";
import { MENO } from "../../../../lib/chem/style";
import { forgetLaidOut, type Layout2D, type LayoutInput } from "../../../../lib/layout/engine";
import { oppositesKept } from "./engineLayout";
import { drawingOf } from "./drawing";
import { readStereo, sameConfiguration } from "../../../../lib/layout/drawn";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

// Clean-up keeps a four-bond metal's donors opposite each other as they were drawn: transplatin cleaned up is transplatin, not
// cisplatin - a different compound - whatever order its atoms were drawn in, as an X or upright (chem/engineLayout `oppositesKept`).

type Donor = { name: string; el: string; valence?: number; ring?: true };
const Cl: Donor = { name: "Cl", el: "Cl" };
const Br: Donor = { name: "Br", el: "Br" };
const I: Donor = { name: "I", el: "I" };
const NH3: Donor = { name: "NH3", el: "N", valence: 4 };
const py: Donor = { name: "py", el: "N", ring: true };

/**
 * A metal with `donors` drawn round it, the k-th at `turn` + 90k degrees, a little askew as by hand; a pyridine's ring drawn
 * outward from its N. The donors' atoms written in `order` (a permutation of 0..3).
 */
function drawn(metal: { el: string; charge?: number }, donors: readonly Donor[], turn: number, order = [0, 1, 2, 3]): Model {
  const atoms: Model["atoms"] = [{ id: 1, x: 0, y: 0, r: 0.9, el: metal.el, ...(metal.charge ? { charge: metal.charge } : {}) }] as Model["atoms"];
  const bonds: Model["bonds"] = [];
  let id = 2;
  for (const k of order) {
    const d = donors[k];
    const t = ((turn + 90 * k + 4) * Math.PI) / 180;
    const at = (r: number, off = 0) => ({ x: r * Math.cos(t + off), y: r * Math.sin(t + off) });
    const n = id++;
    atoms.push({ id: n, ...at(1.5), r: 0.9, el: d.el, ...(d.valence ? { valence: d.valence } : {}) } as Model["atoms"][number]);
    bonds.push({ id: 100 + n, a: 1, b: n, order: 1, stereo: "none" } as Model["bonds"][number]);
    if (d.ring) {
      // (the ring's other five atoms, a hexagon of side 1.5 outward from the N)
      const c = { x: 3 * Math.cos(t), y: 3 * Math.sin(t) };
      const ring = [n];
      for (let j = 1; j < 6; j++) {
        const a = t + Math.PI + (j * Math.PI) / 3;
        const r = id++;
        atoms.push({ id: r, x: c.x + 1.5 * Math.cos(a), y: c.y + 1.5 * Math.sin(a), r: 0.9, el: "C" } as Model["atoms"][number]);
        ring.push(r);
      }
      ring.forEach((a, j) => bonds.push({ id: 200 + a, a, b: ring[(j + 1) % 6], order: j % 2 ? 1 : 2, stereo: "none" } as Model["bonds"][number]));
    }
  }
  return { atoms, bonds } as Model;
}

/** Which donors stand opposite which round the metal (id 1), by name: each pair sorted, the pairs sorted. */
function opposites(model: Model, donors: readonly Donor[], order = [0, 1, 2, 3]): string[] {
  const m = model.atoms.find((a) => a.id === 1)!;
  const bound = model.bonds.filter((b) => b.a === 1 || b.b === 1).map((b) => (b.a === 1 ? b.b : b.a));
  // (the donors' ids in the order written)
  const nameOf = new Map(bound.sort((p, q) => p - q).map((id, i) => [id, donors[order[i]].name]));
  const angle = (id: number) => {
    const a = model.atoms.find((x) => x.id === id)!;
    return Math.atan2(a.y - m.y, a.x - m.x);
  };
  const off = (p: number, q: number) => Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(angle(p) - angle(q)), Math.cos(angle(p) - angle(q)))));
  const [a, ...rest] = [...nameOf.keys()];
  const across = rest.reduce((best, d) => (off(a, d) < off(a, best) ? d : best), rest[0]);
  const [p, q] = rest.filter((d) => d !== across);
  return [[a, across], [p, q]].map((pair) => pair.map((d) => nameOf.get(d)!).sort().join("-")).sort();
}

describe("a four-bond metal cleaned up", () => {
  it("keeps its donors opposite each other as drawn: transplatin stays trans, cisplatin cis - as an X or upright, its atoms in any order", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const trans = [Cl, NH3, Cl, NH3];
    const cis = [Cl, Cl, NH3, NH3];
    for (const [donors, want] of [
      [trans, ["Cl-Cl", "NH3-NH3"]],
      [cis, ["Cl-NH3", "Cl-NH3"]],
    ] as const) {
      for (const turn of [45, 0]) {
        for (const order of [
          [0, 1, 2, 3],
          [0, 2, 1, 3],
          [3, 1, 0, 2],
        ]) {
          const out = await laidOut(drawn({ el: "Pt" }, donors, turn, order), MENO);
          expect(opposites(out, donors, order), `${want} drawn at ${turn}, written ${order}`).toEqual(want);
        }
      }
    }
  });

  it("keeps transplatin drawn bent, its N-Pt-N at 145 degrees, trans", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const m = drawn({ el: "Pt" }, [Cl, NH3, Cl, NH3], 45);
    // (the second NH3 moved round from 315 to 280 degrees: N-Pt-N 145, Cl-Pt-Cl still 180)
    const n2 = m.atoms[4];
    const t = ((280 + 4) * Math.PI) / 180;
    m.atoms[4] = { ...n2, x: 1.5 * Math.cos(t), y: 1.5 * Math.sin(t) };
    expect(opposites(await laidOut(m, MENO), [Cl, NH3, Cl, NH3])).toEqual(["Cl-Cl", "NH3-NH3"]);
  });

  it("keeps it for trans- and cis-PtCl2Br2 2-, trans-PdCl2I2 2-; PtBrCl(NH3)(py) drawn as the X, which the layout would make a cross, is refused and left as drawn", { timeout: 120000 }, async () => {
    forgetLaidOut();
    for (const [metal, donors, want] of [
      [{ el: "Pt", charge: -2 }, [Cl, Br, Cl, Br], ["Br-Br", "Cl-Cl"]],
      [{ el: "Pt", charge: -2 }, [Cl, Cl, Br, Br], ["Br-Cl", "Br-Cl"]],
      [{ el: "Pd", charge: -2 }, [Cl, I, Cl, I], ["Cl-Cl", "I-I"]],
    ] as const) {
      const out = await laidOut(drawn(metal, donors, 45), MENO);
      expect(opposites(out, donors), want.join(", ")).toEqual(want);
    }
    // (its pyridine goes on, so the layout grows the cross; the X it was drawn as is kept by refusing - laid out as the X: backlog 118)
    for (const donors of [[Br, NH3, Cl, py], [Br, Cl, NH3, py], [Br, Cl, py, NH3]] as const) {
      await expect(laidOut(drawn({ el: "Pt" }, donors, 45), MENO)).rejects.toThrow(/Pt drawn as an X could not be laid out as one/);
    }
  });

  it("is left as laid out where the drawing does not say which stand opposite, refused where a chelate's donors are drawn opposite each other - and kept where it is bent", () => {
    // (a metal and four Cl, laid out cis-wise as an X: 1 and 2 side by side)
    const at = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
    const laid = (pts: { x: number; y: number }[]): Layout2D =>
      ({ x: pts.map((p) => p.x), y: pts.map((p) => p.y), depth: pts.map(() => null), solid: pts.map(() => false), bold: [], toward: [], dashed: [], wedges: [], hydrogens: [] }) as Layout2D;
    const cisLaid = laid([{ x: 0, y: 0 }, at(45), at(135), at(225), at(315)]);
    const input = (chelate: boolean): LayoutInput => ({
      atoms: [{ el: "Pt" }, { el: "N" }, { el: "N" }, { el: "Cl" }, { el: "Cl" }],
      bonds: [[0, 1], [0, 2], [0, 3], [0, 4], ...(chelate ? [[1, 2]] : [])].map(([a, b]) => ({ a, b, order: 1 })),
    });
    // (drawn trans: N opposite N - changed where plain and no chelate)
    const trans = [{ x: 0, y: 0 }, at(0), at(180), at(90), at(270)];
    expect(oppositesKept(trans, input(false), cisLaid)).not.toBe(cisLaid);
    // (a chelate's two N drawn opposite each other: no move puts them so - refused, never another isomer)
    expect(() => oppositesKept(trans, input(true), cisLaid)).toThrow(/opposite each other as drawn/);
    // (drawn bent - the N at 0 and 140, the Cl at 50 and 230: still N opposite N, the pairing nearest two lines)
    expect(oppositesKept([{ x: 0, y: 0 }, at(0), at(140), at(50), at(230)], input(false), cisLaid)).not.toBe(cisLaid);
    // (drawn bunched - the four at 0, 10, 20 and 30: every pairing as far from straight, pair by pair; it does not say, and the layout's stands)
    expect(oppositesKept([{ x: 0, y: 0 }, at(0), at(10), at(20), at(30)], input(false), cisLaid)).toBe(cisLaid);
  });

  it("swaps two donors whole, each turned about the metal, its bonds still at right angles and its H with it", () => {
    const at = (deg: number, r = 1) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
    // (Pt; N1, N2 side by side at 45 and 135 as laid out, each with a C beyond it; Cl at 225 and 315; an H drawn on the C of N2)
    const pts = [{ x: 0, y: 0 }, at(45), at(135), at(225), at(315), at(45, 2), at(135, 2)];
    const laid = { x: pts.map((p) => p.x), y: pts.map((p) => p.y), depth: pts.map(() => null), solid: pts.map(() => false), bold: [], toward: [], dashed: [], wedges: [], hydrogens: [{ on: 6, at: at(135, 3) }] } as unknown as Layout2D;
    const input: LayoutInput = {
      atoms: [{ el: "Pt" }, { el: "N" }, { el: "N" }, { el: "Cl" }, { el: "Cl" }, { el: "C" }, { el: "C" }],
      bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 6]].map(([a, b]) => ({ a, b, order: 1 })),
    };
    const was = [{ x: 0, y: 0 }, at(0), at(180), at(90), at(270), at(0, 2), at(180, 2)];
    const out = oppositesKept(was, input, laid);
    const deg = (i: number) => Math.round((Math.atan2(out.y[i], out.x[i]) * 180) / Math.PI);
    // (N1 opposite N2 now, each with its C beyond it, the four bonds still 90 degrees apart)
    expect((deg(1) - deg(2) + 720) % 360).toBe(180);
    expect([1, 2].map((i) => deg(i))).toEqual([5, 6].map((i) => deg(i)));
    const all = [1, 2, 3, 4].map(deg).map((d) => (d + 360) % 360).sort((p, q) => p - q);
    expect(all.map((d, i) => (i ? d - all[i - 1] : 0)).slice(1)).toEqual([90, 90, 90]);
    // (the H on N2's C turned with it)
    expect(Math.round((Math.atan2(out.hydrogens[0].at.y, out.hydrogens[0].at.x) * 180) / Math.PI)).toBe(deg(6));
  });

  it("keeps it for a chelate's donors and for six spokes: trans- and cis-Pt(gly)2, both Pt(gly)(NH3)Cl, trans- and cis-[CoCl2(NH3)4]+, trans-[PtCl2(NH3)4]2+", { timeout: 180000 }, async () => {
    forgetLaidOut();
    for (const [name, model, want] of [
      ["trans-Pt(gly)2", complex("Pt", 0, [gly("a"), gly("b")], [0, 1, 2, 3], ["Na", "Oa", "Nb", "Ob"]), ["Na-Nb", "Oa-Ob"]],
      ["cis-Pt(gly)2", complex("Pt", 0, [gly("a"), gly("b")], [0, 1, 2, 3], ["Na", "Oa", "Ob", "Nb"]), ["Na-Ob", "Nb-Oa"]],
      ["Pt(gly)(NH3)Cl, Cl opposite N", complex("Pt", 0, [gly("a"), "Cl", "NH3"], [0, 1, 2, 3], ["Na", "Oa", "Cl", "NH3"]), ["Cl-Na", "NH3-Oa"]],
      ["Pt(gly)(NH3)Cl, Cl opposite O", complex("Pt", 0, [gly("a"), "Cl", "NH3"], [0, 1, 2, 3], ["Na", "Oa", "NH3", "Cl"]), ["Cl-Oa", "NH3-Na"]],
      ["trans-[CoCl2(NH3)4]+", complex("Co", 1, ["Cl", "Cl", "NH3", "NH3", "NH3", "NH3"], [0, 1, 2, 3, 4, 5], ["Cl", "NH3", "NH3", "Cl", "NH3", "NH3"]), ["Cl-Cl", "NH3-NH3", "NH3-NH3"]],
      ["cis-[CoCl2(NH3)4]+", complex("Co", 1, ["Cl", "Cl", "NH3", "NH3", "NH3", "NH3"], [0, 1, 2, 3, 4, 5], ["Cl", "Cl", "NH3", "NH3", "NH3", "NH3"]), ["Cl-NH3", "Cl-NH3", "NH3-NH3"]],
      ["trans-[PtCl2(NH3)4]2+", complex("Pt", 2, ["Cl", "Cl", "NH3", "NH3", "NH3", "NH3"], [0, 1, 2, 3, 4, 5], ["Cl", "NH3", "NH3", "Cl", "NH3", "NH3"]), ["Cl-Cl", "NH3-NH3", "NH3-NH3"]],
    ] as const) {
      const out = await laidOut(model.model, MENO);
      expect(spokes(out, model.names), name).toEqual(want);
    }
  });

  it("keeps a chelate's centres as they were when it is mirrored: trans- and cis-Pt(L-ala)2", { timeout: 120000 }, async () => {
    forgetLaidOut();
    for (const [order, want] of [
      [["Na", "Oa", "Nb", "Ob"], ["Na-Nb", "Oa-Ob"]],
      [["Na", "Oa", "Ob", "Nb"], ["Na-Ob", "Nb-Oa"]],
    ] as const) {
      const { model, names } = complex("Pt", 0, [ala("a"), ala("b")], [0, 1, 2, 3], order);
      const before = configurations(model);
      expect(before.size).toBe(2);
      const out = await laidOut(model, MENO);
      expect(spokes(out, names), want.join(", ")).toEqual(want);
      const after = configurations(out);
      for (const [c, t] of before) expect(sameConfiguration(after.get(c)!, t), `${want.join(", ")}: centre ${c}`).toBe(true);
    }
  });
});

describe("oppositesKept, left as laid out", () => {
  const at = (deg: number, r = 1) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const laidAt = (pts: { x: number; y: number }[], depth: (number | null)[] = pts.map(() => null)): Layout2D =>
    ({ x: pts.map((p) => p.x), y: pts.map((p) => p.y), depth, solid: pts.map(() => false), bold: [], toward: [], dashed: [], wedges: [], hydrogens: [] }) as Layout2D;
  // (a centre and four donors: two N and two Cl, the N side by side as laid out)
  const cis = [{ x: 0, y: 0 }, at(45), at(135), at(225), at(315)];
  const trans = [{ x: 0, y: 0 }, at(0), at(180), at(90), at(270)];
  const four = (el: string, extra: { el: string }[] = []): LayoutInput => ({
    atoms: [{ el }, { el: "N" }, { el: "N" }, { el: "Cl" }, { el: "Cl" }, ...extra],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4], ...extra.map((_, k) => [0, 5 + k])].map(([a, b]) => ({ a, b, order: 1 })),
  });

  it("at no metal: a carbon with four bonds drawn otherwise is the engine's", () => {
    const laid = laidAt(cis);
    expect(oppositesKept(trans, four("C"), laid)).toBe(laid);
  });

  it("refuses where the layout's own pairing is not plain - laid out bunched - rather than guess which to move", () => {
    const laid = laidAt([{ x: 0, y: 0 }, at(0), at(10), at(20), at(30)]);
    expect(() => oppositesKept(trans, four("Pt"), laid)).toThrow(/opposite each other as drawn/);
  });

  it("at a metal drawn in perspective", () => {
    const laid = laidAt(cis, [0.5, null, null, null, null]);
    expect(oppositesKept(trans, four("Pt"), laid)).toBe(laid);
  });

  it("where a donor is a star of a ring bound face-on, past the drawing's own atoms", () => {
    const laid = laidAt(cis);
    expect(oppositesKept(trans.slice(0, 4), four("Pt"), laid)).toBe(laid);
  });

  it("at a metal with five bonds", () => {
    const laid = laidAt([...cis, at(0, 1.5)]);
    expect(oppositesKept([...trans, at(45, 1.5)], four("Pt", [{ el: "F" }]), laid)).toBe(laid);
  });

  it("where a donor was drawn on the metal itself", () => {
    const laid = laidAt(cis);
    expect(oppositesKept([{ x: 0, y: 0 }, { x: 0, y: 0 }, at(180), at(90), at(270)], four("Pt"), laid)).toBe(laid);
  });

  it("takes the pairing whose straightest pair is straightest by more than 20 degrees, and leaves the layout's where the straightest pairs of two are about as straight", () => {
    const laid = laidAt(cis);
    // (N at 0 and 100, Cl at 30 and 192.5: N with the Cl at 192.5 is 12.5 off a line, Cl with Cl 17.5 - two pairings' straightest pairs
    // 5 apart: it does not say, as laid out. With the Cl at 215: Cl with Cl 5 off, the next pairing's straightest 35 - N put opposite N)
    expect(oppositesKept([{ x: 0, y: 0 }, at(0), at(100), at(30), at(192.5)], four("Pt"), laid)).toBe(laid);
    const out = oppositesKept([{ x: 0, y: 0 }, at(0), at(100), at(30), at(215)], four("Pt"), laid);
    const deg = (i: number) => Math.round((Math.atan2(out.y[i], out.x[i]) * 180) / Math.PI);
    expect((deg(1) - deg(2) + 720) % 360).toBe(180);
  });
});

describe("oppositesKept, its parts", () => {
  const at = (deg: number, r = 1) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const laidAt = (pts: { x: number; y: number }[], extra: Partial<Layout2D> = {}): Layout2D =>
    ({ x: pts.map((p) => p.x), y: pts.map((p) => p.y), depth: pts.map(() => null), solid: pts.map(() => false), bold: [], toward: [], dashed: [], wedges: [], hydrogens: [], ...extra }) as Layout2D;
  const bonds = (pairs: number[][]) => pairs.map(([a, b]) => ({ a, b, order: 1 }));
  const deg = (o: Layout2D, i: number, about = 0) => Math.round((Math.atan2(o.y[i] - o.y[about], o.x[i] - o.x[about]) * 180) / Math.PI);

  // (a Pt with two Cl, 1 and 2, and a glycinate-like chelate: N 3 and O 4 joined through C 5 and C 6. Laid out with Cl 1 opposite N; drawn
  // with Cl 1 opposite O - the chelate's two donors to change places, the chelate mirrored)
  const chelate: LayoutInput = {
    atoms: [{ el: "Pt" }, { el: "Cl" }, { el: "Cl" }, { el: "N" }, { el: "O" }, { el: "C" }, { el: "C" }],
    bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4], [3, 5], [5, 6], [6, 4]]),
  };
  const chelateLaid = [{ x: 0, y: 0 }, at(180), at(270), at(0), at(90), at(20, 2), at(70, 2)];
  const chelateDrawn = [{ x: 0, y: 0 }, at(180), at(270), at(90), at(0), at(70, 2), at(20, 2)];

  it("mirrors a chelate's placed H with it", () => {
    const laid = laidAt(chelateLaid, { hydrogens: [{ on: 5, at: at(10, 2.6) }] });
    const out = oppositesKept(chelateDrawn, chelate, laid);
    expect(out).not.toBe(laid);
    // (N and O changed places: N now at 90, O at 0; the H on N's ring C still as far from it, mirrored with it across 45 degrees)
    expect([deg(out, 3), deg(out, 4)]).toEqual([90, 0]);
    const h = out.hydrogens[0].at;
    expect(Math.hypot(h.x - out.x[5], h.y - out.y[5])).toBeCloseTo(Math.hypot(at(10, 2.6).x - chelateLaid[5].x, at(10, 2.6).y - chelateLaid[5].y), 6);
    expect(Math.round((Math.atan2(h.y, h.x) * 180) / Math.PI)).toBe(80);
  });

  it("does not mirror a chelate drawn in perspective - it would show its other face - but turns the single donors instead", () => {
    const laid = laidAt(chelateLaid, { depth: [null, null, null, null, null, 0.3, 0.1] });
    const out = oppositesKept(chelateDrawn, chelate, laid);
    // (the chelate where it was laid, N at 0 and O at 90; the two Cl changed places: Cl 1 opposite O, as drawn)
    expect([deg(out, 3), deg(out, 4)]).toEqual([0, 90]);
    expect((deg(out, 1) - deg(out, 4) + 720) % 360).toBe(180);
  });

  it("moves the fewest units, then turns them least: two chelates turned rather than a chelate and two single donors", () => {
    // (Co 0; chelates of donors 1, 2 (through C 7, 8) and 3, 4 (through C 9, 10); single donors Cl 5 and Br 6. Laid out round the metal
    // in that order, 60 degrees apart; drawn with 1 across 6, 2 across 4, 3 across 5)
    const input: LayoutInput = {
      atoms: [{ el: "Co" }, { el: "N" }, { el: "N" }, { el: "N" }, { el: "N" }, { el: "Cl" }, { el: "Br" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }],
      bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 7], [7, 8], [8, 2], [3, 9], [9, 10], [10, 4]]),
    };
    const laid = laidAt([{ x: 0, y: 0 }, at(1), at(61), at(121), at(181), at(241), at(301), at(11, 2), at(51, 2), at(131, 2), at(171, 2)]);
    const drawn = [{ x: 0, y: 0 }, at(0), at(60), at(120), at(240), at(300), at(180), at(10, 2), at(50, 2), at(150, 2), at(210, 2)];
    const out = oppositesKept(drawn, input, laid);
    // (each drawn pair across as laid out now)
    for (const [p, q] of [[1, 6], [2, 4], [3, 5]]) expect((deg(out, p) - deg(out, q) + 720) % 360, `${p}-${q}`).toBe(180);
    // (the two single donors where they were laid: only the two chelates moved, the fewest units - not three or four units moved shorter)
    expect([deg(out, 5), deg(out, 6)]).toEqual([deg(laid, 5), deg(laid, 6)]);
  });

  it("hands back the layout itself where it already keeps the drawing", () => {
    const four: LayoutInput = { atoms: [{ el: "Pt" }, { el: "N" }, { el: "N" }, { el: "Cl" }, { el: "Cl" }], bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4]]) };
    const laid = laidAt([{ x: 0, y: 0 }, at(0), at(180), at(90), at(270)]);
    expect(oppositesKept([{ x: 0, y: 0 }, at(10), at(185), at(95), at(280)], four, laid)).toBe(laid);
  });

  it("reads a pair drawn more than a right angle apart as across: six donors, the third pair 110 degrees apart, kept across", () => {
    const six: LayoutInput = {
      atoms: [{ el: "Co" }, { el: "Cl" }, { el: "Cl" }, { el: "N" }, { el: "N" }, { el: "N" }, { el: "N" }],
      bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]]),
    };
    const laid = laidAt([{ x: 0, y: 0 }, at(0), at(60), at(120), at(180), at(240), at(300)]);
    // (drawn: Cl across Cl and N 3 across N 4, straight; N 5 and N 6 110 degrees apart - across, not beside)
    const out = oppositesKept([{ x: 0, y: 0 }, at(0), at(180), at(90), at(270), at(135), at(245)], six, laid);
    for (const [p, q] of [[1, 2], [3, 4], [5, 6]]) expect((deg(out, p) - deg(out, q) + 720) % 360, `${p}-${q}`).toBe(180);
    // (laid out flat - two lines, N 5 and N 6 side by side - that pair is not kept across: the drawing is refused, not handed back so)
    const flat = laidAt([{ x: 0, y: 0 }, at(45), at(225), at(135), at(315), at(260), at(280)]);
    expect(() => oppositesKept([{ x: 0, y: 0 }, at(0), at(180), at(90), at(270), at(135), at(245)], six, flat)).toThrow(/opposite each other as drawn/);
  });

  it("counts a pair as across as laid out only within 30 degrees of a line: N 35 degrees off a line is not across", () => {
    const four: LayoutInput = { atoms: [{ el: "Pt" }, { el: "N" }, { el: "N" }, { el: "Cl" }, { el: "Cl" }], bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4]]) };
    // (laid out with one plain line, 90 to 270, and its other two places 35 degrees off one; drawn trans: N across N, Cl across Cl)
    const laid = laidAt([{ x: 0, y: 0 }, at(0), at(145), at(90), at(270)]);
    expect(() => oppositesKept([{ x: 0, y: 0 }, at(0), at(180), at(90), at(270)], four, laid)).toThrow(/opposite each other as drawn/);
  });

  it("reads two pairings whose straightest pairs are 15 degrees apart as not saying which stand opposite", () => {
    const four: LayoutInput = { atoms: [{ el: "Pt" }, { el: "N" }, { el: "N" }, { el: "Cl" }, { el: "Cl" }], bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4]]) };
    const laid = laidAt([{ x: 0, y: 0 }, at(45), at(135), at(225), at(315)]);
    // (N at 0 and 100, Cl at 30 and 187.5: N with the Cl at 187.5 7.5 off a line, Cl with Cl 22.5)
    expect(oppositesKept([{ x: 0, y: 0 }, at(0), at(100), at(30), at(187.5)], four, laid)).toBe(laid);
  });

  it("refuses where two donors of a chelate of three would have to change places", () => {
    // (N 1, O 2 and N 3 joined through C 5 and C 6: a tridentate; Cl 4)
    const tri: LayoutInput = {
      atoms: [{ el: "Pt" }, { el: "N" }, { el: "O" }, { el: "N" }, { el: "Cl" }, { el: "C" }, { el: "C" }],
      bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [5, 2], [2, 6], [6, 3]]),
    };
    const laid = laidAt([{ x: 0, y: 0 }, at(0), at(90), at(180), at(270), at(45, 2), at(135, 2)]);
    // (drawn with N 1 and O 2 changed places: N 1 opposite Cl 4's place)
    expect(() => oppositesKept([{ x: 0, y: 0 }, at(90), at(0), at(180), at(270), at(45, 2), at(135, 2)], tri, laid)).toThrow(/opposite each other as drawn/);
  });

  it("keeps the changes at the first of two metals where the second needs none", () => {
    // (Pt 0 with N 1, N 2, Cl 3, Cl 4, laid cis and drawn trans; Pd 5 with Cl 6, 7, 8 and the bridge to Pt through Cl 3? - no: its own four
    // Cl 6 to 9, laid and drawn alike)
    const two: LayoutInput = {
      atoms: [{ el: "Pt" }, { el: "N" }, { el: "N" }, { el: "Cl" }, { el: "Cl" }, { el: "Pd" }, { el: "Cl" }, { el: "Cl" }, { el: "Cl" }, { el: "Cl" }],
      bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4], [5, 6], [5, 7], [5, 8], [5, 9]]),
    };
    const off = (p: { x: number; y: number }) => ({ x: p.x + 10, y: p.y });
    const laid = laidAt([{ x: 0, y: 0 }, at(45), at(135), at(225), at(315), off({ x: 0, y: 0 }), off(at(0)), off(at(90)), off(at(180)), off(at(270))]);
    const drawn = [{ x: 0, y: 0 }, at(0), at(180), at(90), at(270), off({ x: 0, y: 0 }), off(at(0)), off(at(90)), off(at(180)), off(at(270))];
    const out = oppositesKept(drawn, two, laid);
    expect(out).not.toBe(laid);
    expect((deg(out, 1) - deg(out, 2) + 720) % 360).toBe(180);
  });

  it("turns a crowded single donor's group clear, its H with it, and leaves one 0.9 of a bond off", () => {
    // (Pt; Cl 1, Cl 2, P 3 with its group atom C 5 and an H on C 5, N 4 with its group atom C 6. Laid: Cl 1 at 0, Cl 2 at 180, P 3 at 90,
    // N 4 at 270. Drawn: Cl 1 at 0, Cl 2 at 90, P 3 at 180, N 4 at 270: P and Cl 2 change places, P's C 5 coming out at 180, two bonds off -
    // `near` of a bond from N's C 6)
    const input: LayoutInput = {
      atoms: [{ el: "Pt" }, { el: "Cl" }, { el: "Cl" }, { el: "P" }, { el: "N" }, { el: "C" }, { el: "C" }],
      bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4], [3, 5], [4, 6]]),
    };
    const c6 = (near: number) => ({ x: -2 + near * Math.cos((-60 * Math.PI) / 180), y: near * Math.sin((-60 * Math.PI) / 180) });
    const run = (near: number) => {
      const laid = laidAt([{ x: 0, y: 0 }, at(0), at(180), at(90), at(270), at(90, 2), c6(near)], { hydrogens: [{ on: 5, at: at(90, 3) }] });
      return oppositesKept([{ x: 0, y: 0 }, at(0), at(90), at(180), at(270), at(180, 2), c6(near)], input, laid);
    };
    const crowded = run(0.6);
    // (P at 180; its C 5 turned off 180 - its bond to P as it was - clear of C 6 by more than it was; the H on C 5 turned with it)
    expect(deg(crowded, 3)).toBe(180);
    expect(deg(crowded, 5)).not.toBe(180);
    expect(Math.hypot(crowded.x[5] - crowded.x[3], crowded.y[5] - crowded.y[3])).toBeCloseTo(1, 6);
    expect(Math.hypot(crowded.x[5] - crowded.x[6], crowded.y[5] - crowded.y[6])).toBeGreaterThan(0.6);
    const h = crowded.hydrogens[0].at;
    expect(Math.hypot(h.x - crowded.x[5], h.y - crowded.y[5])).toBeCloseTo(1, 6);
    // (0.9 of a bond off: clear enough, not turned)
    const clear = run(0.9);
    expect(deg(clear, 5)).toBe(180);
  });

  it("turns a crowded group as far as 60 degrees where nearer is not clear", () => {
    // (Pt; Cl 1, P 2 with its group atom C 5, and a chelate N 3 - O 4 through C 6 and C 7, its ring atoms put round P's circle 15 and 35
    // degrees either side of C 5 once the chelate is mirrored - a chelate is never turned, so P's group must go 60 degrees to clear them.
    // Laid: Cl 1 at 180, P 2 at 90, N 3 at 270, O 4 at 0; drawn with Cl opposite N: the chelate mirrored across 315 degrees)
    const input: LayoutInput = {
      atoms: [{ el: "Pt" }, { el: "Cl" }, { el: "P" }, { el: "N" }, { el: "O" }, { el: "C" }, { el: "C" }, { el: "C" }],
      bonds: bonds([[0, 1], [0, 2], [0, 3], [0, 4], [2, 5], [3, 6], [6, 7], [7, 4]]),
    };
    const p = at(90);
    const round = (a: number) => ({ x: p.x + Math.cos((a * Math.PI) / 180), y: p.y + Math.sin((a * Math.PI) / 180) });
    // (where the ring atoms must lie before the mirror across 315 degrees, to come out at P's 105 and 55)
    const across = (q: { x: number; y: number }) => {
      const [c, s2] = [Math.cos((630 * Math.PI) / 180), Math.sin((630 * Math.PI) / 180)];
      return { x: q.x * c + q.y * s2, y: q.x * s2 - q.y * c };
    };
    const laid = laidAt([{ x: 0, y: 0 }, at(180), p, at(270), at(0), at(90, 2), across(round(105)), across(round(55))]);
    const out = oppositesKept([{ x: 0, y: 0 }, at(180), p, at(0), at(270), at(90, 2), round(105), round(55)], input, laid);
    expect(out).not.toBe(laid);
    const off = (a: number) => Math.hypot(out.x[5] - out.x[a], out.y[5] - out.y[a]);
    expect(Math.min(off(6), off(7))).toBeGreaterThan(0.75);
  });

  it("never turns a chelate's atoms about one of its donors to clear it", () => {
    // (Pt; Cl 1, then a chelate N 3 - O 4 through C 5 and C 6, then P 2 with its group atom C 7 lying by the chelate's ring - so that the
    // chelate is the first unit looked at for room. Laid: N 3 at 0, O 4 at 270, Cl 1 at 180, P 2 at 90; drawn with Cl opposite O: the chelate
    // mirrored, its ring where it was, C 7 within 0.75 of a bond of it)
    const input: LayoutInput = {
      atoms: [{ el: "Pt" }, { el: "Cl" }, { el: "P" }, { el: "N" }, { el: "O" }, { el: "C" }, { el: "C" }, { el: "C" }],
      bonds: bonds([[0, 1], [0, 3], [0, 4], [0, 2], [3, 5], [5, 6], [6, 4], [2, 7]]),
    };
    const laid = laidAt([{ x: 0, y: 0 }, at(180), at(90), at(0), at(270), at(340, 2), at(290, 2), at(330, 2)]);
    const out = oppositesKept([{ x: 0, y: 0 }, at(180), at(90), at(270), at(0), at(290, 2), at(340, 2), at(330, 2)], input, laid);
    expect(out).not.toBe(laid);
    expect([deg(out, 3), Math.abs(deg(out, 4))]).toEqual([-90, 0]);
    // (the chelate's donors each a bond from the metal, and its ring's bonds as they were)
    for (const d of [3, 4]) expect(Math.hypot(out.x[d], out.y[d]), `donor ${d}`).toBeCloseTo(1, 6);
    const len = (o: { x: number[]; y: number[] }, a: number, b: number) => Math.hypot(o.x[a] - o.x[b], o.y[a] - o.y[b]);
    for (const [a, b] of [[3, 5], [5, 6], [6, 4]]) expect(len(out, a, b), `${a}-${b}`).toBeCloseTo(len(laid, a, b), 6);
  });

});

describe("a metal's donors kept opposite as drawn, or the drawing refused", () => {
  it("keeps cis-[Co(en)2Cl2]+ drawn with six spokes, laid out with its Cl side by side; refuses the trans - the layout has no two places across for its Cl", { timeout: 180000 }, async () => {
    forgetLaidOut();
    for (const names of [
      ["Cl", "Cl", "Na", "Oa", "Nb", "Ob"],
      ["Na", "Oa", "Cl", "Cl", "Nb", "Ob"],
    ]) {
      const m = complex("Co", 1, [en("a"), en("b"), "Cl", "Cl"], [0, 1, 2, 3, 4, 5], names);
      const out = await laidOut(m.model, MENO);
      // (its four N two lines through the metal, its two Cl across nothing: side by side, the picture of the cis)
      expect(lines(out, m.names).map((p) => p.replace(/[NO][ab]/g, "N")), names.join(" ")).toEqual(["N-N", "N-N"]);
    }
    for (const names of [
      ["Cl", "Na", "Oa", "Cl", "Nb", "Ob"],
      ["Na", "Oa", "Cl", "Nb", "Ob", "Cl"],
    ]) {
      const m = complex("Co", 1, [en("a"), en("b"), "Cl", "Cl"], [0, 1, 2, 3, 4, 5], names);
      await expect(laidOut(m.model, MENO), names.join(" ")).rejects.toThrow(/opposite each other as drawn/);
    }
  });

  it("keeps cis-[Co(en)2Cl2]+ drawn as it is laid out - its N an X, its Cl side by side", { timeout: 180000 }, async () => {
    forgetLaidOut();
    const m = complex("Co", 1, [en("a"), en("b"), "Cl", "Cl"], [0, 1, 2, 3, 4, 5], ["Na", "Oa", "Nb", "Ob", "Cl", "Cl"], [45, 135, 225, 315, 260, 280]);
    const out = await laidOut(m.model, MENO);
    expect(lines(out, m.names).map((p) => p.replace(/[NO][ab]/g, "N"))).toEqual(["N-N", "N-N"]);
  });

  it("never puts across two donors drawn side by side: a cis-[CoCl2(NH3)4]+ drawn with its NH3 an X and its Cl side by side is not handed back trans", { timeout: 180000 }, async () => {
    forgetLaidOut();
    const m = complex("Co", 1, ["Cl", "Cl", "NH3", "NH3", "NH3", "NH3"], [0, 1, 2, 3, 4, 5], ["NH3", "NH3", "NH3", "NH3", "Cl", "Cl"], [45, 135, 225, 315, 260, 280]);
    const out = await laidOut(m.model, MENO).catch(() => null);
    if (out) expect(lines(out, m.names)).not.toContain("Cl-Cl");
  });

  it("keeps a cis-M(gly)2Cl2 drawn with six spokes only where its picture says it - one N across an O - and refuses N across N, O across O and the trans", { timeout: 180000 }, async () => {
    forgetLaidOut();
    // (Cl at 0 and 60: the chelate ends at 120 and 300 are across each other, those at 180 and 240 across a Cl)
    const nAcrossO = complex("Co", 1, [gly("a"), gly("b"), "Cl", "Cl"], [0, 1, 2, 3, 4, 5], ["Cl", "Cl", "Na", "Oa", "Nb", "Ob"]);
    const out = await laidOut(nAcrossO.model, MENO);
    expect(lines(out, nAcrossO.names)).toEqual(["Na-Ob", "Nb-Oa"]);
    for (const [isomer, names] of [
      ["N across N", ["Cl", "Cl", "Na", "Oa", "Ob", "Nb"]],
      ["O across O", ["Cl", "Cl", "Oa", "Na", "Nb", "Ob"]],
      ["trans", ["Cl", "Na", "Oa", "Cl", "Nb", "Ob"]],
    ] as const) {
      const m = complex("Co", 1, [gly("a"), gly("b"), "Cl", "Cl"], [0, 1, 2, 3, 4, 5], names);
      await expect(laidOut(m.model, MENO), isomer).rejects.toThrow(/opposite each other as drawn/);
    }
  });

  it("refuses a cis-M(gly)2XY drawn with six spokes whose picture could not say which of its two others is across which chelate end: Cl and Br; NH3 and MeNH2", { timeout: 180000 }, async () => {
    forgetLaidOut();
    // (N across O between the chelates, as kept for two Cl; the two others different: which stands across the N and which across the O
    // is the isomer, and two lines and two side by side cannot show it)
    for (const [x, y] of [["Cl", "Br"], ["NH3", "MeNH2"]]) {
      const m = complex("Co", 1, [gly("a"), gly("b"), x, y], [0, 1, 2, 3, 4, 5], [x, y, "Na", "Oa", "Nb", "Ob"]);
      await expect(laidOut(m.model, MENO), `${x} ${y}`).rejects.toThrow(/opposite each other as drawn/);
    }
  });

  it("keeps a cis-M(gly)2Cl2 drawn as it is laid out with the lines through the metal it was drawn with - N to N and O to O, or N to O - never the other", { timeout: 180000 }, async () => {
    forgetLaidOut();
    for (const [names, want] of [
      [["Na", "Oa", "Nb", "Ob", "Cl", "Cl"], ["Na-Nb", "Oa-Ob"]],
      [["Na", "Oa", "Ob", "Nb", "Cl", "Cl"], ["Na-Ob", "Nb-Oa"]],
    ] as const) {
      const m = complex("Co", 1, [gly("a"), gly("b"), "Cl", "Cl"], [0, 1, 2, 3, 4, 5], names, [45, 135, 225, 315, 260, 280]);
      expect(lines(await laidOut(m.model, MENO), m.names), names.join(" ")).toEqual(want);
    }
  });

  it("puts opposite the two drawn straightest across, the other two beside them on one side: Br 0, Cl 180, N 250, O 290 - and Br 0, N 60, O 120, Cl 185", () => {
    const at = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
    const input: LayoutInput = { atoms: [{ el: "Pt" }, { el: "Br" }, { el: "Cl" }, { el: "N" }, { el: "O" }], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]].map(([a, b]) => ({ a, b, order: 1 })) };
    // (laid out with Br opposite N)
    const pts = [{ x: 0, y: 0 }, at(45), at(135), at(225), at(315)];
    const laid = { x: pts.map((p) => p.x), y: pts.map((p) => p.y), depth: pts.map(() => null), solid: pts.map(() => false), bold: [], toward: [], dashed: [], wedges: [], hydrogens: [] } as unknown as Layout2D;
    for (const drawn of [
      [{ x: 0, y: 0 }, at(0), at(180), at(250), at(290)],
      [{ x: 0, y: 0 }, at(0), at(185), at(60), at(120)],
    ]) {
      const out = oppositesKept(drawn, input, laid);
      const deg = (i: number) => Math.round((Math.atan2(out.y[i], out.x[i]) * 180) / Math.PI);
      expect((deg(1) - deg(2) + 720) % 360).toBe(180);
    }
  });
});

describe("a metal with bulky donors put side by side as drawn", () => {
  it("keeps cis-PtCl2(PCy3)2 and cis-PdCl2(PPh3)2 cis, the phosphines' groups turned clear of each other - or, where they cannot be, leaves the drawing as it is: never the trans", { timeout: 180000 }, async () => {
    forgetLaidOut();
    for (const [el, L, clears] of [
      ["Pt", "P(C1CCCCC1)(C1CCCCC1)C1CCCCC1", true],
      // (two PPh3 side by side: their rings cannot be turned clear of each other here - Clean-up then lays nothing out, saying so)
      ["Pd", "P(c1ccccc1)(c1ccccc1)c1ccccc1", false],
    ] as const) {
      // (the engine's own drawing, P opposite P, made cis by hand: a Cl and a P turned into each other's places)
      const m = drawnFromSmiles(`Cl[${el}](Cl)(${L})${L}`);
      const metal = m.atoms.find((a) => a.el === el)!;
      const units = donorUnits(m, metal.id);
      const donorOf = (u: Set<number>) => m.atoms.find((a) => u.has(a.id) && m.bonds.some((b) => (b.a === a.id && b.b === metal.id) || (b.b === a.id && b.a === metal.id)))!;
      const angle = (a: { x: number; y: number }) => Math.atan2(a.y - metal.y, a.x - metal.x);
      const cl = units.find((u) => donorOf(u).el === "Cl")!;
      const p = units.find((u) => donorOf(u).el === "P")!;
      const t = angle(donorOf(p)) - angle(donorOf(cl));
      const turned = (a: { x: number; y: number }, r: number) => ({
        x: metal.x + (a.x - metal.x) * Math.cos(r) - (a.y - metal.y) * Math.sin(r),
        y: metal.y + (a.x - metal.x) * Math.sin(r) + (a.y - metal.y) * Math.cos(r),
      });
      const drawn: Model = { ...m, atoms: m.atoms.map((a) => (cl.has(a.id) ? { ...a, ...turned(a, t) } : p.has(a.id) ? { ...a, ...turned(a, -t) } : a)) };
      const names = new Map(units.map((u) => [donorOf(u).id, donorOf(u).el]));
      expect(spokes(drawn, names, metal.id), `${el} as drawn`).toEqual(["Cl-P", "Cl-P"]);
      if (!clears) {
        await expect(laidOut(drawn, MENO), el).rejects.toThrow(/one atom on another/);
        continue;
      }
      const out = await laidOut(drawn, MENO);
      expect(spokes(out, names, metal.id), el).toEqual(["Cl-P", "Cl-P"]);
      // (no two atoms of different donors within half a bond of each other)
      const at = new Map(out.atoms.map((a) => [a.id, a]));
      const after = donorUnits(out, metal.id);
      let closest = Infinity;
      after.forEach((u, i) =>
        after.slice(i + 1).forEach((v) => {
          for (const a of u) for (const b of v) closest = Math.min(closest, Math.hypot(at.get(a)!.x - at.get(b)!.x, at.get(a)!.y - at.get(b)!.y) / NOMINAL_BOND_LENGTH);
        }),
      );
      expect(closest, el).toBeGreaterThan(0.5);
    }
  });
});

/** The atoms each of the metal's donors carries, reached not through the metal, by id. */
function donorUnits(m: Model, metal: number): Set<number>[] {
  const near = new Map<number, number[]>();
  for (const b of m.bonds) {
    near.set(b.a, [...(near.get(b.a) ?? []), b.b]);
    near.set(b.b, [...(near.get(b.b) ?? []), b.a]);
  }
  return (near.get(metal) ?? []).map((d) => {
    const seen = new Set([d]);
    for (const todo = [d]; todo.length; ) {
      for (const v of near.get(todo.pop()!) ?? []) {
        if (v === metal || seen.has(v)) continue;
        seen.add(v);
        todo.push(v);
      }
    }
    return seen;
  });
}

type Chelate = { tag: string; methyl?: true; en?: true };
const gly = (tag: string): Chelate => ({ tag });
const ala = (tag: string): Chelate => ({ tag, methyl: true });
// (an ethylenediamine: its second donor an N - named O<tag> by its place - its ring N-C-C-N, no C=O)
const en = (tag: string): Chelate => ({ tag, en: true });

/**
 * A metal with its donors drawn round it as spokes, `slots[k]` the k-th spoke's place (in steps of 360/n degrees, n the spokes),
 * a little askew as by hand: `parts` - a Cl, a Br, an NH3, a MeNH2, or a glycinate (alaninate, its methyl on a wedge) taking two neighbouring
 * spokes, its N first - and `names`, each spoke's donor named as `spokes` reports it; or each at `degrees`, where given.
 */
function complex(el: string, charge: number, parts: readonly (string | Chelate)[], slots: readonly number[], names: readonly string[], degrees?: readonly number[]) {
  const n = names.length;
  const atoms: Model["atoms"] = [{ id: 1, x: 0, y: 0, r: 0.9, el, ...(charge ? { charge } : {}) }] as Model["atoms"];
  const bonds: Model["bonds"] = [];
  const named = new Map<number, string>();
  let id = 2;
  const add = (a: Record<string, unknown>) => {
    const k = id++;
    atoms.push({ id: k, r: 0.9, ...a } as Model["atoms"][number]);
    return k;
  };
  const bond = (a: number, b: number, order: 1 | 2 = 1, wedge?: number) =>
    bonds.push({ id: 1000 + bonds.length, a, b, order, stereo: wedge != null ? "up" : "none", ...(wedge != null ? { narrow: wedge } : {}) } as Model["bonds"][number]);
  const at = (slot: number, r = 1.5) => {
    const t = ((degrees ? degrees[slot] : (360 / n) * slots[slot]) + 4) * (Math.PI / 180);
    return { x: r * Math.cos(t), y: r * Math.sin(t) };
  };
  // (each donor at the first spoke named for it not yet taken: a chelate's N and O at theirs)
  const taken = new Set<number>();
  for (const part of parts) {
    if (typeof part === "string") {
      const k = names.findIndex((x, j) => x === part && !taken.has(j));
      taken.add(k);
      const d = add({ ...at(k), el: part === "Cl" || part === "Br" ? part : "N", ...(part === "NH3" ? { valence: 4 } : {}) });
      named.set(d, names[k]);
      bond(1, d);
      // (a methylamine's C outward from its N)
      if (part === "MeNH2") bond(d, add({ ...at(k, 2.7), el: "C" }));
      continue;
    }
    // (the chelate's N at one spoke, its O at the next named for it, its ring outward between them)
    const ni = names.indexOf(`N${part.tag}`);
    const oi = names.indexOf(`O${part.tag}`);
    const N = add({ ...at(ni), el: "N" });
    const O = add({ ...at(oi), el: part.en ? "N" : "O" });
    named.set(N, names[ni]);
    named.set(O, names[oi]);
    const mid = { x: (at(ni).x + at(oi).x) / 2, y: (at(ni).y + at(oi).y) / 2 };
    const out = Math.hypot(mid.x, mid.y) || 1;
    const u = { x: mid.x / out, y: mid.y / out };
    const ca = add({ x: at(ni).x + 1.2 * u.x, y: at(ni).y + 1.2 * u.y, el: "C" });
    const co = add({ x: at(oi).x + 1.2 * u.x, y: at(oi).y + 1.2 * u.y, el: "C" });
    const o2 = part.en ? -1 : add({ x: at(oi).x + 2.4 * u.x, y: at(oi).y + 2.4 * u.y, el: "O" });
    bond(1, N);
    bond(1, O);
    bond(N, ca);
    bond(ca, co);
    bond(co, O);
    if (!part.en) bond(co, o2, 2);
    if (part.methyl) {
      const me = add({ x: at(ni).x + 2.2 * u.x, y: at(ni).y + 2.2 * u.y + 0.6, el: "C" });
      bond(ca, me, 1, ca);
    }
    taken.add(ni);
    taken.add(oi);
  }
  return { model: { atoms, bonds } as Model, names: named };
}

/** Which donors stand opposite which round the metal (`metal`, by id), by their names: the pairing nearest straight lines, each pair sorted. */
function spokes(model: Model, names: ReadonlyMap<number, string>, metal = 1): string[] {
  const m = model.atoms.find((a) => a.id === metal)!;
  const ids = [...names.keys()];
  const angle = (id: number) => {
    const a = model.atoms.find((x) => x.id === id)!;
    return Math.atan2(a.y - m.y, a.x - m.x);
  };
  const off = (p: number, q: number) => Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(angle(p) - angle(q)), Math.cos(angle(p) - angle(q)))));
  let best: { pairs: [number, number][]; off: number } = { pairs: [], off: Infinity };
  const pair = (left: number[], pairs: [number, number][], sum: number) => {
    if (!left.length) {
      if (sum < best.off) best = { pairs: [...pairs], off: sum };
      return;
    }
    const [i, ...rest] = left;
    for (const j of rest) pair(rest.filter((k) => k !== j), [...pairs, [i, j]], sum + off(i, j));
  };
  pair(ids, [], 0);
  // (a pair the nearest pairing leaves that is not plainly across - within 30 degrees of a line - is said so: never read as opposite)
  return best.pairs.map((p) => p.map((d) => names.get(d)!).sort().join("-") + (off(p[0], p[1]) > Math.PI / 6 ? " (not across)" : "")).sort();
}

/** The pairs of donors standing across each other round the metal (`metal`, by id) - each the other's nearest to a line, within 30 degrees of one - by their names, each sorted: none for a donor across nothing. */
function lines(model: Model, names: ReadonlyMap<number, string>, metal = 1): string[] {
  const m = model.atoms.find((a) => a.id === metal)!;
  const ids = [...names.keys()];
  const angle = (id: number) => {
    const a = model.atoms.find((x) => x.id === id)!;
    return Math.atan2(a.y - m.y, a.x - m.x);
  };
  const off = (p: number, q: number) => Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(angle(p) - angle(q)), Math.cos(angle(p) - angle(q)))));
  // (each the other's nearest to a line: a donor squeezed in beside a line's end is across nothing)
  const nearest = (p: number) => ids.filter((q) => q !== p).reduce((b, q) => (off(p, q) < off(p, b) ? q : b));
  const out: string[] = [];
  ids.forEach((p, i) => ids.slice(i + 1).forEach((q) => off(p, q) < Math.PI / 6 && nearest(p) === q && nearest(q) === p && out.push([names.get(p)!, names.get(q)!].sort().join("-"))));
  return out.sort();
}

/** Each centre's configuration as `model` is read, by atom id. */
function configurations(model: Model) {
  const d = drawingOf(model);
  const ids = model.atoms.map((a) => a.id);
  const out = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  for (const [c, t] of readStereo(d.atoms, d.bonds).tetra) out.set(ids[c], { neighbours: t.neighbours.map((n) => (n < 0 ? -1 : ids[n])), volume: t.volume });
  return out;
}
