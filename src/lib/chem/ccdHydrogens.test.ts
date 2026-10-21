import { describe, expect, it } from "vitest";
import { readComponent } from "./ccd";
import { carried, fitted, hydrogensFromComponent, type ResidueAtom } from "./ccdHydrogens";

// A component made up for the test, written as the dictionary's files are -
// a glycine-like residue whose OXT, HXT and H2 leave as it bonds to
// another - with each atom's place in its ideal shape. Its places are not
// meant to be a real glycine's: what is tested is that a hydrogen stands
// by the entry's atoms as it stands by the component's.
const ZZG = `data_ZZG
#
_chem_comp.id ZZG
#
loop_
_chem_comp_atom.comp_id
_chem_comp_atom.atom_id
_chem_comp_atom.type_symbol
_chem_comp_atom.charge
_chem_comp_atom.pdbx_leaving_atom_flag
_chem_comp_atom.pdbx_model_Cartn_x_ideal
_chem_comp_atom.pdbx_model_Cartn_y_ideal
_chem_comp_atom.pdbx_model_Cartn_z_ideal
ZZG N   N 0 N  1.931  0.090 -0.034
ZZG CA  C 0 N  0.761 -0.799 -0.008
ZZG C   C 0 N -0.498  0.029 -0.005
ZZG O   O 0 N -0.429  1.235 -0.023
ZZG OXT O 0 Y -1.697 -0.574  0.018
ZZG H   H 0 N  1.910  0.738  0.738
ZZG H2  H 0 Y  1.877  0.659 -0.864
ZZG HA2 H 0 N  0.783 -1.420  0.888
ZZG HA3 H 0 N  0.788 -1.437 -0.891
ZZG HXT H 0 Y -2.507 -0.042  0.020
#
loop_
_chem_comp_bond.comp_id
_chem_comp_bond.atom_id_1
_chem_comp_bond.atom_id_2
_chem_comp_bond.value_order
ZZG N   CA  SING
ZZG N   H   SING
ZZG N   H2  SING
ZZG CA  C   SING
ZZG CA  HA2 SING
ZZG CA  HA3 SING
ZZG C   O   DOUB
ZZG C   OXT SING
ZZG OXT HXT SING
`;

const component = readComponent(ZZG)!;
type P = { x: number; y: number; z: number };
const ideal = (name: string) => component.atoms.find((a) => a.name === name)!.at!;

/** A turn about an axis through the origin by an angle, then a shift. */
function moved(axis: P, angle: number, shift: P): (p: P) => P {
  const n = Math.hypot(axis.x, axis.y, axis.z);
  const [x, y, z] = [axis.x / n, axis.y / n, axis.z / n];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (p) => {
    // (Rodrigues' formula)
    const dot = x * p.x + y * p.y + z * p.z;
    const cross = { x: y * p.z - z * p.y, y: z * p.x - x * p.z, z: x * p.y - y * p.x };
    return {
      x: p.x * c + cross.x * s + x * dot * (1 - c) + shift.x,
      y: p.y * c + cross.y * s + y * dot * (1 - c) + shift.y,
      z: p.z * c + cross.z * s + z * dot * (1 - c) + shift.z,
    };
  };
}

const near = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

describe("the turn that carries points onto others", () => {
  it("is found again from points turned and shifted by a known one", () => {
    const move = moved({ x: 0.3, y: -1, z: 0.6 }, 2.1, { x: 5, y: -3, z: 12 });
    const from = component.atoms.map((a) => a.at!);
    const fit = fitted(from, from.map(move));
    for (const p of from) expect(near(carried(fit, p), move(p))).toBeLessThan(1e-9);
  });
});

describe("a residue given the hydrogens the dictionary defines", () => {
  it("reads each atom's place in the component's ideal shape, and those that leave", () => {
    expect(ideal("HXT")).toEqual({ x: -2.507, y: -0.042, z: 0.02 });
    expect(component.atoms.filter((a) => a.leaving).map((a) => a.name)).toEqual(["OXT", "H2", "HXT"]);
  });

  it("puts each by the entry's atoms as it stands by the component's, however the residue is turned", () => {
    const move = moved({ x: 1, y: 1, z: -0.4 }, -1.3, { x: -20, y: 4, z: 7 });
    const atoms: ResidueAtom[] = ["N", "CA", "C", "O", "OXT"].map((name) => ({ name, el: name[0], ...move(ideal(name)) }));
    const given = hydrogensFromComponent(atoms, new Set(), component);
    if ("why" in given) throw new Error(given.why);
    expect(given.map((h) => [h.name, atoms[h.on].name])).toEqual([
      ["H", "N"],
      ["H2", "N"],
      ["HA2", "CA"],
      ["HA3", "CA"],
      ["HXT", "OXT"],
    ]);
    for (const h of given) expect(near(h, move(ideal(h.name)))).toBeLessThan(1e-9);
  });

  it("and however it is bent: a hydrogen goes with the atoms round its own", () => {
    // (the carboxyl turned 90° about the CA-C bond, as a residue's shape differs from the ideal one)
    const ca = ideal("CA");
    const c = ideal("C");
    const turn = (p: P) => {
      const m = moved({ x: c.x - ca.x, y: c.y - ca.y, z: c.z - ca.z }, Math.PI / 2, { x: 0, y: 0, z: 0 });
      const q = m({ x: p.x - ca.x, y: p.y - ca.y, z: p.z - ca.z });
      return { x: q.x + ca.x, y: q.y + ca.y, z: q.z + ca.z };
    };
    const bent = new Set(["O", "OXT", "HXT"]);
    const atoms: ResidueAtom[] = ["N", "CA", "C", "O", "OXT"].map((name) => ({ name, el: name[0], ...(bent.has(name) ? turn(ideal(name)) : ideal(name)) }));
    const given = hydrogensFromComponent(atoms, new Set(), component);
    if ("why" in given) throw new Error(given.why);
    const hxt = given.find((h) => h.name === "HXT")!;
    expect(near(hxt, turn(ideal("HXT")))).toBeLessThan(1e-9);
    // (the amino group's, by atoms the turn left as they were)
    expect(near(given.find((h) => h.name === "H")!, ideal("H"))).toBeLessThan(1e-9);
  });

  it("gives no leaving hydrogen on an atom bonded to another residue, and none on an atom that left", () => {
    // (bonded through its N to the residue before it; its OXT gone, bonded through C to the one after)
    const atoms: ResidueAtom[] = ["N", "CA", "C", "O"].map((name) => ({ name, el: name[0], ...ideal(name) }));
    const given = hydrogensFromComponent(atoms, new Set([0, 2]), component);
    if ("why" in given) throw new Error(given.why);
    expect(given.map((h) => h.name)).toEqual(["H", "HA2", "HA3"]);
  });

  it("gives none where an atom of the component that does not leave is missing, and says which", () => {
    const atoms: ResidueAtom[] = ["N", "C", "O", "OXT"].map((name) => ({ name, el: name[0], ...ideal(name) }));
    expect(hydrogensFromComponent(atoms, new Set(), component)).toEqual({ why: "CA of ZZG is not in the entry, so its hydrogens cannot all be given." });
  });

  it("gives none where the component gives no shape", () => {
    const shapeless = readComponent(ZZG.replace(/ -?\d+\.\d+ +-?\d+\.\d+ +-?\d+\.\d+$/gm, " ? ? ?"))!;
    const atoms: ResidueAtom[] = ["N", "CA", "C", "O", "OXT"].map((name) => ({ name, el: name[0], ...ideal(name) }));
    expect(hydrogensFromComponent(atoms, new Set(), shapeless)).toEqual({ why: "The CCD gives no shape for ZZG, so its hydrogens cannot be placed." });
  });
});
