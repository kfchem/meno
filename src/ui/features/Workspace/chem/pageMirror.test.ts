import { describe, expect, it, vi } from "vitest";
import { readMolfile } from "../../../../lib/chem/ctfile";
import type { ChemClient } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { blocksOf, conformersGrowing, conformersOf } from "./make3d";
import { hasConfiguration, madeAs, mirroredConfiguration, mirroredPart, reflectedConformers } from "./pageMirror";

/** Butan-2-ol drawn: C1-C2(-O5)-C3-C4, its O on a wedge out of C2, up or down - the same places, mirror images. */
const butanol = (stereo: "up" | "down"): Model => ({
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: 1.3, y: 0.75, r: 0.9, el: "C" },
    { id: 3, x: 2.6, y: 0, r: 0.9, el: "C" },
    { id: 4, x: 3.9, y: 0.75, r: 0.9, el: "C" },
    { id: 5, x: 1.3, y: 2.25, r: 0.9, el: "O" },
  ],
  bonds: [
    { id: 11, a: 1, b: 2, order: 1 },
    { id: 12, a: 2, b: 3, order: 1 },
    { id: 13, a: 3, b: 4, order: 1 },
    { id: 14, a: 2, b: 5, order: 1, stereo },
  ],
});
const none = { centres: [], doubles: [] };

/**
 * A plugin that makes a block's one conformer where its drawing puts its
 * atoms - each wedged atom lifted out of the page, each hashed one behind
 * it - so that it has the configuration drawn; labelled R where the wedge
 * is up, as a stand-in for the toolkit's label. It records what it was asked.
 */
function plugin(wrongWhenMirrored = false) {
  const asked: { molblock: string; isomers: unknown[] }[] = [];
  const chem = {
    request: async (_op: string, args: { molblock: string; isomers: unknown[] }) => {
      asked.push({ molblock: args.molblock, isomers: args.isomers });
      const ct = readMolfile(args.molblock)!;
      const z = ct.atoms.map(() => 0);
      // (or, asked for a mirror image, one made the other way round: as a toolkit might, where it does)
      const turn = wrongWhenMirrored && asked.length === 1 ? -1 : 1;
      for (const b of ct.bonds) if (b.stereo === "up" || b.stereo === "down") z[b.a2] = (b.stereo === "up" ? 1 : -1) * turn;
      const up = ct.bonds.some((b) => b.stereo === "up");
      return {
        isomers: args.isomers.map(() => ({
          atoms: ct.atoms.map((a) => ({ el: a.symbol, charge: 0 })),
          bonds: ct.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: 1 })),
          frames: [ct.atoms.flatMap((a, i) => [a.x, a.y, z[i]])],
          field: "MMFF94",
          cip: { atoms: { "1": up ? "R" : "S" }, bonds: {} },
          smiles: up ? "CC[C@@H](C)O" : "CC[C@H](C)O",
        })),
      };
    },
  } as unknown as ChemClient;
  return { chem, asked };
}

/** The plugin that finds stereoisomers: the drawing's one centre given, nothing left open. */
const stereo = {
  request: async (op: string) => (op === "stereo_elements" ? { read: true, elements: [{ kind: "centre", at: 1, state: "specified" }] } : Promise.reject(new Error(`no ${op} here`))),
} as unknown as ChemClient;

describe("the page's mirror images", () => {
  it("makes one of two enantiomers itself and the other as its mirror image, by which identity comes first", () => {
    const as = (["up", "down"] as const).map((s) => madeAs(butanol(s), none));
    expect([...as].sort()).toEqual(["itself", "mirror"]);
  });

  it("makes itself a structure with no stereo, a meso form, one with a label written out, or a wedge it cannot read", () => {
    const ethanol: Model = { atoms: butanol("up").atoms.slice(0, 3), bonds: butanol("up").bonds.slice(0, 2) };
    expect(madeAs(ethanol, none)).toBe("itself");
    // (meso-butane-2,3-diol drawn as a zigzag, its two O across the chain from each other: one on a wedge, the other
    //  on hashes - R and S. Both on wedges is the R,R or S,S form, chiral)
    const meso: Model = {
      atoms: [...butanol("up").atoms, { id: 6, x: 2.6, y: -1.5, r: 0.9, el: "O" }],
      bonds: [...butanol("up").bonds, { id: 15, a: 3, b: 6, order: 1, stereo: "down" }],
    };
    expect(madeAs(meso, none)).toBe("itself");
    expect(madeAs(mirroredPart(meso), none)).toBe("itself");
    const rr: Model = { ...meso, bonds: meso.bonds.map((x) => (x.id === 15 ? { ...x, stereo: "up" as const } : x)) };
    expect([madeAs(rr, none), madeAs(mirroredPart(rr), none)].sort()).toEqual(["itself", "mirror"]);
    const labelled: Model = { ...butanol("up"), atoms: butanol("up").atoms.map((a) => (a.id === 4 ? { ...a, el: "Ph" } : a)) };
    expect(madeAs(labelled, none)).toBe("itself");
  });

  it("takes neither of a chiral pair for the other's mirror image where it cannot read the drawing whole: a label, a wedge it does not read, a ring through a star", () => {
    // (each a pair of butan-2-ols, its O up and down, with something more drawn on it alike)
    const pair = (more: (m: Model) => Model) => (["up", "down"] as const).map((s) => madeAs(more(butanol(s)), none));
    // (a label written out: phenyl for the methyl)
    expect(pair((m) => ({ ...m, atoms: m.atoms.map((a) => (a.id === 4 ? { ...a, el: "Ph" } : a)) }))).toEqual(["itself", "itself"]);
    // (an N of three bonds on the methyl, its own wedge drawn - a wedge at such an N is not read)
    const amine = (m: Model): Model => ({
      atoms: [...m.atoms, { id: 30, x: 3.9, y: 2.25, r: 0.9, el: "N" }, { id: 31, x: 5.2, y: 3, r: 0.9, el: "C" }, { id: 32, x: 2.6, y: 3, r: 0.9, el: "C" }],
      bonds: [...m.bonds, { id: 40, a: 4, b: 30, order: 1 }, { id: 41, a: 30, b: 31, order: 1, stereo: "up" }, { id: 42, a: 30, b: 32, order: 1 }],
    });
    expect(pair(amine)).toEqual(["itself", "itself"]);
    // (an allyl bound to an Fe through a star at its centre, apart from the alcohol)
    const star = (m: Model): Model => ({
      atoms: [
        ...m.atoms,
        ...[50, 51, 52].map((id, k) => ({ id, x: 8 + 1.3 * k, y: k % 2 ? 0.75 : 0, r: 0.9, el: "C" })),
        { id: 53, x: 9.3, y: -1.5, r: 0.9, el: "Fe" },
        { id: 54, x: 9.3, y: 0.25, r: 0.9, el: "*" },
      ],
      bonds: [...m.bonds, { id: 60, a: 50, b: 51, order: 1 }, { id: 61, a: 51, b: 52, order: 1 }, { id: 62, a: 53, b: 54, order: 1, endpoints: [50, 51, 52] }],
    });
    expect(pair(star)).toEqual(["itself", "itself"]);
  });

  it("turns a drawing over: each wedge up for down, each depth a perspective drawing gives turned", () => {
    const deep: Model = { ...butanol("up"), atoms: butanol("up").atoms.map((a, k) => (k < 2 ? { ...a, z: k ? -0.5 : 0.8 } : a)) };
    const m = mirroredPart(deep);
    expect(m.atoms.map((a) => a.z)).toEqual([-0.8, 0.5, undefined, undefined, undefined]);
    expect(m.bonds.find((b) => b.id === 14)?.stereo).toBe("down");
  });

  it("asks the plugin for the same structure whichever of the two is asked for, and gives the other its reflection", async () => {
    const made = [];
    const sent = [];
    for (const s of ["up", "down"] as const) {
      const { chem, asked } = plugin();
      const [block] = blocksOf(butanol(s), [1]);
      made.push((await conformersOf(chem, stereo, block, "one"))[0]);
      sent.push(asked.map((a) => a.molblock));
    }
    // (one request each, of one and the same block: the two drawings' one that is made itself)
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]).toEqual(sent[1]);
    // (each with the configuration drawn, its R or S as its own: the reflection's turned)
    expect(made.map((c) => c.cip.atoms["1"]).sort()).toEqual(["R", "S"]);
    const [up, down] = made;
    expect(down.frames[0].map((v, k) => (k % 3 === 0 ? -v : v))).toEqual(up.frames[0].map((v) => v));
  });

  it("makes one itself where the reflection of its mirror image has not its configuration after all", async () => {
    // (the drawing made as a mirror image: the one that is)
    const twin = (["up", "down"] as const).find((s) => madeAs(butanol(s), none) === "mirror")!;
    const { chem, asked } = plugin(true);
    const [block] = blocksOf(butanol(twin), [1]);
    const [c] = await conformersOf(chem, stereo, block, "one");
    // (asked for the mirror image, then for itself: its own block, its own conformer, as drawn)
    expect(asked).toHaveLength(2);
    expect(asked[1].molblock).toBe(block.molblock);
    expect(hasConfiguration(c, block.part, none)).toBe(true);
  });

  it("reflects conformers through a plane and turns R and S, M and P - not r and s, nor E and Z", () => {
    const c = reflectedConformers({
      atoms: [],
      bonds: [],
      frames: [[1, 2, 3, -4, 5, 6]],
      field: "UFF",
      cip: { atoms: { "0": "R", "1": "s", "2": "M" }, bonds: { "3": "E" } },
      smiles: "C[C@@H](O)[C@H](N)C",
    });
    expect(c.frames).toEqual([[-1, 2, 3, 4, 5, 6]]);
    expect(c.cip).toEqual({ atoms: { "0": "S", "1": "s", "2": "P" }, bonds: { "3": "E" } });
    expect(c.smiles).toBe("C[C@H](O)[C@@H](N)C");
  });

  it("turns a chosen configuration's centres, not its double bonds", () => {
    expect(mirroredConfiguration({ centres: [{ atom: 1, neighbours: [0, 2, 4], sense: 1 }], doubles: [{ bond: 2, ends: [0, 3], cis: true }] })).toEqual({
      centres: [{ atom: 1, neighbours: [0, 2, 4], sense: -1 }],
      doubles: [{ bond: 2, ends: [0, 3], cis: true }],
    });
  });

  it("says whether conformers have the cis or trans asked for at a double bond", () => {
    // (but-2-ene drawn: C1-C2=C3-C4; asked cis, then trans, by its end carbons)
    const butene: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 1.3, y: 0.75, r: 0.9, el: "C" },
        { id: 3, x: 2.6, y: 0, r: 0.9, el: "C" },
        { id: 4, x: 3.9, y: 0.75, r: 0.9, el: "C" },
      ],
      bonds: [
        { id: 11, a: 1, b: 2, order: 1 },
        { id: 12, a: 2, b: 3, order: 2 },
        { id: 13, a: 3, b: 4, order: 1 },
      ],
    };
    const asked = (cis: boolean) => ({ centres: [], doubles: [{ bond: 1, ends: [0, 3] as [number, number], cis }] });
    // (C2=C3 along x; C1 above C2, C4 above C3 or below it)
    const at = (side: number) => ({ frames: [[-0.7, 1.2, 0, 0, 0, 0, 1.34, 0, 0, 2.04, 1.2 * side, 0]] });
    expect(hasConfiguration(at(1), butene, asked(true))).toBe(true);
    expect(hasConfiguration(at(-1), butene, asked(true))).toBe(false);
    expect(hasConfiguration(at(-1), butene, asked(false))).toBe(true);
    expect(hasConfiguration(at(1), butene, asked(false))).toBe(false);
  });

  it("says whether conformers have the configuration asked for: a reflection that did not give it is made itself", () => {
    const part = butanol("up");
    // (C2 at the origin, its O out of the page as drawn, or behind it)
    const at = (oz: number) => [[0, 0, 0, 1.3, 0.75, 0, 2.6, 0, 0, 3.9, 0.75, 0, 1.3, 2.25, oz]];
    expect(hasConfiguration({ frames: at(1) }, part, none)).toBe(true);
    expect(hasConfiguration({ frames: at(-1) }, part, none)).toBe(false);
  });

  /** A centre configured: its atom, its neighbours (the O last), and the sense their volume takes. */
  const centre = (atom: number, neighbours: number[], sense: 1 | -1) => ({ atom, neighbours, sense });

  /**
   * A plugin that makes each stereoisomer it is asked for with the configuration asked: the drawing's places,
   * each centre's last neighbour lifted out of the page or put behind it as the sense asks - labelled R where
   * the first centre's sense is 1, a stand-in for the toolkit's label. Asked for more than one at once where
   * `firstOnly`, it answers the first alone.
   */
  function shaper(firstOnly = false) {
    const asked: number[] = [];
    const chem = {
      request: async (_op: string, args: { molblock: string; isomers: { centres: ReturnType<typeof centre>[] }[] }) => {
        asked.push(args.isomers.length);
        const ct = readMolfile(args.molblock)!;
        const one = (iso: { centres: ReturnType<typeof centre>[] }) => {
          const f = ct.atoms.flatMap((a) => [a.x, a.y, 0]);
          for (const c of iso.centres) {
            const o = c.neighbours[2];
            const vol = () => {
              const [u, v, w] = c.neighbours.map((n) => [0, 1, 2].map((d) => f[3 * n + d] - f[3 * c.atom + d]));
              return u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
            };
            f[3 * o + 2] = 1;
            if (Math.sign(vol()) !== c.sense) f[3 * o + 2] = -1;
          }
          return {
            atoms: ct.atoms.map((a) => ({ el: a.symbol, charge: 0 })),
            bonds: ct.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: 1 })),
            frames: [f],
            field: "MMFF94",
            cip: { atoms: { "1": iso.centres[0]?.sense > 0 ? "R" : "S" }, bonds: {} },
            smiles: "",
          };
        };
        const isomers = firstOnly && args.isomers.length > 1 ? args.isomers.slice(0, 1) : args.isomers;
        return { isomers: isomers.map(one) };
      },
    } as unknown as ChemClient;
    return { chem, asked };
  }

  /** The plugin that finds stereoisomers: `at` its centres left open, `isomers` the stereoisomers it gives, in order. */
  const opener = (at: number[], isomers: { centres: ReturnType<typeof centre>[]; doubles: [] }[]) =>
    ({
      request: async (op: string) =>
        op === "stereo_elements"
          ? { read: true, elements: at.map((a) => ({ kind: "centre", at: a, state: "unspecified" })) }
          : op === "stereoisomers"
            ? { isomers: isomers.map((configured, k) => ({ configured, smiles: `isomer ${k}` })), free: false }
            : Promise.reject(new Error(`no ${op} here`)),
    }) as unknown as ChemClient;

  it("gives each stereoisomer asked for its own, in the order asked, where one is made itself and the other as its mirror image", async () => {
    // (butan-2-ol drawn with no wedge, both its enantiomers asked for)
    const open: Model = { ...butanol("up"), bonds: butanol("up").bonds.map((b) => (b.id === 14 ? { ...b, stereo: undefined } : b)) };
    // (asked for in either order: so that the one made as a mirror image comes first in one of them)
    for (const order of [
      [1, -1],
      [-1, 1],
    ] as const) {
      const isomers = order.map((s) => ({ centres: [centre(1, [0, 2, 4], s)], doubles: [] as [] }));
      const { chem, asked } = shaper();
      const [block] = blocksOf(open, [1]);
      const made = await conformersOf(chem, opener([1], isomers), block, "all");
      // (one asked for itself, one as its mirror image)
      expect(asked).toEqual([1, 1]);
      expect(made).toHaveLength(2);
      made.forEach((c, k) => expect(hasConfiguration(c, block.part, isomers[k]), `${order} ${k}`).toBe(true));
      expect(made.map((c) => c.cip.atoms["1"])).toEqual(order.map((s) => (s > 0 ? "R" : "S")));
    }
  });

  it("asks for each stereoisomer alone, in rounds of its own, where the search is asked in rounds", async () => {
    // (butane-2,3-diol's two enantiomers and its meso form, as below: two made themselves, never asked together here)
    const diol: Model = {
      atoms: [...butanol("up").atoms, { id: 6, x: 2.6, y: -1.5, r: 0.9, el: "O" }],
      bonds: [...butanol("up").bonds.map((b) => (b.id === 14 ? { ...b, stereo: undefined } : b)), { id: 15, a: 3, b: 6, order: 1 }],
    };
    const isomers = (
      [
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const
    ).map(([p, q]) => ({ centres: [centre(1, [0, 2, 4], p), centre(2, [1, 3, 5], q)], doubles: [] as [] }));
    const { chem, asked } = shaper();
    const [block] = blocksOf(diol, [1]);
    const made = await conformersOf(chem, opener([1, 2], isomers), block, "all", {}, 10, { window: 3, first: 10, most: 5000 });
    expect(asked).toEqual([1, 1, 1]);
    expect(made).toHaveLength(3);
    // (this plugin gives no energies: each asked once, and said why)
    for (const c of made) expect(c.how?.find((r) => r.label === "Rounds")?.text).toBe("1 round, 10 tried: no energies came with them to tell a new conformer by");
  });

  it("gives each stereoisomer's rounds what is left of the ten minutes a search takes at most - all of them within it", async () => {
    // (the two enantiomers of the diol below, each try a fake six seconds, each draw a new conformer of one energy: the first takes
    //  4 rounds, 80 tries - 480 s, the next round past 600 - and the second the 120 s left, 2 rounds)
    const diol: Model = {
      atoms: [...butanol("up").atoms, { id: 6, x: 2.6, y: -1.5, r: 0.9, el: "O" }],
      bonds: [...butanol("up").bonds.map((b) => (b.id === 14 ? { ...b, stereo: undefined } : b)), { id: 15, a: 3, b: 6, order: 1 }],
    };
    const isomers = (
      [
        [1, -1],
        [-1, 1],
      ] as const
    ).map(([p, q]) => ({ centres: [centre(1, [0, 2, 4], p), centre(2, [1, 3, 5], q)], doubles: [] as [] }));
    let clock = 0;
    const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      const base = shaper();
      const chem = {
        request: async (op: string, args: { count?: number; draw?: number }) => {
          clock += (args.count ?? 0) * 6000;
          const got = (await base.chem.request(op as never, args as never)) as unknown as { isomers: { frames: number[][] }[] };
          return { isomers: got.isomers.map((c) => ({ ...c, frames: c.frames.map((f) => f.map((v, i) => (i === 0 ? v + 0.4 * (args.draw ?? 0) : v))), energies: c.frames.map(() => -1) })) };
        },
      } as unknown as ChemClient;
      const [block] = blocksOf(diol, [1]);
      const made = await conformersOf(chem, opener([1, 2], isomers), block, "all", {}, 10, { window: 3, first: 10, most: 5000 });
      expect(made.map((c) => c.how?.find((r) => r.label === "Rounds")?.text)).toEqual([
        "4 rounds, 80 tried: the 10 minutes a search takes at most",
        "2 rounds, 20 tried: the 10 minutes a search takes at most",
      ]);
    } finally {
      now.mockRestore();
    }
  });

  it("growing, shares the ten minutes among its stereoisomers' rounds - the time each ran, not the time it waited for the others", async () => {
    // (as above: each try a fake six seconds, each draw a new conformer of one energy - each first round shown at once, then the
    //  first's rounds, then the second's, each held to what the other has left of the most)
    const diol: Model = {
      atoms: [...butanol("up").atoms, { id: 6, x: 2.6, y: -1.5, r: 0.9, el: "O" }],
      bonds: [...butanol("up").bonds.map((b) => (b.id === 14 ? { ...b, stereo: undefined } : b)), { id: 15, a: 3, b: 6, order: 1 }],
    };
    const isomers = (
      [
        [1, -1],
        [-1, 1],
      ] as const
    ).map(([p, q]) => ({ centres: [centre(1, [0, 2, 4], p), centre(2, [1, 3, 5], q)], doubles: [] as [] }));
    let clock = 0;
    const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      const base = shaper();
      const chem = {
        request: async (op: string, args: { count?: number; draw?: number }) => {
          clock += (args.count ?? 0) * 6000;
          const got = (await base.chem.request(op as never, args as never)) as unknown as { isomers: { frames: number[][] }[] };
          return { isomers: got.isomers.map((c) => ({ ...c, frames: c.frames.map((f) => f.map((v, i) => (i === 0 ? v + 0.4 * (args.draw ?? 0) : v))), energies: c.frames.map(() => -1) })) };
        },
      } as unknown as ChemClient;
      const [block] = blocksOf(diol, [1]);
      const growth = await conformersGrowing(chem, opener([1, 2], isomers), block, "all", {}, { calculations: {} }, { window: 3, first: 10, most: 5000 }, () => false);
      const last: string[] = [];
      await growth.rest((k, c) => (last[k] = c.how?.find((r) => r.label === "Rounds")?.text ?? ""));
      // (the first: 60 s of the second's first round taken from its 600 - three more rounds, 420 s in all, the next past 540; the
      //  second: its 60 s, and what the first left, 120 s - one more round of 60 s, the next of 120 s past it)
      expect(last).toEqual(["4 rounds, 80 tried: the 10 minutes a search takes at most", "2 rounds, 20 tried: the 10 minutes a search takes at most"]);
    } finally {
      now.mockRestore();
    }
  });

  it("growing, gives each stereoisomer its own - one as its mirror image, reflected - as conformersOf gives them", async () => {
    const open: Model = { ...butanol("up"), bonds: butanol("up").bonds.map((b) => (b.id === 14 ? { ...b, stereo: undefined } : b)) };
    const isomers = ([1, -1] as const).map((s) => ({ centres: [centre(1, [0, 2, 4], s)], doubles: [] as [] }));
    const withEnergy = (chem: ChemClient) =>
      ({ request: async (op: string, args: never) => ({ isomers: ((await chem.request(op as never, args)) as unknown as { isomers: object[] }).isomers.map((c) => ({ ...c, energies: [-1] })) }) }) as unknown as ChemClient;
    const grown = shaper();
    const [block] = blocksOf(open, [1]);
    const growth = await conformersGrowing(withEnergy(grown.chem), opener([1], isomers), block, "all", {}, { calculations: {} }, { window: 3, first: 10, most: 5000 }, () => false);
    const whole = await conformersOf(withEnergy(shaper().chem), opener([1], isomers), block, "all", {}, 10, { window: 3, first: 10, most: 5000 });
    // (one asked for itself, one as its mirror image: each its first round, shown at once)
    expect(grown.asked).toEqual([1, 1]);
    expect(growth.first.map((c) => c.frames[0])).toEqual(whole.map((c) => c.frames[0]));
    growth.first.forEach((c, k) => expect(hasConfiguration(c, block.part, isomers[k])).toBe(true));
  });

  it("growing, makes one itself where the reflection of its mirror image has not its configuration after all", async () => {
    const twin = (["up", "down"] as const).find((s) => madeAs(butanol(s), none) === "mirror")!;
    const { chem, asked } = plugin(true);
    const [block] = blocksOf(butanol(twin), [1]);
    const growth = await conformersGrowing(chem, stereo, block, "one", {}, { calculations: {} }, { window: 3, first: 10, most: 5000 }, () => false);
    expect(asked).toHaveLength(2);
    expect(asked[1].molblock).toBe(block.molblock);
    expect(hasConfiguration(growth.first[0], block.part, none)).toBe(true);
  });

  it("asks for each stereoisomer alone where the plugin answers fewer than it was asked for", async () => {
    // (butane-2,3-diol drawn with no wedge: its two enantiomers and its meso form asked for - two of them made themselves
    //  at once. Each centre's neighbours in the order given, the same sense at both is the meso form)
    const diol: Model = {
      atoms: [...butanol("up").atoms, { id: 6, x: 2.6, y: -1.5, r: 0.9, el: "O" }],
      bonds: [...butanol("up").bonds.map((b) => (b.id === 14 ? { ...b, stereo: undefined } : b)), { id: 15, a: 3, b: 6, order: 1 }],
    };
    const isomers = (
      [
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const
    ).map(([p, q]) => ({ centres: [centre(1, [0, 2, 4], p), centre(2, [1, 3, 5], q)], doubles: [] as [] }));
    const { chem, asked } = shaper(true);
    const [block] = blocksOf(diol, [1]);
    const made = await conformersOf(chem, opener([1, 2], isomers), block, "all");
    // (the two made themselves asked together, answered one short, then each alone; the third as a mirror image)
    expect(asked.filter((n) => n === 2)).toHaveLength(1);
    expect(made).toHaveLength(3);
    made.forEach((c, k) => expect(hasConfiguration(c, block.part, isomers[k]), `${k}`).toBe(true));
  });
});
