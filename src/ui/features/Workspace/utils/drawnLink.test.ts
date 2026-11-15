import { describe, expect, it } from "vitest";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { drawnKey } from "../workflow/entries";
import { pageIndex, signatureOf } from "./drawnLink";

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

describe("a drawn structure's signature, read through the drawing's index", () => {
  it("is what it was, structure by structure, on a page of many - stars, labels, wedges, charges, masses and all", () => {
    const { model, structures } = page(
      drawnFromSmiles("C[C@H](N)C(=O)O"),
      drawnFromSmiles("[13CH3]C/C=C/C#N"),
      haptic,
      drawnFromSmiles("C1CC[N+](C)(C)CC1.[Cl-]"),
      drawnFromSmiles("OC1=CC=CC=C1"),
    );
    for (const ids of structures) expect(signatureOf(model, ids)).toBe(signatureBefore(model, ids));
    // (a label bonded to it but not asked for - Cp on the iron - and a star: reached as before)
    const iron = structures[2].filter((id) => model.atoms.find((a) => a.id === id)!.el !== "Cp");
    expect(iron.length).toBe(structures[2].length - 1);
    expect(signatureOf(model, iron)).toBe(signatureBefore(model, iron));
    // (and of a part of one, or of atoms not on the page: the same as before)
    expect(signatureOf(model, structures[0].slice(0, 3))).toBe(signatureBefore(model, structures[0].slice(0, 3)));
    expect(signatureOf(model, [999, ...structures[1]])).toBe(signatureBefore(model, [999, ...structures[1]]));
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
    expect(drawnKey(model, structures[0]).startsWith(`${signatureBefore(model, structures[0])}|`)).toBe(true);
  });
});
