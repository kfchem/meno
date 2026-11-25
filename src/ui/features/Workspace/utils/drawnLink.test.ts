import { describe, expect, it } from "vitest";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { drawnKey } from "../workflow/entries";
import { linkOf, pageIndex, signatureOf } from "./drawnLink";
import { laidOut } from "../chem/cleanUp";
import { MENO } from "../../../../lib/chem/style";
import { keptFrom, withKept } from "../configuration/kept";
import { readingOf } from "../configuration/changes";
import { identityOfDrawn } from "../chem/identityOf";

/** signatureOf as it was before it read through the drawing's index (`pageIndex`): what it gives now is held to it. */
function signatureBefore(model: Model, ids: Iterable<number>): string {
  const of = new Set(ids);
  // (a haptic bond's star with the metal it is bound to: no atom of a
  // molecule in 3D, so not among its drawing's atoms, but of the structure
  // as its bond is - else every complex so bound read as drawn otherwise)
  for (const b of model.bonds) {
    if (!b.endpoints?.length) continue;
    for (const [star, other] of [
      [b.b, b.a],
      [b.a, b.b],
    ]) {
      if (of.has(other) && model.atoms.some((a) => a.id === star && a.el === "*")) of.add(star);
    }
  }
  // (and a label bonded to it - Cp, cod - written out for the plugin: where it is bound through a pi system, its place in
  // the structure asked about is that system's star, no atom of the molecule in 3D, so no atom the molecule is tied to;
  // of the structure all the same, as the bond to it is - else every complex so labelled read as drawn otherwise)
  const label = (a: Model["atoms"][number]) => !!a.abbrev || (a.el !== "*" && !isElementSymbol(a.el));
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  for (let grew = true; grew; ) {
    grew = false;
    for (const b of model.bonds) {
      for (const [x, y] of [
        [b.a, b.b],
        [b.b, b.a],
      ]) {
        const other = byId.get(y);
        if (of.has(x) && !of.has(y) && other && label(other)) {
          of.add(y);
          grew = true;
        }
      }
    }
  }
  const atoms = model.atoms
    .filter((a) => of.has(a.id))
    .map((a) => `${a.id}:${a.el}:${a.charge ?? 0}:${a.isotope ?? ""}`)
    .sort();
  const bonds = model.bonds
    .filter((b) => of.has(b.a) || of.has(b.b))
    .map((b) => {
      const ends = of.has(b.a) && of.has(b.b) ? `${b.a}-${b.b}` : of.has(b.a) ? `${b.a}-out` : `${b.b}-out`;
      // (and what a haptic bond binds)
      const binds = b.endpoints?.length ? `:${[...b.endpoints].sort((p, q) => p - q).join(" ")}` : "";
      return `${ends}:${b.order}:${b.stereo ?? "none"}${binds}`;
    })
    .sort();
  return [...atoms, "|", ...bonds].join(",");
}


/** Drawings side by side on one page, each numbered on from the one before: the page's structures by their atoms. */
function page(...drawings: Model[]): { model: Model; structures: number[][] } {
  const model: Model = { atoms: [], bonds: [] };
  const structures: number[][] = [];
  let next = 1;
  drawings.forEach((d, k) => {
    const id = new Map(d.atoms.map((a) => [a.id, next++]));
    model.atoms.push(...d.atoms.map((a) => ({ ...a, id: id.get(a.id)!, x: a.x + 20 * k })));
    model.bonds.push(...d.bonds.map((b) => ({ ...b, id: next++, a: id.get(b.a)!, b: id.get(b.b)!, ...(b.endpoints ? { endpoints: b.endpoints.map((e) => id.get(e)!) } : {}) })));
    structures.push(d.atoms.filter((a) => a.el !== "*").map((a) => id.get(a.id)!));
  });
  return { model, structures };
}

/** A metal bound to a ring through all its atoms - a star at its centre, the bond's endpoints the ring's - and a label bonded to it. */
const haptic: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "Fe" },
    { id: 2, x: 0, y: 1.5, r: 0.9, el: "*" },
    ...[3, 4, 5, 6, 7].map((id, i) => ({ id, x: Math.cos(i) , y: 1.5 + Math.sin(i), r: 0.9, el: "C" })),
    { id: 8, x: 0, y: -1.5, r: 0.9, el: "Cp", abbrev: { atoms: [], bonds: [] } as never },
    { id: 9, x: 1.5, y: 0, r: 0.9, el: "Cl", charge: -1 },
  ] as never,
  bonds: [
    { id: 20, a: 1, b: 2, order: 1, endpoints: [3, 4, 5, 6, 7] },
    { id: 21, a: 3, b: 4, order: 1 }, { id: 22, a: 4, b: 5, order: 2 }, { id: 23, a: 5, b: 6, order: 1 }, { id: 24, a: 6, b: 7, order: 2 }, { id: 25, a: 7, b: 3, order: 1 },
    { id: 26, a: 1, b: 8, order: 1 },
    { id: 27, a: 1, b: 9, order: 1, stereo: "up" },
  ] as never,
};

/**
 * A signature's atoms and bonds as they were before the configurations read from the drawing came into it: those left off,
 * and each bond's wedge with them (a wedge whose configuration is read is no longer in it on its own).
 */
const atomsAndBonds = (key: string) => unwedged(key.split(",|,").slice(0, 2).join(",|,"));
const unwedged = (key: string) => key.replace(/:(up|down|wavy|either|none)(?=[,:]|$)/g, "");

describe("a drawn structure's signature, read through the drawing's index", () => {
  it("is what it was, structure by structure, on a page of many - stars, labels, wedges, charges, masses and all", () => {
    const { model, structures } = page(
      drawnFromSmiles("C[C@H](N)C(=O)O"),
      drawnFromSmiles("[13CH3]C/C=C/C#N"),
      haptic,
      drawnFromSmiles("C1CC[N+](C)(C)CC1.[Cl-]"),
      drawnFromSmiles("OC1=CC=CC=C1"),
    );
    for (const ids of structures) expect(atomsAndBonds(signatureOf(model, ids))).toBe(unwedged(signatureBefore(model, ids)));
    // (a label bonded to it but not asked for - Cp on the iron - and a star: reached as before)
    const iron = structures[2].filter((id) => model.atoms.find((a) => a.id === id)!.el !== "Cp");
    expect(iron.length).toBe(structures[2].length - 1);
    expect(atomsAndBonds(signatureOf(model, iron))).toBe(unwedged(signatureBefore(model, iron)));
    // (and of a part of one, or of atoms not on the page: the same as before)
    expect(atomsAndBonds(signatureOf(model, structures[0].slice(0, 3)))).toBe(unwedged(signatureBefore(model, structures[0].slice(0, 3))));
    expect(atomsAndBonds(signatureOf(model, [999, ...structures[1]]))).toBe(unwedged(signatureBefore(model, [999, ...structures[1]])));
  });

  it("reads the drawing once: its index is the same for every structure asked of it, another for another drawing", () => {
    const { model } = page(drawnFromSmiles("CCO"), drawnFromSmiles("CCN"));
    expect(pageIndex(model)).toBe(pageIndex(model));
    expect(pageIndex({ ...model })).not.toBe(pageIndex(model));
    expect(pageIndex(model).bondsOf.get(2)?.length).toBe(2);
  });

  it("keys a part of a structure by its own bonds alone: a double bond or a wedge leaving it is none of its", () => {
    const { model, structures } = page(drawnFromSmiles("C/C=C/C"), drawnFromSmiles("C[C@H](N)O"));
    const said = (key: string) => key.slice(key.lastIndexOf("|"));
    for (const ids of [structures[0].slice(0, 2), structures[1].slice(0, 1), structures[1].slice(2)]) {
      const of = new Set(ids);
      const alone: Model = { atoms: model.atoms.filter((a) => of.has(a.id)), bonds: model.bonds.filter((b) => of.has(b.a) && of.has(b.b)) };
      expect(said(drawnKey(model, ids))).toBe(said(drawnKey(alone, ids)));
    }
  });

  it("keys a structure's drawing as before, read through the same index", () => {
    const { model, structures } = page(drawnFromSmiles("C[C@H](N)C(=O)O"), drawnFromSmiles("C/C=C/C"));
    // (a wedge's neighbours in order round it, and each neighbour's side of a double bond: there, and not where nothing is)
    expect(drawnKey(model, structures[0])).toMatch(/\|.*w\d+:/);
    expect(drawnKey(model, structures[1])).toMatch(/~\d+:-?1/);
    expect(drawnKey(model, structures[0]).startsWith(`${signatureOf(model, structures[0])}|`)).toBe(true);
    expect(atomsAndBonds(signatureOf(model, structures[0]))).toBe(unwedged(signatureBefore(model, structures[0])));
  });
});

describe("each configuration a drawing states, in what it states to its molecules in 3D", () => {
  type A = { id: number; el: string; x: number; y: number };
  const model = (atoms: A[], bonds: [number, number, number, string?][]): Model =>
    ({
      atoms: atoms.map((a) => ({ ...a, r: 0.9 })),
      bonds: bonds.map(([a, b, order, stereo], k) => ({ id: 100 + k, a, b, order, stereo: stereo ?? "none", ...(stereo && stereo !== "none" ? { narrow: a } : {}) })),
    }) as Model;
  const link = (drawn: Model, now: Model) => {
    const ids = drawn.atoms.map((a) => a.id);
    return linkOf({ drawnFrom: ids, drawnAs: signatureOf(drawn, ids) }, now);
  };
  const turn = (m: Model, t: number): Model => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, x: a.x * Math.cos(t) - a.y * Math.sin(t), y: a.x * Math.sin(t) + a.y * Math.cos(t) })) });

  it("(Z)-but-2-ene made (E) by moving a methyl is another; turned whole it is the same", () => {
    const zMe = (x4: number, y4: number) =>
      model(
        [
          { id: 1, el: "C", x: -1.3, y: 0.75 },
          { id: 2, el: "C", x: -0.65, y: 0 },
          { id: 3, el: "C", x: 0.65, y: 0 },
          { id: 4, el: "C", x: x4, y: y4 },
        ],
        [
          [1, 2, 1],
          [2, 3, 2],
          [3, 4, 1],
        ],
      );
    const z = zMe(1.3, 0.75);
    expect(link(z, z)).toBe("live");
    expect(link(z, turn(z, 1))).toBe("live");
    expect(link(z, zMe(1.3, -0.75))).toBe("changed");
  });

  it("butan-2-ol's methyl and ethyl exchanged in place, its OH wedged, is the other enantiomer; so is its OH hashed in place; turned whole it is the same", () => {
    // (C2 at the origin: OH up on a wedge, H not drawn; C1 and C3 to either side, C4 on from C3)
    const butanol = (me: [number, number], et: [number, number], oh: "up" | "down" = "up") =>
      model(
        [
          { id: 1, el: "C", x: me[0], y: me[1] },
          { id: 2, el: "C", x: 0, y: 0 },
          { id: 3, el: "C", x: et[0], y: et[1] },
          { id: 4, el: "C", x: et[0] * 2, y: et[1] },
          { id: 5, el: "O", x: 0, y: 1.5 },
        ],
        [
          [2, 1, 1],
          [2, 3, 1],
          [3, 4, 1],
          [2, 5, 1, oh],
        ],
      );
    const r = butanol([-1.3, -0.75], [1.3, -0.75]);
    expect(link(r, r)).toBe("live");
    expect(link(r, butanol([1.3, -0.75], [-1.3, -0.75]))).toBe("changed");
    expect(link(r, butanol([-1.3, -0.75], [1.3, -0.75], "down"))).toBe("changed");
    expect(link(r, turn(r, 2))).toBe("live");
    // (its H drawn: the OH wedged, or the H hashed in its place - one centre, one compound, as Clean-up may draw it)
    const withH = (oh: string, h: string) =>
      model(
        [
          { id: 1, el: "C", x: -1.3, y: -0.75 },
          { id: 2, el: "C", x: 0, y: 0 },
          { id: 3, el: "C", x: 1.3, y: -0.75 },
          { id: 4, el: "C", x: 2.6, y: -0.75 },
          { id: 5, el: "O", x: -0.5, y: 1.4 },
          { id: 6, el: "H", x: 0.6, y: 1.3 },
        ],
        [
          [2, 1, 1],
          [2, 3, 1],
          [3, 4, 1],
          [2, 5, 1, oh],
          [2, 6, 1, h],
        ],
      );
    expect(link(withH("up", "none"), withH("none", "down"))).toBe("live");
    expect(link(withH("up", "none"), withH("none", "up"))).toBe("changed");
    // (the molecule made from the drawing with no H drawn; Clean-up then draws one on the centre and hashes it: the same)
    const noH = (m: Model): Model => ({ atoms: m.atoms.filter((a) => a.id !== 6), bonds: m.bonds.filter((b) => b.b !== 6) });
    const made = noH(withH("up", "none"));
    const madeIds = made.atoms.map((a) => a.id);
    const keyed = { drawnFrom: madeIds, drawnAs: signatureOf(made, madeIds) };
    expect(linkOf(keyed, withH("none", "down"))).toBe("live");
    expect(linkOf(keyed, withH("none", "up"))).toBe("changed");
  });
});

describe("a drawing that keeps its configuration, in what it states to its molecules in 3D", () => {
  it("states what identity takes - the centre kept, not a wedge turned under it; kept anew, the other hand", () => {
    // (butan-2-ol: C2 at the origin, its OH on a wedge towards the viewer at the top, its H not drawn and so behind; the ethyl
    //  lower right, the methyl lower left. From the front, OH, ethyl, methyl - first, second, third by CIP - run clockwise: R)
    const butanol = (oh: "up" | "down"): Model =>
      ({
        atoms: [
          { id: 1, el: "C", x: -1.3, y: -0.75 },
          { id: 2, el: "C", x: 0, y: 0 },
          { id: 3, el: "C", x: 1.3, y: -0.75 },
          { id: 4, el: "C", x: 2.6, y: -0.75 },
          { id: 5, el: "O", x: 0, y: 1.5 },
        ].map((a) => ({ ...a, r: 0.9 })),
        bonds: [
          { id: 100, a: 2, b: 1, order: 1, stereo: "none" },
          { id: 101, a: 2, b: 3, order: 1, stereo: "none" },
          { id: 102, a: 3, b: 4, order: 1, stereo: "none" },
          { id: 103, a: 2, b: 5, order: 1, stereo: oh, narrow: 2 },
        ],
      }) as Model;
    const ids = [1, 2, 3, 4, 5];
    const keep = (m: Model) => withKept(m, new Set(ids), keptFrom(m, readingOf(m)));
    const r = keep(butanol("up"));
    const made = { drawnFrom: ids, drawnAs: signatureOf(r, ids) };
    expect(linkOf(made, r)).toBe("live");
    // (the wedge turned to a hash with R still kept, as a move of Meno's own that turned it would leave it: the marks now read S,
    //  identity takes the kept R - and the link says what identity says: the same compound)
    const turnedUnder: Model = { ...r, bonds: r.bonds.map((b) => (b.id === 103 ? { ...b, stereo: "down" } : b)) };
    expect(identityOfDrawn(turnedUnder).text).toBe(identityOfDrawn(r).text);
    expect(linkOf(made, turnedUnder)).toBe("live");
    // (the same drawing kept anew, as a chemist's own edit keeps it: S, the other enantiomer, for identity and the link alike)
    const s = keep(butanol("down"));
    expect(identityOfDrawn(s).text).not.toBe(identityOfDrawn(r).text);
    expect(linkOf(made, s)).toBe("changed");
  });
});

describe("a cage Clean-up draws in perspective, its centres stated by depth with no wedge", () => {
  it("borneol cleaned up is still the drawing its molecule in 3D was made from; mirrored, it is the other hand", { timeout: 120000 }, async () => {
    const drawn = drawnFromSmiles("CC1(C)[C@@H]2CC[C@@]1(C)[C@H](O)C2");
    const ids = drawn.atoms.map((a) => a.id);
    const made = { drawnFrom: ids, drawnAs: signatureOf(drawn, ids) };
    const cleaned = await laidOut(drawn, MENO);
    // (drawn in perspective: places in depth, no wedge left)
    expect(cleaned.atoms.some((a) => a.z != null)).toBe(true);
    expect(cleaned.bonds.filter((b) => b.stereo === "up" || b.stereo === "down")).toEqual([]);
    expect(linkOf(made, cleaned)).toBe("live");
    const mirrored: Model = { ...cleaned, atoms: cleaned.atoms.map((a) => ({ ...a, x: -a.x })) };
    expect(linkOf(made, mirrored)).toBe("changed");
  });
});

describe("a structure that states no configuration keeps its key", () => {
  const key = (m: Model) => signatureOf(m, m.atoms.map((a) => a.id));
  /** `m` with the bond from the first `centre` atom to the first `other` atom marked `stereo`, narrow at that atom. */
  const marked = (m: Model, centre: string, other: string, stereo: "up" | "down" | "wavy"): Model => {
    const o = m.atoms.find((a) => a.el === other)!;
    const b = m.bonds.find((x) => (x.a === o.id || x.b === o.id) && m.atoms.find((a) => a.id === (x.a === o.id ? x.b : x.a))!.el === centre)!;
    const c = b.a === o.id ? b.b : b.a;
    return { ...m, bonds: m.bonds.map((x) => (x === b ? { ...x, a: c, b: o.id, stereo, narrow: c } : x)) } as Model;
  };

  it("no wedge, no hash, no wavy line and no side of a double bond stated: its atoms and bonds, each bond's order and none", () => {
    // (each structure's atoms numbered from 1 as written; the key's text is held as it stands, so a molecule made from it, its lasting
    //  id in a set and the keys of results made from it stay theirs)
    const cases: [string, string][] = [
      ["CCO", "1:C:0:,2:C:0:,3:O:0:,|,1-2:1:none,2-3:1:none"],
      ["C=CC", "1:C:0:,2:C:0:,3:C:0:,|,1-2:2:none,2-3:1:none"],
      ["C1=CC=CC=C1", "1:C:0:,2:C:0:,3:C:0:,4:C:0:,5:C:0:,6:C:0:,|,1-2:2:none,1-6:1:none,2-3:1:none,3-4:2:none,4-5:1:none,5-6:2:none"],
      ["CC(=O)O", "1:C:0:,2:C:0:,3:O:0:,4:O:0:,|,1-2:1:none,2-3:2:none,2-4:1:none"],
      // (but-2-ene drawn in a line: neither side of its double bond stated)
      ["CC=CC", "1:C:0:,2:C:0:,3:C:0:,4:C:0:,|,1-2:1:none,2-3:2:none,3-4:1:none"],
      ["CC(O)CC", "1:C:0:,2:C:0:,3:O:0:,4:C:0:,5:C:0:,|,1-2:1:none,2-3:1:none,2-4:1:none,4-5:1:none"],
      ["CC(C)O", "1:C:0:,2:C:0:,3:C:0:,4:O:0:,|,1-2:1:none,2-3:1:none,2-4:1:none"],
    ];
    for (const [smiles, text] of cases) expect(key(drawnFromSmiles(smiles))).toBe(text);
  });

  it("a configuration stated makes another key: a wedge at a centre, a side of a double bond drawn; a wavy line is kept as drawn", () => {
    expect(key(drawnFromSmiles("C[C@H](O)CC"))).not.toBe(key(drawnFromSmiles("CC(O)CC")));
    expect(key(drawnFromSmiles("C[C@H](N)C(=O)O"))).not.toBe(key(drawnFromSmiles("CC(N)C(=O)O")));
    expect(key(drawnFromSmiles("C/C=C/C"))).not.toBe(key(drawnFromSmiles("CC=CC")));
    expect(key(marked(drawnFromSmiles("CC(O)CC"), "C", "O", "wavy"))).toBe("1:C:0:,2:C:0:,3:O:0:,4:C:0:,5:C:0:,|,1-2:1:none,2-3:1:wavy,2-4:1:none,4-5:1:none");
  });

  it("a wedge that sets nothing - at propan-2-ol's CH - states nothing: the key of the structure drawn without it", () => {
    const plain = drawnFromSmiles("CC(C)O");
    expect(key(marked(plain, "C", "O", "up"))).toBe(key(plain));
    expect(key(marked(plain, "C", "O", "down"))).toBe(key(plain));
    // (at butan-2-ol's CH it sets the hand: the other key, one for each hand)
    const butanol = drawnFromSmiles("CC(O)CC");
    expect(key(marked(butanol, "C", "O", "up"))).not.toBe(key(butanol));
    expect(key(marked(butanol, "C", "O", "up"))).not.toBe(key(marked(butanol, "C", "O", "down")));
  });
});
