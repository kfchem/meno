import { describe, expect, it } from "vitest";
import { readStereo, sameConfiguration } from "../../../../lib/layout/drawn";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { drawingOf, forFlatReaders } from "./drawing";
import { laidOut } from "./cleanUp";
import { MENO } from "../../../../lib/chem/style";
import heldOut from "../../../../../scripts/layout/heldout.json";

// A cage drawn in perspective is written for flat readers (a MOL file, RDKit) with a wedge at each centre; where its projection
// leaves two of a centre's bonds in one line - epibatidine's C2, its pyridyl straight on from a bridgehead - a wedge there says
// nothing surely, and Meno's own reader left it open: its H is drawn in the widest gap and wedged instead.

/** Each centre's configuration as `model` is read, by atom id; an H drawn as an atom counted as the centre's own (-1). */
function configurations(model: Model) {
  const d = drawingOf(model);
  const ids = model.atoms.map((a) => a.id);
  const isH = (i: number) => model.atoms[i].el === "H";
  const out = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  for (const [c, t] of readStereo(d.atoms, d.bonds).tetra) out.set(ids[c], { neighbours: t.neighbours.map((n) => (n < 0 || isH(n) ? -1 : ids[n])), volume: t.volume });
  return out;
}

/** `drawn` as a flat reader gets it: the atoms where they stand, the bonds and their wedges, nothing of depth. */
function flatOf(drawn: Model): Model {
  const flat = forFlatReaders(drawn) as unknown as Model;
  return { atoms: flat.atoms.map(({ id, x, y, el }) => ({ id, x, y, el, r: 0.9 })), bonds: flat.bonds } as unknown as Model;
}

const aconitine = (heldOut as { molecules: { name: string; smiles: string }[] }).molecules.find((m) => /aconitine/i.test(m.name))!.smiles;

describe("a cage written for flat readers", () => {
  for (const [name, smiles] of [
    ["epibatidine", "Clc1ccc(cn1)[C@H]1C[C@@H]2CC[C@H]1N2"],
    ["epibatidine", "[C@@H]12CC[C@@H](N1)[C@H](C2)c1ccc(Cl)nc1"],
    // (its C8's wedge, to its OH, was in line with a ring bond: the centre went unread)
    ["aconitine", aconitine],
  ]) {
    it(`says every centre the drawing shows, as the drawing has it, and cleans up: ${name}, ${smiles}`, { timeout: 120000 }, async () => {
      const drawn = drawnFromSmiles(smiles);
      const before = configurations(drawn);
      expect(before.size).toBe(name === "aconitine" ? 14 : 3);
      const strip = flatOf(drawn);
      const after = configurations(strip);
      for (const [c, t] of before) {
        const r = after.get(c);
        expect(r, `centre ${c}`).toBeDefined();
        expect(sameConfiguration(r!, t), `centre ${c}`).toBe(true);
      }
      await expect(laidOut(strip, MENO)).resolves.toBeDefined();
    });
  }

  it("draws the H it wedges instead in the widest gap round the centre, clear of every other atom and bond: epibatidine's C2, aconitine's C8", { timeout: 120000 }, () => {
    // (the eighth atom written, in each: the centre whose own wedge said nothing)
    for (const smiles of ["Clc1ccc(cn1)[C@H]1C[C@@H]2CC[C@H]1N2", aconitine]) {
      const drawn = drawnFromSmiles(smiles);
      const centre = drawn.atoms[7].id;
      const flat = forFlatReaders(drawn) as unknown as Model;
      const at = new Map(flat.atoms.map((a) => [a.id, a]));
      const c = at.get(centre)!;
      const round = flat.bonds.filter((b) => b.a === centre || b.b === centre).map((b) => at.get(b.a === centre ? b.b : b.a)!);
      const h = round.find((n) => n.el === "H" && !drawn.atoms.some((a) => a.id === n.id));
      expect(h, smiles).toBeDefined();
      const angle = (n: { x: number; y: number }) => Math.atan2(n.y - c.y, n.x - c.x);
      const others = round.filter((n) => n !== h).map(angle).sort((p, q) => p - q);
      const widest = Math.max(...others.map((v, i) => (i + 1 < others.length ? others[i + 1] : others[0] + 2 * Math.PI) - v));
      const off = (p: number, q: number) => Math.abs((((p - q) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
      const nearest = Math.min(...others.map((v) => off(angle(h!), v)));
      // (in the widest gap, 30 degrees or more from its bonds - at its middle where that is clear)
      expect(nearest, smiles).toBeGreaterThanOrEqual(Math.min(widest / 2, Math.PI / 6) - 1e-6);
      // (and clear: three quarters of a bond from every other atom, 0.4 of one from every bond not its centre's)
      const bond = median(flat.bonds.map((b) => Math.hypot(at.get(b.a)!.x - at.get(b.b)!.x, at.get(b.a)!.y - at.get(b.b)!.y)));
      const fromAtoms = Math.min(...flat.atoms.filter((a) => a.id !== h!.id && a.id !== centre).map((a) => Math.hypot(a.x - h!.x, a.y - h!.y)));
      const fromBonds = Math.min(...flat.bonds.filter((b) => b.a !== centre && b.b !== centre).map((b) => toSegment(h!, at.get(b.a)!, at.get(b.b)!)));
      expect(fromAtoms / bond, smiles).toBeGreaterThanOrEqual(0.75 - 1e-6);
      expect(fromBonds / bond, smiles).toBeGreaterThanOrEqual(0.4 - 1e-6);
    }
  });

  it("draws an H only on a centre that has one: a quaternary centre of a cage keeps its wedge as placed", { timeout: 120000 }, () => {
    for (const smiles of [
      "CC1(C)[C@@H]2CC[C@@]1(C)C(=O)C2", // camphor, C1
      "CC1(C)C(=O)[C@@]2(C)CC[C@@H]1C2", // fenchone, C1
      "C[C@]12[C@H]3CC[C@H](O3)[C@@]1(C)C(=O)OC2=O", // cantharidin
      "C[C@@H]1CC[C@H]2[C@@H](C)C(=O)O[C@@H]3O[C@@]4(C)CC[C@@H]1[C@@]23OO4", // artemisinin
      "CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5", // morphine, C13
      aconitine,
    ]) {
      const drawn = drawnFromSmiles(smiles);
      const d = drawingOf(drawn);
      const hsOf = new Map(drawn.atoms.map((a, i) => [a.id, d.atoms[i].hs]));
      const flat = forFlatReaders(drawn) as unknown as Model;
      const added = new Set(flat.atoms.filter((a) => a.el === "H" && !hsOf.has(a.id)).map((a) => a.id));
      for (const b of flat.bonds) {
        const on = added.has(b.a) ? b.b : added.has(b.b) ? b.a : null;
        if (on != null) expect(hsOf.get(on), `${smiles}: an H drawn on ${on}`).toBeGreaterThan(0);
      }
    }
  });
});

const median = (xs: number[]) => [...xs].sort((p, q) => p - q)[xs.length >> 1];

/** How far `p` is from the segment `u`-`v`. */
function toSegment(p: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }): number {
  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (u.x + t * dx), p.y - (u.y + t * dy));
}
