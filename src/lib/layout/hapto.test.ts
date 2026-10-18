import { describe, expect, it } from "vitest";
import { placedAbbreviation, placedStructure } from "../chem/abbreviationPlace";
import { wedgeNarrowAtom } from "../chem/layout2d";
import { LIGANDS, ligandPicture } from "../chem/ligands";
import { layout2D } from "./engine";
import { FORESHORTEN, metalSlots } from "./hapto";
import { METAL_BOND } from "./perceive";
import { measured } from "../../testing/timeouts";

type Placed = NonNullable<ReturnType<typeof placedAbbreviation>>;
const laid = (label: string): Placed => placedAbbreviation(label, null, 1)!;
const find = (s: Placed, el: string) => s.atoms.flatMap((a, i) => (a.el === el ? [i] : []));
const at = (s: Placed, i: number) => ({ x: s.atoms[i].x, y: s.atoms[i].y });
const degrees = (s: Placed) => {
  const m = new Map<number, number>();
  for (const b of s.bonds) for (const e of [b.a1, b.a2]) m.set(e, (m.get(e) ?? 0) + 1);
  return m;
};
const dist = (s: Placed, i: number, j: number) => Math.hypot(s.atoms[i].x - s.atoms[j].x, s.atoms[i].y - s.atoms[j].y);
const angleAt = (s: Placed, centre: number, i: number, j: number) => {
  const u = { x: s.atoms[i].x - s.atoms[centre].x, y: s.atoms[i].y - s.atoms[centre].y };
  const v = { x: s.atoms[j].x - s.atoms[centre].x, y: s.atoms[j].y - s.atoms[centre].y };
  return (Math.acos((u.x * v.x + u.y * v.y) / Math.hypot(u.x, u.y) / Math.hypot(v.x, v.y)) * 180) / Math.PI;
};

describe("a metal's slots", () => {
  it("put two rings opposite, leaning from any other ligands; one ring over its legs; else all evenly", () => {
    const deg = (t: { angle: number }) => Math.round((t.angle * 180) / Math.PI) + 0;
    expect(metalSlots(2, 0).map(deg)).toEqual([0, 180]);
    expect(metalSlots(2, 2).map(deg)).toEqual([-20, 200, 60, 120]);
    expect(metalSlots(1, 3).map(deg)).toEqual([0, 120, 180, 240]);
    expect(metalSlots(0, 4).map(deg)).toEqual([0, 90, 180, 270]);
  });
});

describe("a ring bound face-on to a metal", () => {
  it("is foreshortened across its metal's axis, its centre a bond from the metal, its lower half near: an edge in front bold, the bonds toward it wedges", () => {
    const fc = laid("Cp2Fe");
    const [fe] = find(fc, "Fe");
    const stars = find(fc, "*");
    expect(stars).toHaveLength(2);
    // a sandwich, upright: the rings above and below the metal, a bond from it
    for (const s of stars) expect(dist(fc, fe, s)).toBeCloseTo(1, 6);
    expect(angleAt(fc, fe, stars[0], stars[1])).toBeCloseTo(180, 6);
    expect(Math.abs(at(fc, stars[0]).x - at(fc, fe).x)).toBeLessThan(1e-6);
    // each ring as deep as FORESHORTEN of its width
    for (const h of fc.haptic!) {
      const xs = h.atoms.map((i) => fc.atoms[i].x);
      const ys = h.atoms.map((i) => fc.atoms[i].y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      expect(height / width).toBeGreaterThan(FORESHORTEN * 0.8);
      expect(height / width).toBeLessThan(FORESHORTEN * 1.2);
      // seen from a little above: its lower atoms nearer, the edges between them bold
      const centre = ys.reduce((t, y) => t + y, 0) / ys.length;
      for (const i of h.atoms) {
        const z = fc.atoms[i].z!;
        if (Math.abs(fc.atoms[i].y - centre) > 1e-6) expect(Math.sign(z)).toBe(fc.atoms[i].y < centre ? 1 : -1);
      }
      // as Haworth drew rings: an edge in front (a bare ring is spun to have
      // one), bold; the two bonds running toward it, wedges broad there
      const own = (b: Placed["bonds"][number]) => h.atoms.includes(b.a1) && h.atoms.includes(b.a2);
      const bold = fc.bonds.filter((b) => b.display === "bold" && own(b));
      expect(bold).toHaveLength(1);
      for (const b of bold) {
        expect(fc.atoms[b.a1].z!).toBeGreaterThan(0);
        expect(fc.atoms[b.a2].z!).toBeGreaterThan(0);
      }
      const wedges = fc.bonds.filter((b) => b.display === "wedge" && own(b));
      expect(wedges).toHaveLength(2);
      for (const b of wedges) {
        const narrow = wedgeNarrowAtom({ ...b, stereoOrient: b.stereoOrient ?? "principle" }, degrees(fc));
        const broad = narrow === b.a1 ? b.a2 : b.a1;
        expect(fc.atoms[narrow].z!).toBeLessThanOrEqual(1e-6);
        expect(fc.atoms[broad].z!).toBeGreaterThan(0);
      }
    }
  });

  it("is seen from above on its own too: a ligand's picture has its near half at the foot of the page", () => {
    for (const label of ["Cp", "Cp*", "dppf"]) {
      const l = LIGANDS.find((x) => x.label === label)!;
      const s = placedStructure(ligandPicture(l), null, 1);
      for (const b of s.bonds.filter((x) => x.display === "bold")) {
        const ring = s.haptic!.find((h) => h.atoms.includes(b.a1))!;
        const centre = ring.atoms.reduce((t, i) => t + s.atoms[i].y, 0) / ring.atoms.length;
        // (+y up the page)
        expect((s.atoms[b.a1].y + s.atoms[b.a2].y) / 2, label).toBeLessThan(centre);
      }
      expect(s.bonds.some((x) => x.display === "bold"), label).toBe(true);
    }
    // (the whole engine on a ligand's picture: about a second alone, a few
    // times that on a machine busy with the rest of the tests)
  }, 30_000);

  it("leans in a bent metallocene, away from the metal's other ligands", () => {
    const zr = laid("Cp2ZrCl2");
    const [m] = find(zr, "Zr");
    const stars = find(zr, "*");
    expect(angleAt(zr, m, stars[0], stars[1])).toBeCloseTo(140, 4);
    const [cl1, cl2] = find(zr, "Cl");
    // the chlorides on the side the rings lean from
    const side = (i: number) => Math.sign(zr.atoms[i].x - zr.atoms[m].x);
    expect(side(cl1)).toBe(side(cl2));
    expect(side(stars[0])).toBe(-side(cl1));
  });

  it("stands over a half-sandwich's legs", () => {
    const ru = laid("Cp*RuCl(PPh3)2");
    const [m] = find(ru, "Ru");
    const [star] = find(ru, "*");
    expect(ru.atoms[star].y).toBeGreaterThan(ru.atoms[m].y);
    for (const leg of [...find(ru, "P"), ...find(ru, "Cl")]) expect(ru.atoms[leg].y).toBeLessThan(ru.atoms[m].y + 1e-6);
    // what hangs from the ring points out from it: each of Cp*'s methyls
    // away from the star
    const ring = ru.haptic![0].atoms;
    const c = at(ru, star);
    const methyls = ru.bonds.flatMap((b) => {
      const [r, m] = ring.includes(b.a1) ? [b.a1, b.a2] : [b.a2, b.a1];
      return ring.includes(r) && !ring.includes(m) && ru.atoms[m].el === "C" ? [[r, m]] : [];
    });
    expect(methyls).toHaveLength(5);
    for (const [r, m] of methyls) {
      const u = { x: ru.atoms[r].x - c.x, y: ru.atoms[r].y - c.y };
      const v = { x: ru.atoms[m].x - ru.atoms[r].x, y: ru.atoms[m].y - ru.atoms[r].y };
      expect(u.x * v.x + u.y * v.y).toBeGreaterThan(0);
    }
    // (the whole engine on a half-sandwich complex: about a second alone, a few
    // times that on a machine busy with the rest of the tests)
  }, 30_000);

  it("is drawn alone face-on to a star where the ligand is a label's picture", () => {
    expect(laid("dppf").bonds.some((b) => b.display === "bold")).toBe(true);
    // (the whole engine on a ligand's picture: about a second alone, a few
    // times that on a machine busy with the rest of the tests)
  }, 30_000);
});

describe("ligands round a metal", () => {
  it("are a bond and a half off, the bulky ones trans, what a donor carries spread away from the metal", () => {
    const pd = laid("PdCl2(PPh3)2");
    const [m] = find(pd, "Pd");
    const ps = find(pd, "P");
    for (const l of [...ps, ...find(pd, "Cl")]) expect(dist(pd, m, l)).toBeCloseTo(METAL_BOND, 4);
    expect(angleAt(pd, m, ps[0], ps[1])).toBeCloseTo(180, 4);
    for (const p of ps) {
      for (const b of pd.bonds.filter((x) => (x.a1 === p || x.a2 === p) && x.a1 !== m && x.a2 !== m)) {
        const c = b.a1 === p ? b.a2 : b.a1;
        // (turned a little where that clears them, but never back over the metal)
        expect(angleAt(pd, p, m, c)).toBeGreaterThan(75);
      }
    }
    // (the whole engine on the complexes: about a second alone, a few times
    // that on a machine busy with the rest of the tests)
  }, 30_000);

  it("close a chelate through a ferrocene at the metal, its two bonds alike", () => {
    const pd = laid("PdCl2(dppf)");
    const [m] = find(pd, "Pd");
    const [p1, p2] = find(pd, "P");
    expect(dist(pd, m, p1)).toBeCloseTo(dist(pd, m, p2), 4);
    expect(angleAt(pd, m, p1, p2)).toBeGreaterThan(60);
    // (the whole engine on a complex this size: slower on CI's runners)
  }, measured(2_400));

  it("turn crowded aryl rings as a propeller where that reads better, their near edges bold, the bonds toward them wedges", () => {
    const pd = laid("Pd(PPh3)4");
    const turned = pd.atoms.filter((a) => a.el === "C" && a.z != null);
    expect(turned.length).toBeGreaterThan(0);
    expect(pd.bonds.some((b) => b.display === "bold")).toBe(true);
    expect(pd.bonds.some((b) => b.display === "wedge")).toBe(true);
  }, measured(9_900));
});

describe("a ring bound to a metal through two of its C=C (cod)", () => {
  it("is a tub facing the metal: each C=C cis, nothing crossing, its near edges bold, the metal beside both", () => {
    for (const label of ["Ni(cod)2", "[Rh(cod)2]BF4", "[Ir(cod)Cl]2", "Crabtree's catalyst"]) {
      const s = laid(label);
      const ringOf = (a: number) => s.bonds.filter((b) => b.a1 === a || b.a2 === a).map((b) => (b.a1 === a ? b.a2 : b.a1));
      // each C=C drawn cis: the ring's atoms on either side of it on the same side of its line
      const bound = new Set(s.bonds.flatMap((x) => x.endpoints ?? []));
      for (const b of s.bonds.filter((x) => x.order === 2 && bound.has(x.a1) && bound.has(x.a2))) {
        const p = s.atoms[b.a1];
        const q = s.atoms[b.a2];
        const side = (r: number) => Math.sign((q.x - p.x) * (s.atoms[r].y - p.y) - (q.y - p.y) * (s.atoms[r].x - p.x));
        const outP = ringOf(b.a1).filter((r) => r !== b.a2 && s.atoms[r].el === "C");
        const outQ = ringOf(b.a2).filter((r) => r !== b.a1 && s.atoms[r].el === "C");
        expect(side(outP[0]), label).toBe(side(outQ[0]));
      }
      expect(s.bonds.some((b) => b.display === "bold"), label).toBe(true);
    }
    // the metal as far from each C=C's middle (a bond and a half, foreshortened alike)
    const ni = laid("Ni(cod)2");
    const [m] = find(ni, "Ni");
    const stars = find(ni, "*");
    expect(stars).toHaveLength(4);
    // the two tubs either side of the metal
    const xs = stars.map((k) => Math.sign(ni.atoms[k].x - ni.atoms[m].x));
    expect(xs.filter((x) => x > 0)).toHaveLength(2);
    expect(xs.filter((x) => x < 0)).toHaveLength(2);
  }, measured(1_100));
});

describe("a tub on a metal that is in a ring of its own (a chelate's)", () => {
  it("is laid out with that ring: the tub to one side of the metal, the ring opposite, each C=C cis", () => {
    // (each of these threw in Clean-up: the tub's stars were in its ring's
    // system, which only its metal's unit lays out, and the metal, in its
    // chelate, made no unit)
    for (const label of ["Rh(cod)(acac)", "Ir(cod)(acac)", "[Rh(cod)(dppe)]BF4", "Rh(cod)(bpy)", "Ir(cod)(phen)"]) {
      const s = laid(label);
      const [m] = s.atoms.flatMap((a, i) => (["Rh", "Ir"].includes(a.el) ? [i] : []));
      const bound = new Set(s.bonds.flatMap((x) => x.endpoints ?? []));
      const tub = s.bonds.filter((x) => x.order === 2 && bound.has(x.a1) && bound.has(x.a2) && s.bonds.some((y) => y.endpoints?.includes(x.a1) && [y.a1, y.a2].includes(m)));
      expect(tub, label).toHaveLength(2);
      const side = Math.sign(s.atoms[tub[0].a1].x - s.atoms[m].x);
      for (const b of tub) for (const e of [b.a1, b.a2]) expect(Math.sign(s.atoms[e].x - s.atoms[m].x), label).toBe(side);
      // the metal's own bonds into its ring, a bond long, on the other side
      const stars = new Set(find(s, "*"));
      const donors = s.bonds.flatMap((b) => (b.a1 === m && !stars.has(b.a2) ? [b.a2] : b.a2 === m && !stars.has(b.a1) ? [b.a1] : []));
      expect(donors.length, label).toBeGreaterThanOrEqual(2);
      for (const d of donors) {
        expect(Math.sign(s.atoms[d].x - s.atoms[m].x), label).toBe(-side);
        expect(dist(s, m, d), label).toBeGreaterThan(0.9);
        expect(dist(s, m, d), label).toBeLessThan(1.6);
      }
    }
  }, 30_000);
});

describe("two metals bridged by two atoms", () => {
  it("lie level, their bridges above and below between them, each one's ligands outside", () => {
    for (const label of ["[Ir(cod)Cl]2", "[RhCl(cod)]2", "[RuCl2(p-cymene)]2", "[Cp*RhCl2]2"]) {
      const s = laid(label);
      const metals = s.atoms.flatMap((a, i) => (["Ir", "Rh", "Ru"].includes(a.el) ? [i] : []));
      expect(metals, label).toHaveLength(2);
      const [m1, m2] = metals.sort((p, q) => s.atoms[p].x - s.atoms[q].x);
      expect(s.atoms[m1].y, label).toBeCloseTo(s.atoms[m2].y, 6);
      // the bridging atoms: one above the line through the metals, one below, between them
      const bound = (a: number) => s.bonds.filter((b) => b.a1 === a || b.a2 === a).map((b) => (b.a1 === a ? b.a2 : b.a1));
      const bridges = s.atoms.flatMap((_, i) => (bound(i).includes(m1) && bound(i).includes(m2) ? [i] : []));
      expect(bridges, label).toHaveLength(2);
      const ys = bridges.map((b) => s.atoms[b].y - s.atoms[m1].y).sort((p, q) => p - q);
      expect(ys[0] < 0 && ys[1] > 0, label).toBe(true);
      for (const b of bridges) expect(s.atoms[b].x > s.atoms[m1].x && s.atoms[b].x < s.atoms[m2].x, label).toBe(true);
      // what else each metal carries on its own side
      const middle = (s.atoms[m1].x + s.atoms[m2].x) / 2;
      for (const [m, side] of [[m1, -1], [m2, 1]] as const) {
        for (const l of bound(m).filter((a) => !bridges.includes(a))) expect(Math.sign(s.atoms[l].x - middle), label).toBe(side);
      }
    }
  }, measured(310));
});

describe("a structure with no metal", () => {
  it("has nothing drawn bold, and no depth outside a cage", () => {
    const out = layout2D({
      atoms: [{ el: "C" }, { el: "C" }, { el: "O" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }],
      bonds: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 2 },
        { a: 1, b: 3, order: 1 },
        { a: 3, b: 4, order: 1 },
        { a: 4, b: 5, order: 1 },
        { a: 5, b: 6, order: 1 },
      ],
    });
    expect(out.bold).toEqual([]);
    expect(out.depth.every((d) => d == null)).toBe(true);
  });
});

describe("a transition metal bridged to a main-group metal", () => {
  it("draws the Tebbe reagent as its four-membered ring: Cp2Ti on the left, its rings apart, AlMe2 on the right", () => {
    const s = laid("Tebbe reagent");
    const [ti] = find(s, "Ti");
    const [al] = find(s, "Al");
    expect(at(s, ti).x).toBeLessThan(at(s, al).x);
    expect(Math.abs(at(s, ti).y - at(s, al).y)).toBeLessThan(0.05);
    // the two rings' centres well apart, both on titanium's side
    const stars = find(s, "*");
    expect(stars).toHaveLength(2);
    expect(dist(s, stars[0], stars[1])).toBeGreaterThan(1.2);
    for (const c of stars) expect(at(s, c).x).toBeLessThan(at(s, ti).x);
  });
});


describe("a ring bound to a metal atom by atom, as drawn by hand", () => {
  // ferrocene with a bond from the iron to each carbon: Fe 0, Cp 1-5 and 6-10
  const ring = (from: number) => Array.from({ length: 5 }, (_, i) => ({ a: from + i, b: from + ((i + 1) % 5), order: i % 2 ? 1 : 2 }));
  const ferrocene = {
    atoms: [{ el: "Fe" }, ...Array.from({ length: 10 }, () => ({ el: "C" }))],
    bonds: [...ring(1), ...ring(6), ...Array.from({ length: 10 }, (_, i) => ({ a: 0, b: i + 1, order: 1 }))],
  };
  it("is found: each ring, its metal, and the bonds from the metal to its atoms", async () => {
    const { ringsBondedAtomByAtom } = await import("./perceive");
    const found = ringsBondedAtomByAtom(ferrocene);
    expect(found).toHaveLength(2);
    for (const r of found) {
      expect(r.metal).toBe(0);
      expect(r.ring).toHaveLength(5);
      expect(r.bonds.map((i) => ferrocene.bonds[i]).every((b) => b.a === 0 && r.ring.includes(b.b))).toBe(true);
    }
    // a chelate's donors, bonded to the metal but not to each other, are no such ring (bipyridine, porphyrin)
    const chelate = { atoms: [{ el: "Ru" }, { el: "N" }, { el: "C" }, { el: "C" }, { el: "N" }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 3, order: 1 }, { a: 3, b: 4, order: 1 }, { a: 4, b: 0, order: 1 }] };
    expect(ringsBondedAtomByAtom(chelate)).toEqual([]);
  });

  it("is found with the chains of three or more atoms so bonded - an allyl - but not two (a metallacyclopropane is drawn so too)", async () => {
    const { etaBondedAtomByAtom, ringsBondedAtomByAtom } = await import("./perceive");
    // Pd 0, allyl 1-2-3 each bonded to it, Cl 4
    const allyl = {
      atoms: [{ el: "Pd" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "Cl" }],
      bonds: [{ a: 1, b: 2, order: 2 }, { a: 2, b: 3, order: 1 }, { a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }, { a: 0, b: 3, order: 1 }, { a: 0, b: 4, order: 1 }],
    };
    expect(etaBondedAtomByAtom(allyl)).toEqual([{ metal: 0, ring: [1, 2, 3], bonds: [2, 3, 4] }]);
    // an alkene's two: as drawn
    const alkene = { atoms: [{ el: "Pt" }, { el: "C" }, { el: "C" }], bonds: [{ a: 1, b: 2, order: 2 }, { a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }] };
    expect(etaBondedAtomByAtom(alkene)).toEqual([]);
    // ferrocene's rings, as before, and no chain besides
    expect(etaBondedAtomByAtom(ferrocene)).toEqual(ringsBondedAtomByAtom(ferrocene));
    // a chelate's donors, not bonded to each other, are no chain
    const chelate = { atoms: [{ el: "Ru" }, { el: "N" }, { el: "C" }, { el: "C" }, { el: "N" }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 3, order: 1 }, { a: 3, b: 4, order: 1 }, { a: 4, b: 0, order: 1 }] };
    expect(etaBondedAtomByAtom(chelate)).toEqual([]);
  });
});

describe("a metal that two chelates or more close at", () => {
  it("has its donors a square angle apart, each chelate giving at the metal: a salen's two O apart, its Cl clear of both", () => {
    const j = laid("(R,R)-Jacobsen's catalyst");
    const [mn] = find(j, "Mn");
    const [cl] = find(j, "Cl");
    const [o1, o2] = find(j, "O");
    const [n1, n2] = find(j, "N");
    for (const [p, q] of [[o1, n1], [n1, n2], [n2, o2], [o2, o1]] as const) {
      const a = angleAt(j, mn, p, q);
      // (each donor's neighbour round the metal, whichever way the salen is listed)
      if (a < 135) expect(a).toBeCloseTo(90, 0);
    }
    expect(angleAt(j, mn, o1, o2)).toBeCloseTo(90, 0);
    expect(dist(j, o1, o2)).toBeGreaterThan(1.3);
    // the Cl between the two O, off both their bonds
    expect(Math.abs(angleAt(j, mn, cl, o1) - angleAt(j, mn, cl, o2))).toBeLessThan(1);
    expect(angleAt(j, mn, cl, o1)).toBeGreaterThan(40);
  }, 30_000);

  it("tries each way of setting separate chelates round it, nothing of its own drawn inside a chelate's ring", () => {
    const k = laid("(R)-Krische's catalyst");
    const [ir] = find(k, "Ir");
    const ps = find(k, "P");
    // the bisphosphine's two P a square angle apart at the metal
    expect(angleAt(k, ir, ps[0], ps[1])).toBeCloseTo(90, 0);
    // (the allyl's star - the centre of its three atoms - is outside every ring through Ir)
    const [star] = find(k, "*");
    const ring = (ids: number[]) => ids.map((i) => at(k, i));
    const inside = (p: { x: number; y: number }, poly: { x: number; y: number }[]) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [a, b] = [poly[i], poly[j]];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    // the bisphosphine's seven: Ir, P, its biaryl's four carbons, P
    const nb = (i: number) => k.bonds.flatMap((b) => (b.a1 === i ? [b.a2] : b.a2 === i ? [b.a1] : []));
    const path = (from: number, to: number): number[] => {
      const back = new Map<number, number>([[from, -1]]);
      const queue = [from];
      while (queue.length) {
        const v = queue.shift()!;
        for (const w of nb(v)) {
          if (back.has(w) || w === ir || k.atoms[w].el === "*") continue;
          back.set(w, v);
          queue.push(w);
        }
      }
      const out = [to];
      while (out[out.length - 1] !== from) out.push(back.get(out[out.length - 1])!);
      return out;
    };
    expect(inside(at(k, star), ring([ir, ...path(ps[0], ps[1])]))).toBe(false);
  }, measured(6_000));
});

describe("a pi system bound to a metal that makes no ring", () => {
  it("lies across the metal's bond, its centre where the star is: an allyl bent round, its middle away from the metal", () => {
    const pd = laid("[Pd(allyl)Cl]2");
    const metals = find(pd, "Pd");
    for (const star of find(pd, "*")) {
      const bond = pd.bonds.find((b) => b.endpoints && b.a2 === star)!;
      const m = bond.a1;
      expect(metals).toContain(m);
      expect(dist(pd, m, star)).toBeCloseTo(1, 1);
      const [a, b, c] = bond.endpoints!;
      const middle = [a, b, c].find((v) => [a, b, c].every((w) => w === v || pd.bonds.some((x) => !x.endpoints && ((x.a1 === v && x.a2 === w) || (x.a2 === v && x.a1 === w)))))!;
      const ends = [a, b, c].filter((v) => v !== middle);
      for (const e of ends) expect(dist(pd, m, middle)).toBeGreaterThan(dist(pd, m, e) - 0.2);
      expect(dist(pd, m, middle)).toBeGreaterThan(dist(pd, m, star));
    }
  });

  it("draws an alkene's C=C square to the metal's bond, a bond from the metal (Pd2(dba)3's)", () => {
    const pd = laid("Pd2(dba)3");
    const close = pd.bonds.filter((b) => b.endpoints && b.endpoints.length === 2 && dist(pd, b.a1, b.a2) < 1.2);
    expect(close.length).toBeGreaterThanOrEqual(2);
    for (const b of close) expect(angleAt(pd, b.a2, b.a1, b.endpoints![0])).toBeCloseTo(90, 0);
  }, 30_000);
});

describe("a metal in a chelate's ring", () => {
  it("has its other ligands evenly over the room outside the ring, the one it was reached by among them", () => {
    const hg = laid("HG-II");
    const [ru] = find(hg, "Ru");
    const cls = find(hg, "Cl");
    // (the carbene: the carbon bonded to Ru and to two N)
    const nb = (i: number) => hg.bonds.flatMap((b) => (b.endpoints ? [] : b.a1 === i ? [b.a2] : b.a2 === i ? [b.a1] : []));
    const carbene = nb(ru).find((c) => hg.atoms[c].el === "C" && nb(c).filter((v) => hg.atoms[v].el === "N").length === 2)!;
    const [a, b] = cls.map((cl) => angleAt(hg, ru, cl, carbene));
    expect(a).toBeCloseTo(b, 0);
    expect(Math.min(a, b)).toBeGreaterThan(55);
  }, 30_000);
});
