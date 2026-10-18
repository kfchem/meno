import { describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { MENO } from "../../../../lib/chem/style";
import { readStereo, sameConfiguration } from "../../../../lib/layout/drawn";
import { layout2D } from "../../../../lib/layout/engine";
import { key, perceive, type LayoutInput } from "../../../../lib/layout/perceive";
import type { Tetrahedral } from "../../../../lib/layout/stereo";
import { fromSmiles } from "../../../../lib/layout/testdata/fromSmiles";
import type { Bond, Model } from "../store/types";
import { degrees, drawingOf, forFlatReaders, orientFor } from "./drawing";
import { layoutJob } from "./engineLayout";

/**
 * A SMILES drawn as a paste or Quick Add draws one (fromSmiles.ts): read,
 * drawn flat with its wedges, read in as a MOL file, and laid out by the
 * engine. The plugin's part - reading the SMILES and drawing it flat - is
 * stood in for by Meno's own reading of it, an H written as an atom
 * ("[H]") taken as its centre's own, as a SMILES reader takes it, and the
 * engine's flat drawing, the H it draws on a ring fusion written out as an
 * atom with its wedge: what is looked at is that every centre comes through
 * to the drawing as given, whichever way the SMILES was written.
 */
vi.mock("../../../../lib/roles/worker", () => ({
  chemWorker: async () => ({ request: async (_op: string, { smiles }: { smiles: string }) => ({ molblock: flatMolfile(smiles) }) }),
}));

const atom = (id: number, x: number, y: number, el: string) => ({ id, x, y, r: 0.9, el });

/** The structure `smiles` says, drawn flat with the wedges that say its centres, as a MOL file. */
function flatMolfile(smiles: string): string {
  const input = withoutH(fromSmiles(smiles));
  const out = layout2D(input);
  const k = NOMINAL_BOND_LENGTH;
  const atoms = input.atoms.map((a, i) => atom(i + 1, out.x[i] * k, out.y[i] * k, a.el));
  const bonds: Bond[] = input.bonds.map((b, i) => ({ id: 1000 + i, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 }));
  const hOf = new Map(
    out.hydrogens.map((h) => {
      const id = 500 + atoms.length;
      atoms.push(atom(id, h.at.x * k, h.at.y * k, "H"));
      bonds.push({ id: id + 1000, a: h.on + 1, b: id, order: 1 });
      return [h.on, id] as const;
    }),
  );
  for (const w of out.wedges) {
    const to = w.to === -1 ? hOf.get(w.from)! : w.to + 1;
    const i = bonds.findIndex((b) => (b.a === w.from + 1 && b.b === to) || (b.a === to && b.b === w.from + 1));
    bonds[i] = { ...bonds[i], stereo: w.stereo, stereoOrient: orientFor(bonds[i], w.from + 1, degrees(bonds)) };
  }
  // (a cage the engine draws in perspective, said with wedges: a file is flat)
  const drawn: Model = {
    atoms: atoms.map((a, i) => ({
      ...a,
      ...(i < input.atoms.length && out.depth[i] != null ? { z: out.depth[i]! * k } : {}),
      ...(i < input.atoms.length && out.solid[i] && input.atoms[i].tetra ? { stereoCentre: true } : {}),
    })),
    bonds,
  };
  const flat = forFlatReaders(drawn);
  return writeMolfile({ atoms: flat.atoms.map(({ id, x, y, el }) => atom(id, x, y, el)), bonds: flat.bonds });
}

/** `input` with each H written as an atom taken as its centre's own: an implicit H, -1 in the configuration. */
function withoutH(input: LayoutInput): LayoutInput {
  const degree = degreesOf(input);
  const isH = (i: number) => input.atoms[i].el === "H" && degree[i] === 1;
  const kept = input.atoms.map((_, i) => i).filter((i) => !isH(i));
  const at = new Map(kept.map((i, k) => [i, k]));
  const extra = input.atoms.map(() => 0);
  for (const b of input.bonds) {
    if (isH(b.a)) extra[b.b]++;
    else if (isH(b.b)) extra[b.a]++;
  }
  const centres = centresOf(input);
  return {
    atoms: kept.map((i, k) => {
      const { tetra: _t, ...a } = input.atoms[i];
      return { ...a, hs: (a.hs ?? 0) + extra[i], ...(centres[k] ? { tetra: centres[k] } : {}) };
    }),
    bonds: input.bonds
      .filter((b) => !isH(b.a) && !isH(b.b))
      .map(({ stereo, ...b }) => ({
        ...b,
        a: at.get(b.a)!,
        b: at.get(b.b)!,
        // (a double bond's cis or trans, against the atoms kept: none of these molecules has one against an H)
        ...(stereo && at.has(stereo.refs[0]) && at.has(stereo.refs[1]) ? { stereo: { ...stereo, refs: [at.get(stereo.refs[0])!, at.get(stereo.refs[1])!] as const } } : {}),
      })),
  };
}

const degreesOf = (input: LayoutInput) => {
  const degree = input.atoms.map(() => 0);
  for (const b of input.bonds) {
    degree[b.a]++;
    degree[b.b]++;
  }
  return degree;
};

/** `input` with each H written as an atom taken as its centre's own: its centres' configurations, the H last as -1, by the other atoms' order. */
function centresOf(input: LayoutInput): (Tetrahedral | undefined)[] {
  const degree = degreesOf(input);
  const isH = (i: number) => input.atoms[i].el === "H" && degree[i] === 1;
  const kept = input.atoms.map((_, i) => i).filter((i) => !isH(i));
  const at = new Map(kept.map((i, k) => [i, k]));
  return kept.map((i) => {
    const t = input.atoms[i].tetra;
    if (!t) return undefined;
    const order = t.neighbours.map((n) => (n === -1 || isH(n) ? -1 : at.get(n)!));
    const h = order.indexOf(-1);
    if (h < 0) return { neighbours: order, volume: t.volume };
    // (each place the H moves to get last turns the sense)
    const moves = order.length - 1 - h;
    return { neighbours: [...order.slice(0, h), ...order.slice(h + 1), -1], volume: (moves % 2 ? -t.volume : t.volume) as 1 | -1 };
  });
}

async function pasted(smiles: string) {
  const { structureFromSmiles } = await import("./fromSmiles");
  const model = await structureFromSmiles(smiles, MENO);
  const job = layoutJob(model);
  return { model, job, centres: centresOf(job.input) };
}

/** Every centre `smiles` gives, read off the drawing as given; and each one at a ring fusion drawn flat - its bonds to other atoms all ring bonds - shown by an H drawn with a wedge or hashes. */
async function expectAsGiven(smiles: string, label: string) {
  const given = centresOf(fromSmiles(smiles));
  const { model, job, centres } = await pasted(smiles);
  expect(centres.length, label).toBe(given.length);
  const count = given.filter(Boolean).length;
  expect(count, label).toBeGreaterThan(0);
  given.forEach((t, i) => {
    if (!t) return;
    expect(centres[i], `${label}: centre ${i} read`).toBeDefined();
    expect(sameConfiguration(t, centres[i]!), `${label}: centre ${i} as given`).toBe(true);
  });
  // the fusion centres: an H drawn, on a wedge or hashes
  const mol = perceive(job.input);
  const ids = model.atoms.map((a) => a.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const fusions: number[] = [];
  job.input.atoms.forEach((a, i) => {
    if (!a.tetra || !a.tetra.neighbours.includes(-1)) return;
    if (!a.tetra.neighbours.every((n) => n === -1 || mol.ringBonds.has(key(i, n)))) return;
    if (model.atoms[index.get(job.ids[i])!].stereoCentre) return;
    fusions.push(i);
    const hs = job.folded.get(i) ?? [];
    expect(hs.length, `${label}: an H drawn on fusion centre ${i}`).toBe(1);
    const bond = model.bonds.find((b) => (b.a === hs[0] || b.b === hs[0]) && (b.a === job.ids[i] || b.b === job.ids[i]))!;
    expect(bond.stereo === "up" || bond.stereo === "down", `${label}: the H on fusion centre ${i} wedged`).toBe(true);
  });
  return { model, job, fusions, count };
}

// taxol as PubChem gives it (CID 36314), and with each centre's H written as an atom
const TAXOL =
  "CC1=C2[C@H](C(=O)[C@@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C";
const TAXOL_H =
  "[H][C@]1(OC(C)=O)C(=O)[C@@]2(C)[C@]([H])([C@]([H])(OC(=O)c3ccccc3)[C@]3(O)C[C@]([H])(OC(=O)[C@]([H])(O)[C@@]([H])(NC(=O)c4ccccc4)c4ccccc4)C(C)=C1C3(C)C)[C@]1(OC(C)=O)CO[C@]1([H])C[C@]2([H])O";
const TETRODOTOXIN = "C([C@@]1([C@H]2[C@@H]3[C@H](N=C(N[C@@]34[C@@H]([C@@H]1O[C@]([C@H]4O)(O2)O)O)N)O)O)O";
const TETRODOTOXIN_H = "[H][C@@]1(O)[C@@]2(O)O[C@@]3([H])[C@@]([H])(O)[C@@]14NC(N)=N[C@]([H])(O)[C@@]4([H])[C@@]([H])(O2)[C@@]3(O)CO";

describe("a SMILES's ring-fusion centres, pasted", () => {
  it("shows every one of taxol's centres as given, C3 and C5 by an H, written either way", async () => {
    for (const [label, smiles] of [["taxol", TAXOL], ["taxol, H written", TAXOL_H]]) {
      const { count, fusions } = await expectAsGiven(smiles, label);
      expect(count, label).toBe(11);
      // (C3 - between C2, C4 and C8 - and C5, in the oxetane: the two whose bonds are all ring bonds)
      expect(fusions, label).toHaveLength(2);
    }
  }, 30_000);

  it("leaves a centre the SMILES leaves undefined undefined - drawn flat with no wedge, never guessed - and the rest as given", async () => {
    // (taxol with C3's configuration left out of the SMILES)
    const open = TAXOL.replace("[C@]([C@H]3[C@@H](", "[C@](C3[C@@H](");
    expect(open).not.toBe(TAXOL);
    const given = centresOf(fromSmiles(open));
    const { model, job, centres } = await pasted(open);
    expect(given.filter(Boolean)).toHaveLength(10);
    given.forEach((t, i) => {
      if (t) expect(sameConfiguration(t, centres[i]!), `centre ${i} as given`).toBe(true);
      else expect(centres[i], `atom ${i}: no configuration made up`).toBeUndefined();
    });
    // (and no wedge, nor a wedged H, at the centre left undefined)
    const c3 = given.findIndex((t, i) => !t && job.input.atoms[i].el === "C" && fromSmiles(TAXOL).atoms[i]?.tetra);
    expect(c3).toBeGreaterThanOrEqual(0);
    const id = job.ids[c3];
    const wedged = model.bonds.filter((b) => (b.a === id || b.b === id) && (b.stereo === "up" || b.stereo === "down"));
    expect(wedged).toHaveLength(0);
  }, 30_000);

  it("shows cis- and trans-decalin's and -hydrindane's fusion as given, each fusion centre by an H", async () => {
    const cases: [string, string][] = [
      ["cis-decalin", "C1CC[C@H]2CCCC[C@H]2C1"],
      ["trans-decalin", "C1CC[C@@H]2CCCC[C@H]2C1"],
      ["cis-decalin, H written", "[H][C@]12CCCC[C@@]1([H])CCCC2"],
      ["trans-decalin, H written", "[H][C@]12CCCC[C@]1([H])CCCC2"],
      ["cis-hydrindane", "C1CC[C@H]2CCC[C@H]2C1"],
      ["trans-hydrindane", "C1CC[C@H]2CCC[C@@H]2C1"],
      ["cis-hydrindane, H written", "[H][C@@]12CCCC[C@]1([H])CCC2"],
      ["trans-hydrindane, H written", "[H][C@@]12CCCC[C@@]1([H])CCC2"],
    ];
    for (const [label, smiles] of cases) {
      const { fusions, model } = await expectAsGiven(smiles, label);
      expect(fusions, label).toHaveLength(2);
      // cis: both H on the same side, both wedges or both hashes; trans: one of each
      const marks = model.bonds.filter((b) => b.stereo === "up" || b.stereo === "down").map((b) => b.stereo);
      expect(marks, label).toHaveLength(2);
      expect(marks[0] === marks[1], label).toBe(label.startsWith("cis"));
    }
  }, 30_000);

  it("keeps tetrodotoxin's C4 shown by the drawing in perspective, with no wedge, written either way", async () => {
    // (the maintainer's ruling: a centre of a solid that the drawing reads
    // right by its depth gets no wedge; the shape shows it)
    for (const [label, smiles, c4] of [
      ["tetrodotoxin", TETRODOTOXIN, 4],
      ["tetrodotoxin, H written", TETRODOTOXIN_H, 13],
    ] as const) {
      const { model, job } = await expectAsGiven(smiles, label);
      const id = job.ids[c4];
      expect(model.atoms.find((a) => a.id === id)!.stereoCentre, label).toBe(true);
      expect(model.bonds.some((b) => (b.a === id || b.b === id) && (b.stereo === "up" || b.stereo === "down")), label).toBe(false);
      // and read as a reader of the drawing reads it: every centre (expectAsGiven), C4 among them
      const d = drawingOf(model);
      expect(readStereo(d.atoms, d.bonds).tetra.has(model.atoms.findIndex((a) => a.id === id)), label).toBe(true);
    }
  }, 30_000);
});
