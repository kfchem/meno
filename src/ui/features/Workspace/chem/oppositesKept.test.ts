import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { laidOut } from "./cleanUp";
import { MENO } from "../../../../lib/chem/style";
import { forgetLaidOut, type Layout2D, type LayoutInput } from "../../../../lib/layout/engine";
import { oppositesKept } from "./engineLayout";
import { drawingOf } from "./drawing";
import { readStereo, sameConfiguration } from "../../../../lib/layout/drawn";

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

  it("is left as laid out where the drawing does not say which stand opposite, or its donors are a chelate's - and kept where it is bent", () => {
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
    // (drawn bent - the N at 0 and 140, the Cl at 50 and 230: still N opposite N, the pairing nearest two lines)
    expect(oppositesKept([{ x: 0, y: 0 }, at(0), at(140), at(50), at(230)], input(false), cisLaid)).not.toBe(cisLaid);
    // (drawn so that two pairings are as near - the N at 0 and 120, the Cl at 60 and 180: N with N, or each N with a Cl, alike; it
    // does not say, and the layout's stands)
    expect(oppositesKept([{ x: 0, y: 0 }, at(0), at(120), at(60), at(180)], input(false), cisLaid)).toBe(cisLaid);
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

type Chelate = { tag: string; methyl?: true };
const gly = (tag: string): Chelate => ({ tag });
const ala = (tag: string): Chelate => ({ tag, methyl: true });

/**
 * A metal with its donors drawn round it as spokes, `slots[k]` the k-th spoke's place (in steps of 360/n degrees, n the spokes),
 * a little askew as by hand: `parts` - a Cl, an NH3, or a glycinate (alaninate, its methyl on a wedge) taking two neighbouring
 * spokes, its N first - and `names`, each spoke's donor named as `spokes` reports it.
 */
function complex(el: string, charge: number, parts: readonly (string | Chelate)[], slots: readonly number[], names: readonly string[]) {
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
    const t = ((360 / n) * slots[slot] + 4) * (Math.PI / 180);
    return { x: r * Math.cos(t), y: r * Math.sin(t) };
  };
  // (each donor at the first spoke named for it not yet taken: a chelate's N and O at theirs)
  const taken = new Set<number>();
  for (const part of parts) {
    if (typeof part === "string") {
      const k = names.findIndex((x, j) => x === part && !taken.has(j));
      taken.add(k);
      const d = add({ ...at(k), el: part === "Cl" ? "Cl" : "N", ...(part === "NH3" ? { valence: 4 } : {}) });
      named.set(d, names[k]);
      bond(1, d);
      continue;
    }
    // (the chelate's N at one spoke, its O at the next named for it, its ring outward between them)
    const ni = names.indexOf(`N${part.tag}`);
    const oi = names.indexOf(`O${part.tag}`);
    const N = add({ ...at(ni), el: "N" });
    const O = add({ ...at(oi), el: "O" });
    named.set(N, names[ni]);
    named.set(O, names[oi]);
    const mid = { x: (at(ni).x + at(oi).x) / 2, y: (at(ni).y + at(oi).y) / 2 };
    const out = Math.hypot(mid.x, mid.y) || 1;
    const u = { x: mid.x / out, y: mid.y / out };
    const ca = add({ x: at(ni).x + 1.2 * u.x, y: at(ni).y + 1.2 * u.y, el: "C" });
    const co = add({ x: at(oi).x + 1.2 * u.x, y: at(oi).y + 1.2 * u.y, el: "C" });
    const o2 = add({ x: at(oi).x + 2.4 * u.x, y: at(oi).y + 2.4 * u.y, el: "O" });
    bond(1, N);
    bond(1, O);
    bond(N, ca);
    bond(ca, co);
    bond(co, O);
    bond(co, o2, 2);
    if (part.methyl) {
      const me = add({ x: at(ni).x + 2.2 * u.x, y: at(ni).y + 2.2 * u.y + 0.6, el: "C" });
      bond(ca, me, 1, ca);
    }
    taken.add(ni);
    taken.add(oi);
  }
  return { model: { atoms, bonds } as Model, names: named };
}

/** Which donors stand opposite which round the metal (id 1), by their names: the pairing nearest straight lines, each pair sorted. */
function spokes(model: Model, names: ReadonlyMap<number, string>): string[] {
  const m = model.atoms.find((a) => a.id === 1)!;
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
  return best.pairs.map((p) => p.map((d) => names.get(d)!).sort().join("-")).sort();
}

/** Each centre's configuration as `model` is read, by atom id. */
function configurations(model: Model) {
  const d = drawingOf(model);
  const ids = model.atoms.map((a) => a.id);
  const out = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  for (const [c, t] of readStereo(d.atoms, d.bonds).tetra) out.set(ids[c], { neighbours: t.neighbours.map((n) => (n < 0 ? -1 : ids[n])), volume: t.volume });
  return out;
}
