import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { laidOut } from "./cleanUp";
import { MENO } from "../../../../lib/chem/style";
import { forgetLaidOut, type Layout2D, type LayoutInput } from "../../../../lib/layout/engine";
import { oppositesKept } from "./engineLayout";

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

  it("keeps it for trans- and cis-PtCl2Br2 2-, trans-PdCl2I2 2-, and each of PtBrCl(NH3)(py)'s three arrangements", { timeout: 120000 }, async () => {
    forgetLaidOut();
    for (const [metal, donors, want] of [
      [{ el: "Pt", charge: -2 }, [Cl, Br, Cl, Br], ["Br-Br", "Cl-Cl"]],
      [{ el: "Pt", charge: -2 }, [Cl, Cl, Br, Br], ["Br-Cl", "Br-Cl"]],
      [{ el: "Pd", charge: -2 }, [Cl, I, Cl, I], ["Cl-Cl", "I-I"]],
      [{ el: "Pt" }, [Br, NH3, Cl, py], ["Br-Cl", "NH3-py"]],
      [{ el: "Pt" }, [Br, Cl, NH3, py], ["Br-NH3", "Cl-py"]],
      [{ el: "Pt" }, [Br, Cl, py, NH3], ["Br-py", "Cl-NH3"]],
    ] as const) {
      const out = await laidOut(drawn(metal, donors, 45), MENO);
      expect(opposites(out, donors), want.join(", ")).toEqual(want);
    }
  });

  it("is left as laid out where the drawing does not say plainly which stand opposite, or its donors are a chelate's", () => {
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
    expect(oppositesKept(trans, input(true), cisLaid)).toBe(cisLaid);
    // (drawn with no pair within 30 degrees of a line - the N at 0 and 140, the Cl at 50 and 230: as laid out)
    expect(oppositesKept([{ x: 0, y: 0 }, at(0), at(140), at(50), at(230)], input(false), cisLaid)).toBe(cisLaid);
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
});
