import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "./acs";
import { abbreviationOf, abbreviationStructure, labelRuns, labelUnits, reversedLabel } from "./abbreviations";
import { placedAbbreviation } from "./abbreviationPlace";
import { LIGANDS, ligandPicture, ligandStructure, structureFormula, type GroupStructure } from "./ligands";
import { writeMolfile } from "./molWriter";

const formula = structureFormula;
const charge = (s: GroupStructure) => s.atoms.reduce((q, a) => q + (a.charge ?? 0), 0);

describe("the ligands", () => {
  const formulas: Record<string, string> = {
    PPh3: "C18H15P", PCy3: "C18H33P", "P(t-Bu)3": "C12H27P", "P(o-Tol)3": "C21H21P", PMe3: "C3H9P", PEt3: "C6H15P",
    PBu3: "C12H27P", "P(OPh)3": "C18H15O3P", "P(OMe)3": "C3H9O3P", TFP: "C12H9O3P", AsPh3: "C18H15As",
    XPhos: "C33H49P", SPhos: "C26H35O2P", RuPhos: "C30H43O2P", BrettPhos: "C35H53O2P", tBuXPhos: "C29H45P",
    DavePhos: "C26H36NP", JohnPhos: "C20H27P", CyJohnPhos: "C24H31P", MePhos: "C25H33P", tBuMePhos: "C21H29P",
    tBuDavePhos: "C22H32NP", PhDavePhos: "C26H24NP", CPhos: "C28H41N2P", tBuBrettPhos: "C31H49O2P", AdBrettPhos: "C43H61O2P",
    RockPhos: "C31H49OP", Me4tBuXPhos: "C33H53P", EPhos: "C36H55OP", GPhos: "C35H53O2P", sSPhos: "C26H34NaO5PS",
    dppm: "C25H22P2", dppe: "C26H24P2", dppp: "C27H26P2", dppb: "C28H28P2", dppf: "C34H28FeP2", BINAP: "C44H32P2",
    Xantphos: "C39H32OP2", DPEphos: "C36H28OP2",
    bpy: "C10H8N2", dtbpy: "C18H24N2", phen: "C12H8N2", py: "C5H5N", TMEDA: "C6H16N2", en: "C2H8N2", MeCN: "C2H3N", NH3: "H3N",
    IPr: "C27H36N2", IMes: "C21H24N2", SIPr: "C27H38N2", SIMes: "C21H26N2",
    cod: "C8H12", nbd: "C7H8", dba: "C17H14O", "p-cymene": "C10H14", "Cp*": "C10H15", Cp: "C5H5",
    acac: "C5H7O2", THF: "C4H8O", H2O: "H2O", CO: "CO",
    SEGPHOS: "C38H28O4P2", "DTBM-SEGPHOS": "C74H100O8P2", DPEN: "C14H16N2", DACH: "C6H14N2",
    // (bound as anions: TsDPEN by its sulfonamide's N, salen by both its O)
    TsDPEN: "C21H21N2O2S", salen: "C16H14N2O2",
    allyl: "C3H5", dvtms: "C8H18OSi2", "=CHPh": "C7H6", "=CH2": "CH2",
  };

  it("are each the molecule their names give, with as many donors as they bind by", () => {
    expect(Object.keys(formulas).sort()).toEqual(LIGANDS.map((l) => l.label).sort());
    const donors: Record<string, number> = { dppm: 2, dppe: 2, dppp: 2, dppb: 2, dppf: 2, BINAP: 2, Xantphos: 2, DPEphos: 2, bpy: 2, dtbpy: 2, phen: 2, TMEDA: 2, en: 2, cod: 2, nbd: 2, acac: 2, SEGPHOS: 2, "DTBM-SEGPHOS": 2, DPEN: 2, TsDPEN: 2, DACH: 2, salen: 4, dvtms: 2 };
    for (const l of LIGANDS) {
      const s = ligandStructure(l);
      expect(formula(s), l.label).toBe(formulas[l.label]);
      expect(s.attach.length, l.label).toBe(donors[l.label] ?? 1);
    }
    // ferrocene's iron(II) and its two rings: neutral as a whole
    expect(charge(ligandStructure(LIGANDS.find((l) => l.label === "dppf")!))).toBe(0);
  });

  it("have the rings they are drawn with: each ring bond in a five- or six-membered ring (cod's eight)", () => {
    for (const l of LIGANDS) {
      const s = ligandStructure(l);
      const near = s.atoms.map(() => [] as number[]);
      for (const b of s.bonds) {
        if (b.endpoints) continue;
        near[b.a1].push(b.a2);
        near[b.a2].push(b.a1);
      }
      // the smallest ring through each bond: the shortest way round without it
      for (const b of s.bonds) {
        if (b.endpoints) continue;
        const seen = new Map([[b.a1, 0]]);
        const queue = [b.a1];
        while (queue.length && !seen.has(b.a2)) {
          const u = queue.shift()!;
          for (const w of near[u]) {
            if (seen.has(w) || (u === b.a1 && w === b.a2)) continue;
            seen.set(w, seen.get(u)! + 1);
            queue.push(w);
          }
        }
        const ring = seen.has(b.a2) ? seen.get(b.a2)! + 1 : 0;
        if (ring) expect(ring <= 6 || (l.label === "cod" && ring === 8), `${l.label}: a ring of ${ring}`).toBe(true);
      }
    }
  });

  it("bind a pi system through all its atoms: a star at its centre", () => {
    const cp = placedAbbreviation("Cp*", { x: -L, y: 0 }, L)!;
    expect(cp.haptic).toHaveLength(1);
    const { star, atoms } = cp.haptic![0];
    expect(cp.attach).toEqual([star]);
    const mean = (k: "x" | "y") => atoms.reduce((t, i) => t + cp.atoms[i][k], 0) / atoms.length;
    expect(cp.atoms[star].x).toBeCloseTo(mean("x"), 9);
    expect(cp.atoms[star].y).toBeCloseTo(mean("y"), 9);
    // its ring kept a bond and more from the metal its bond comes from (at -L, 0)
    const nearest = Math.min(...atoms.map((i) => Math.hypot(cp.atoms[i].x + L, cp.atoms[i].y)));
    expect(nearest).toBeGreaterThanOrEqual(L * 0.99);
    // drawn as a label is: neutral
    expect(cp.atoms.every((a) => !a.charge)).toBe(true);
    // cod by its two C=C
    expect(abbreviationStructure("cod")!.haptic!.map((h) => h.atoms.length)).toEqual([2, 2]);
    // a picture: a * on each donor atom, and at each pi system's centre
    const pictured = (label: string) => ligandPicture(LIGANDS.find((l) => l.label === label)!).atoms.filter((a) => a.el === "*").length;
    expect([pictured("PPh3"), pictured("dppe"), pictured("cod"), pictured("acac")]).toEqual([1, 2, 2, 2]);
  });

  it("bonded to a metal as labels, are written out bound by their donor atoms", () => {
    // Pd-PPh3 and Fe-Cp*, as drawn
    const text = writeMolfile({
      atoms: [
        { id: 1, x: 0, y: 0, el: "Pd" },
        { id: 2, x: L, y: 0, el: "PPh3" },
        { id: 3, x: 0, y: -3 * L, el: "Fe" },
        { id: 4, x: L, y: -3 * L, el: "Cp*" },
      ],
      bonds: [
        { a: 1, b: 2, order: 1 },
        { a: 3, b: 4, order: 1 },
      ],
    });
    const lines = text.split("\n");
    const atoms = lines.filter((l) => /^M {2}V30 \d+ [A-Z*][a-z]? /.test(l)).map((l) => l.split(" ")[4]);
    const bonds = lines.filter((l) => /^M {2}V30 \d+ \d+ \d+ \d+/.test(l)).map((l) => l.split(" ").slice(4, 7).map(Number));
    // the PPh3's first atom, where the label was, is its P, bonded to Pd
    expect(atoms[1]).toBe("P");
    expect(bonds.some(([, a, b]) => (a === 1 && b === 2) || (a === 2 && b === 1))).toBe(true);
    // the Cp*'s: a haptic bond from Fe to a star with the ring's five atoms
    expect(text).toMatch(/ENDPTS=\(5 /);
  });

  it("are labels: known on their own, read as one unit or as a formula", () => {
    expect(abbreviationOf("PPh3")?.kind).toBe("ligand");
    expect(abbreviationOf("Ph3P")?.label).toBe("PPh3");
    expect(reversedLabel("PPh3")).toBe("Ph3P");
    expect(labelUnits("dppf")).toEqual(["dppf"]);
    expect(reversedLabel("XPhos")).toBe("XPhos");
    // CO, H2O and NH3 only in a complex
    expect(abbreviationOf("CO")).toBeUndefined();
  });
});

describe("complexes' formulas", () => {
  const of = (label: string) => abbreviationStructure(label)!;

  it("bind each ligand to the metal: a donor by a coordination bond, an anion by a covalent one", () => {
    const tetrakis = of("Pd(PPh3)4");
    expect(abbreviationOf("Pd(PPh3)4")?.kind).toBe("complex");
    expect(formula(tetrakis)).toBe("C72H60P4Pd");
    expect(tetrakis.attach).toEqual([]);
    const pd = tetrakis.atoms.findIndex((a) => a.el === "Pd");
    const toPd = tetrakis.bonds.filter((b) => b.a2 === pd || b.a1 === pd);
    expect(toPd.map((b) => [tetrakis.atoms[b.a1].el, !!b.coordination])).toEqual(Array(4).fill(["P", true]));
    const dichloride = of("PdCl2(PPh3)2");
    expect(formula(dichloride)).toBe("C36H30Cl2P2Pd");
    expect(dichloride.bonds.filter((b) => !b.coordination && dichloride.atoms[b.a2].el === "Cl")).toHaveLength(2);
    expect(formula(of("Pd(PPh3)2Cl2"))).toBe("C36H30Cl2P2Pd");
    expect(formula(of("Pd(OAc)2"))).toBe("C4H6O4Pd");
    expect(formula(of("PdCl2(dppf)"))).toBe("C34H28Cl2FeP2Pd");
    expect(formula(of("Mo(CO)6"))).toBe("C6MoO6");
    expect(formula(of("CuI"))).toBe("CuI");
  });

  it("share ligands among several metals, make a part in brackets as often as its count, and balance charges", () => {
    const pd2 = of("Pd2(dba)3");
    expect(formula(pd2)).toBe("C51H42O3Pd2");
    expect(pd2.bonds.filter((b) => b.endpoints)).toHaveLength(3);
    expect(formula(of("[Ir(cod)Cl]2"))).toBe("C16H24Cl2Ir2");
    expect(abbreviationOf("[Ir(cod)Cl]2")?.name).toBe("2 × (iridium, 1,5-cyclooctadiene, Cl) bridged by Cl");
    // the dimer bridged by its chlorides: each Cl bound to both iridiums
    const ir2 = of("[Ir(cod)Cl]2");
    for (const cl of ir2.atoms.flatMap((a, i) => (a.el === "Cl" ? [i] : []))) {
      expect(ir2.bonds.filter((b) => b.a1 === cl || b.a2 === cl)).toHaveLength(2);
    }
    // two chlorides on each ruthenium, one of them bridging
    const ru2 = of("[RuCl2(p-cymene)]2");
    expect(formula(ru2)).toBe("C20H28Cl4Ru2");
    const bridging = ru2.atoms.flatMap((a, i) => (a.el === "Cl" && ru2.bonds.filter((b) => b.a1 === i || b.a2 === i).length === 2 ? [i] : []));
    expect(bridging).toHaveLength(2);
    // a hydride hexamer: the octahedral cluster, its metals in contact
    // along its twelve edges, each hydride bridging one of them
    const cu6 = of("[CuH(PPh3)]6");
    expect(formula(cu6)).toBe("C108H96Cu6P6");
    expect(abbreviationOf("[CuH(PPh3)]6")?.name).toBe("6 × (copper, H, triphenylphosphine), an octahedron bridged by H");
    const cus = cu6.atoms.flatMap((a, i) => (a.el === "Cu" ? [i] : []));
    const contacts = cu6.bonds.filter((b) => cus.includes(b.a1) && cus.includes(b.a2));
    expect(contacts).toHaveLength(12);
    for (const cu of cus) expect(contacts.filter((b) => b.a1 === cu || b.a2 === cu)).toHaveLength(4);
    const hydrides = cu6.atoms.flatMap((a, i) => (a.el === "H" ? [i] : []));
    expect(hydrides).toHaveLength(6);
    for (const h of hydrides) expect(cu6.bonds.filter((b) => (b.a1 === h || b.a2 === h) && cus.includes(b.a1 === h ? b.a2 : b.a1))).toHaveLength(2);
    // (and no two of them on one edge)
    const edges = hydrides.map((h) => cu6.bonds.filter((b) => b.a1 === h || b.a2 === h).map((b) => (b.a1 === h ? b.a2 : b.a1)).sort().join());
    expect(new Set(edges).size).toBe(6);
    // a counter-anion, or no halide, and nothing bridges
    expect(of("[Rh(cod)2]BF4").bonds.filter((b) => b.coordination && b.endpoints == null)).toHaveLength(0);
    expect(formula(of("Ni(cod)2"))).toBe("C16H24Ni");
    // Cp- on Zr: Zr(2+), the whole neutral
    const zr = of("Cp2ZrCl2");
    expect(formula(zr)).toBe("C10H10Cl2Zr");
    expect(zr.atoms.find((a) => a.el === "Zr")!.charge).toBe(2);
    expect(charge(zr)).toBe(0);
    // a cation and its counter-anion
    const rh = of("[Rh(cod)2]BF4");
    expect(formula(rh)).toBe("C16H24BF4Rh");
    expect(rh.atoms.find((a) => a.el === "Rh")!.charge).toBe(1);
    expect(charge(rh)).toBe(0);
    // counter-anions read by rule, named as written; BArF, which no rule reads, by its name
    const counters: Record<string, string> = {
      "[Cu(MeCN)4]PF6": "C8H12CuF6N4P", "[Rh(cod)2]SbF6": "C16H24F6RhSb", "[Cu(MeCN)4]ClO4": "C8H12ClCuN4O4",
      "[Rh(cod)2]AsF6": "C16H24AsF6Rh", "[Rh(cod)2]BPh4": "C40H44BRh", "[Rh(cod)2]BArF": "C48H36BF24Rh",
    };
    for (const [label, f] of Object.entries(counters)) {
      expect(formula(of(label)), label).toBe(f);
      expect(charge(of(label)), label).toBe(0);
    }
    expect(abbreviationOf("[Cu(MeCN)4]PF6")?.name).toBe("copper, 4 acetonitrile, PF6⁻");
    const clo4 = of("[Cu(MeCN)4]ClO4");
    const cl = clo4.atoms.findIndex((a) => a.el === "Cl");
    expect(clo4.bonds.filter((b) => b.a1 === cl || b.a2 === cl).map((b) => b.order).sort()).toEqual([1, 2, 2, 2]);
  });

  it("are no complex where any part is not known, or there is nothing but metal", () => {
    for (const no of ["Pd", "Pd2", "PdX2", "Pd(Foo)2", "Cl2", "[PPh3]BF4", "Pd(PPh3", "BF4"]) expect(abbreviationOf(no)?.kind, no).not.toBe("complex");
  });

  it("are set as formulas are, and written out as their structures", () => {
    const runs = labelRuns("[Ir(cod)Cl]2");
    expect(runs[runs.length - 1]).toEqual({ text: "2", sub: true });
    expect(labelRuns("Pd2(dba)3").map((r) => r.text)).toEqual(["Pd", "2", "(dba)", "3"]);
    const text = writeMolfile({ atoms: [{ id: 1, x: 0, y: 0, el: "Pd(PPh3)4" }], bonds: [] });
    // coordination bonds: V3000
    expect(text).toMatch(/V3000/);
    expect(text).toMatch(/M {2}V30 COUNTS 77 88 1 0 0/);
    expect(text).toMatch(/SUP 0 ATOMS=\(77 /);
    // (Pd(PPh3)4 laid out by the whole engine: a second here, several on CI's runners)
  }, 30_000);
});
