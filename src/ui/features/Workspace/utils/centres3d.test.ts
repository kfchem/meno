import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import { bondLines, pictureMarks, solidOf, withCentres } from "./molecule3d";
import { blocksOf, moleculeOf } from "../chem/make3d";
import type { Conformers } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { shadedLines } from "../components/shading3d";
import { keptOf, resultsOf } from "../workflow/run";

/** (eta5-Cp)Fe-Cl in 3D, seen from the side: Fe 0, Cl 1 above it, a pentagon 2-6 below; the Fe-Cp bond as a centre. */
function cpFe(centres = true): Molecule3D {
  const ring = Array.from({ length: 5 }, (_, i) => ({ el: "C", x: 1.2 * Math.cos((2 * Math.PI * i) / 5), y: -1.7, z: 1.2 * Math.sin((2 * Math.PI * i) / 5) }));
  return {
    id: 1,
    atoms: [{ el: "Fe", x: 0, y: 0, z: 0 }, { el: "Cl", x: 0, y: 2.2, z: 0 }, ...ring],
    bonds: [{ a1: 0, a2: 1, order: 1 }, ...ring.map((_, i) => ({ a1: 2 + i, a2: 2 + ((i + 1) % 5), order: i % 2 ? 1 : 2 }))],
    at: { x: 0, y: 0 },
    ...(centres ? { centres: [{ metal: 0, atoms: [2, 3, 4, 5, 6] }] } : {}),
  };
}

describe("a bond from a metal to a ring's or double bond's centre, in 3D (eta)", () => {
  it("is one stick from the metal to the ring's centroid, after the molecule's own bonds' lines - no metal-carbon sticks", () => {
    const m = cpFe();
    const bonds = withCentres(m, m.bonds);
    expect(bonds).toHaveLength(m.bonds.length + 1);
    const places = solidOf(m, STYLE_3D).frames[0];
    const lines = bondLines({ ...m, bonds }, places, 0.1);
    const plain = bondLines({ ...m, centres: undefined }, places, 0.1);
    // the molecule's own lines as they were, and one more
    expect(lines).toHaveLength(plain.length + 1);
    lines.slice(0, plain.length).forEach((l, k) => {
      expect(l.a.distanceTo(plain[k].a)).toBeCloseTo(0, 9);
      expect(l.b.distanceTo(plain[k].b)).toBeCloseTo(0, 9);
    });
    const stick = lines[lines.length - 1];
    expect(stick.centre).toBe(true);
    expect(stick.r).toBe(0.1);
    const at = (i: number) => new THREE.Vector3(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
    expect(stick.a.distanceTo(at(0))).toBeCloseTo(0, 6);
    const centroid = [2, 3, 4, 5, 6].reduce((c, i) => c.add(at(i)), new THREE.Vector3()).divideScalar(5);
    expect(stick.b.distanceTo(centroid)).toBeCloseTo(0, 6);
    // no line from the iron to a ring atom
    for (const l of lines) for (const i of [2, 3, 4, 5, 6]) expect(l.a.distanceTo(at(0)) < 1e-6 && l.b.distanceTo(at(i)) < 1e-6).toBe(false);
  });

  it("is one stick to the middle of a double bond bound through both its atoms (eta2)", () => {
    const m: Molecule3D = {
      id: 2,
      atoms: [{ el: "Pt", x: 0, y: 0, z: 0 }, { el: "C", x: -0.7, y: 0, z: 2 }, { el: "C", x: 0.7, y: 0, z: 2 }],
      bonds: [{ a1: 1, a2: 2, order: 2 }],
      at: { x: 0, y: 0 },
      centres: [{ metal: 0, atoms: [1, 2] }],
    };
    const places = solidOf(m, STYLE_3D).frames[0];
    const lines = bondLines({ ...m, bonds: withCentres(m, m.bonds) }, places, 0.1);
    // the C=C's two lines, and the stick
    expect(lines).toHaveLength(3);
    const mid = new THREE.Vector3((places[3] + places[6]) / 2, (places[4] + places[7]) / 2, (places[5] + places[8]) / 2);
    expect(lines[2].b.distanceTo(mid)).toBeCloseTo(0, 6);
  });

  it("leaves a molecule without one exactly as it was drawn", () => {
    const m = cpFe(false);
    expect(withCentres(m, m.bonds)).toBe(m.bonds);
    // and one whose centres name atoms it does not have draws none
    const bad = { ...cpFe(), centres: [{ metal: 0, atoms: [2, 99] }] };
    expect(withCentres(bad, bad.bonds)).toEqual(bad.bonds);
  });

  it("is drawn in a picture of the molecule as a stick to the centroid, not cut back there", () => {
    const sticks = (m: Molecule3D) => pictureMarks(m, STYLE_3D).filter((k) => k.kind === "stick");
    const withIt = sticks(cpFe());
    const without = sticks(cpFe(false));
    expect(withIt).toHaveLength(without.length + 1);
    // one of them ends at the ring's centroid, as the page sees it
    const places = solidOf(cpFe(), STYLE_3D).frames[0];
    const cx = [2, 3, 4, 5, 6].reduce((t, i) => t + places[3 * i], 0) / 5;
    const cy = [2, 3, 4, 5, 6].reduce((t, i) => t + places[3 * i + 1], 0) / 5;
    const ends = withIt.flatMap((k) => (k.kind === "stick" ? [k.a, k.b] : []));
    expect(ends.some((e) => Math.hypot(e.x - cx, e.y - cy) < 1e-6)).toBe(true);
  });

  it("comes from the drawing's multi-centre bond as a molecule in 3D is made, its star no atom of it", () => {
    // Fe with a Cp bound by one bond to a star at its centre
    const ring = Array.from({ length: 5 }, (_, i) => ({ id: 2 + i, x: Math.cos((2 * Math.PI * i) / 5), y: 2 + 0.4 * Math.sin((2 * Math.PI * i) / 5), r: 0.9, el: "C" }));
    const model: Model = {
      atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "Fe" }, ...ring, { id: 7, x: 0, y: 2, r: 0.9, el: "*" }, { id: 8, x: 0, y: -1.5, r: 0.9, el: "Cl" }],
      bonds: [
        ...ring.map((a, i) => ({ id: 10 + i, a: a.id, b: ring[(i + 1) % 5].id, order: (i % 2 ? 1 : 2) as 1 | 2 })),
        { id: 20, a: 1, b: 7, order: 1 as const, coordination: true, endpoints: [2, 3, 4, 5, 6], attach: "all" as const },
        { id: 21, a: 1, b: 8, order: 1 as const },
      ],
    };
    const [block] = blocksOf(model, [1]);
    expect(block.centres).toEqual([{ metal: 0, atoms: [1, 2, 3, 4, 5] }]);
    // the plugin's answer: the block's atoms in order - the star the seventh - then an H for each ring carbon
    const atoms = [...model.atoms.map((a) => ({ el: a.el, charge: 0 })), ...ring.map(() => ({ el: "H", charge: 0 }))];
    const answer: Conformers = {
      atoms,
      bonds: [
        ...ring.map((_, i) => ({ a1: 1 + i, a2: 1 + ((i + 1) % 5), order: (i % 2 ? 1 : 2) as 1 | 2 })),
        { a1: 0, a2: 6, order: 1 },
        { a1: 0, a2: 7, order: 1 },
        ...ring.map((_, i) => ({ a1: 1 + i, a2: 8 + i, order: 1 as const })),
      ],
      frames: [atoms.flatMap((_, i) => [i, 0, 0])],
      stars: [6],
      field: "none",
      cip: { atoms: {}, bonds: {} },
      chosen: { atoms: {}, bonds: {} },
      smiles: "",
    };
    const m = moleculeOf(answer, block);
    expect(m.atoms.some((a) => a.el === "*")).toBe(false);
    // the star left out, the rest numbered on: Fe 0, ring 1-5, Cl 6
    expect(m.centres).toEqual([{ metal: 0, atoms: [1, 2, 3, 4, 5] }]);
    expect(m.bonds.some((b) => b.a1 === 0 && b.a2 >= 1 && b.a2 <= 5)).toBe(false);
  });

  it("is shaded once: a shade for each stick drawn, the molecule given as drawn or as it is", () => {
    const m: Molecule3D = {
      id: 2,
      atoms: [{ el: "Pt", x: 0, y: 0, z: 0 }, { el: "C", x: -0.7, y: 0, z: 2 }, { el: "C", x: 0.7, y: 0, z: 2 }],
      bonds: [{ a1: 1, a2: 2, order: 2 }],
      at: { x: 0, y: 0 },
      centres: [{ metal: 0, atoms: [1, 2] }],
    };
    // as the view draws it: the C=C and the stick, two bonds - and given again, still two
    const drawn = { ...m, bonds: withCentres(m, m.bonds) };
    expect(drawn.bonds).toHaveLength(2);
    expect(withCentres(drawn, drawn.bonds)).toBe(drawn.bonds);
    const places = solidOf(m, STYLE_3D).frames[0];
    const viewLines = bondLines(drawn, places, 0.1).length;
    expect(viewLines).toBe(3);
    for (const given of [drawn, m]) {
      const shaded = shadedLines(given, places, STYLE_3D);
      expect(shaded.primary.length / 7).toBe(viewLines);
      expect(shaded.secondary.length / 7).toBe(viewLines);
    }
  });

  it("is kept through a step's results: a Cp complex made for a step keeps its stick", () => {
    const m = cpFe();
    const keep = keptOf(m);
    expect(keep.centres).toEqual(m.centres);
    const xyz = m.atoms.flatMap((a) => [a.x, a.y, a.z]);
    const { molecules } = resultsOf({ ok: true, kept: [{ compound: 0, number: 1, atoms: m.atoms, bonds: m.bonds, xyz, keep }], aside: [], holds: "conformers", said: "" } as never);
    expect(molecules[0].centres).toEqual([{ metal: 0, atoms: [2, 3, 4, 5, 6] }]);
    // and one without keeps none
    expect(keptOf(cpFe(false)).centres).toBeUndefined();
  });
});
