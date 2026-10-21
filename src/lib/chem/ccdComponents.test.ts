import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readComponent, type Component } from "./ccd";
import { hydrogensFromComponent, type ResidueAtom } from "./ccdHydrogens";
import { hydrogensRoom, protonationSites } from "./protonation";

// Five components as the wwPDB's Chemical Component Dictionary gives them
// (testdata/ccd/README.md), each read as a PDB entry's residue would be -
// its heavy atoms, turned and shifted, its orders and charges the CCD's -
// and given the CCD's hydrogens. The known answers: each component's own
// formula, its hydrogens' places in its ideal shape, and the form its
// orders and charges draw.

const component = (id: string): Component => readComponent(readFileSync(new URL(`./testdata/ccd/${id}.cif`, import.meta.url), "utf8"))!;

/** A turn about an axis, then a shift. */
function moved(p: { x: number; y: number; z: number }) {
  const [c, s] = [Math.cos(0.9), Math.sin(0.9)];
  // (about z, then a shift)
  return { x: c * p.x - s * p.y + 12, y: s * p.x + c * p.y - 7, z: p.z + 31 };
}

/** A component's heavy atoms as an entry's residue, moved; their bonds and charges, by place. */
function residueOf(c: Component) {
  const heavy = c.atoms.filter((a) => a.element !== "H");
  const at = new Map(heavy.map((a, i) => [a.name, i]));
  return {
    heavy,
    residue: heavy.map((a): ResidueAtom => ({ name: a.name, el: a.element, ...moved(a.at!) })),
    atoms: heavy.map((a) => ({ el: a.element, ...(a.charge ? { charge: a.charge } : {}) })),
    bonds: c.bonds.filter((b) => at.has(b.a) && at.has(b.b)).map((b) => ({ a1: at.get(b.a)!, a2: at.get(b.b)!, order: b.order! })),
  };
}

/** The hydrogens in a component's formula: "C2 H3 O2" has 3. */
const formulaHydrogens = (id: string) => Number(/"[^"]*\bH(\d+)/.exec(readFileSync(new URL(`./testdata/ccd/${id}.cif`, import.meta.url), "utf8"))![1]);

describe("the CCD's components given their hydrogens", () => {
  it.each(["ACT", "GLY", "ATP", "HEM", "STI"])("%s: each of its formula's hydrogens, where its ideal shape has it", (id) => {
    const c = component(id);
    const { residue } = residueOf(c);
    const given = hydrogensFromComponent(residue, new Set(), c);
    if ("why" in given) throw new Error(given.why);
    expect(given).toHaveLength(formulaHydrogens(id));
    for (const h of given) {
      const p = moved(c.atoms.find((a) => a.name === h.name)!.at!);
      expect(Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z)).toBeLessThan(1e-6);
    }
  });

  it.each(["ACT", "GLY", "ATP", "STI"])("%s: its hydrogens fill each atom's valence, as its orders and charges leave room", (id) => {
    const c = component(id);
    const { residue, atoms, bonds } = residueOf(c);
    const given = hydrogensFromComponent(residue, new Set(), c) as { on: number }[];
    for (const [i] of atoms.entries()) expect(given.filter((h) => h.on === i).length).toBe(hydrogensRoom(atoms, bonds, i));
  });

  it("HEM, as the CCD defines it, gives O2A and O2D a charge and a hydrogen both: they do not fit, and the chemist chooses", () => {
    const c = component("HEM");
    const { heavy, residue, atoms, bonds } = residueOf(c);
    const given = hydrogensFromComponent(residue, new Set(), c) as { on: number }[];
    // (the iron's bonds to its nitrogens not counted: theirs are the iron's)
    const off = atoms.flatMap((_, i) => (given.filter((h) => h.on === i).length !== hydrogensRoom(atoms, bonds, i) ? [heavy[i].name] : []));
    expect(off).toEqual(["O2A", "O2D"]);
  });
});

describe("the CCD's components' sites, each in the form the CCD defines", () => {
  const sitesOf = (id: string) => {
    const { heavy, atoms, bonds } = residueOf(component(id));
    return protonationSites(atoms, bonds, (i) => heavy[i].name).map((s) => [s.kind, s.now == null ? null : `${s.forms[s.now].name}: ${s.forms[s.now].where}`]);
  };

  it("acetate ion and glycine", () => {
    expect(sitesOf("ACT")).toEqual([["carboxyl", "Carboxylate: no H"]]);
    expect(sitesOf("GLY")).toEqual([
      ["carboxyl", "Carboxylic acid: H on OXT"],
      ["amine", "Amine: 2 H on N"],
    ]);
  });

  it("ATP: its phosphates' hydrogens where the CCD puts them, its purine's nitrogens", () => {
    expect(sitesOf("ATP")).toEqual([
      ["azole", "Imidazole: no H"],
      ["phosphate", "Phosphate: H on O2G, H on O3G"],
      ["phosphate", "Phosphate: H on O2B"],
      ["phosphate", "Phosphate: H on O2A"],
      ["ring nitrogen", "Pyridine: no H"],
      ["ring nitrogen", "Pyridine: no H"],
    ]);
  });

  it("imatinib: its ring nitrogens and its piperazine's - not its amide's, nor the one between its rings", () => {
    expect(sitesOf("STI")).toEqual([
      ["ring nitrogen", "Pyridine: no H"],
      ["ring nitrogen", "Pyridine: no H"],
      ["ring nitrogen", "Pyridine: no H"],
      ["amine", "Amine: no H"],
      ["amine", "Amine: no H"],
    ]);
  });
});

describe("a residue bonded to others", () => {
  it("GLY in a chain: no H2 on its N, bonded to the residue before; no OXT, nor HXT, bonded through C to the one after", () => {
    const c = component("GLY");
    const { residue } = residueOf(c);
    const inChain = residue.filter((a) => a.name !== "OXT");
    const given = hydrogensFromComponent(inChain, new Set([inChain.findIndex((a) => a.name === "N"), inChain.findIndex((a) => a.name === "C")]), c);
    if ("why" in given) throw new Error(given.why);
    expect(given.map((h) => h.name)).toEqual(["H", "HA2", "HA3"]);
  });
});
