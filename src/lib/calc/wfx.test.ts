import { describe, expect, it } from "vitest";
import { orbitalOn, POWERS, readWfx, wfxGrid } from "./wfx";
import { floatsOf } from "./results";
import { calcOf } from "./output";
import { kindOf } from "../io/kinds";
import { BOHR_ANGSTROM } from "../units";

/** A section as the WFX specification (1.0.4c) writes one: its tag, its lines, its closing tag. */
const tag = (name: string, ...lines: (string | number)[]) => [`<${name}>`, ...lines.map((l) => ` ${l}`), `</${name}>`].join("\n");

/** A WFX file of made-up numbers, in the specification's layout. */
function wfx(o: {
  names?: string[];
  z?: number[] | null;
  charges?: number[];
  xyz?: number[];
  netCharge?: string;
  multiplicity?: number | null;
  model?: string | null;
  centres?: number[];
  types?: number[];
  exponents?: number[];
  occupations?: number[];
  energies?: number[];
  spins?: string[];
  coefficients?: number[][];
  gradients?: string[];
}): string {
  const names = o.names ?? ["O1", "H2", "H3"];
  const n = names.length;
  const centres = o.centres ?? [1, 1, 2];
  const coefficients = o.coefficients ?? [
    [0.5, 0.2, 0.1],
    [0.1, -0.3, 0.4],
  ];
  return [
    tag("Title", "made-up water"),
    tag("Keywords", "GTO"),
    tag("Number of Nuclei", n),
    tag("Number of Occupied Molecular Orbitals", coefficients.length),
    tag("Number of Perturbations", 0),
    tag("Nuclear Names", ...names),
    ...(o.z === null ? [] : [tag("Atomic Numbers", ...(o.z ?? [8, 1, 1]))]),
    tag("Nuclear Charges", ...(o.charges ?? [8.0, 1.0, 1.0])),
    tag("Nuclear Cartesian Coordinates", ...chunk(o.xyz ?? [0, 0, 0.2, 0, 1.4, -0.9, 0, -1.4, -0.9], 3).map((r) => r.join(" "))),
    tag("Net Charge", o.netCharge ?? "0.0"),
    tag("Number of Electrons", 10),
    tag("Number of Alpha Electrons", 5),
    tag("Number of Beta Electrons", 5),
    ...(o.multiplicity === null ? [] : [tag("Electronic Spin Multiplicity", o.multiplicity ?? 1)]),
    ...(o.model === null ? [] : [tag("Model", o.model ?? "Restricted B3LYP")]),
    tag("Number of Primitives", centres.length),
    tag("Primitive Centers", centres.join(" ")),
    tag("Primitive Types", (o.types ?? [1, 2, 1]).join(" ")),
    tag("Primitive Exponents", (o.exponents ?? [5.5e1, 1.2, 0.8]).map((e) => e.toExponential(10)).join(" ")),
    tag("Molecular Orbital Occupation Numbers", ...(o.occupations ?? coefficients.map(() => 2))),
    tag("Molecular Orbital Energies", ...(o.energies ?? coefficients.map((_, i) => -1 + 0.5 * i))),
    tag("Molecular Orbital Spin Types", ...(o.spins ?? coefficients.map(() => "Alpha and Beta"))),
    tag("Molecular Orbital Primitive Coefficients", ...coefficients.flatMap((c, i) => [`<MO Number>`, ` ${i + 1}`, `</MO Number>`, c.map((v) => v.toExponential(10)).join(" ")])),
    tag("Energy = T + Vne + Vee + Vnn", "-7.6400000000E+01"),
    tag("Virial Ratio (-V/T)", "2.0040000000E+00"),
    ...(o.gradients ? [tag("Nuclear Cartesian Energy Gradients", ...o.gradients)] : []),
    "",
  ].join("\n");
}

function chunk<T>(v: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(v.length / n) }, (_, i) => v.slice(i * n, i * n + n));
}

describe("a WFX file", () => {
  it("is told by its section of its primitives' count, in any case", () => {
    expect(kindOf("made-up.wfx", wfx({}))?.id).toBe("wfx");
    expect(kindOf("x.txt", wfx({}).replace("<Number of Primitives>", "<NUMBER OF PRIMITIVES>"))?.id).toBe("wfx");
  });

  it("is its molecule, in ångströms, its energy, method, charge and spin, its virial ratio, and its orbitals, each with its surface promised", () => {
    const r = readWfx("w.wfx", wfx({}));
    expect(r.atoms).toEqual(["O", "H", "H"]);
    expect(r.frames[0][2]).toBeCloseTo(0.2 * BOHR_ANGSTROM, 12);
    expect(r.energies).toEqual([-76.4]);
    expect(r).toMatchObject({ method: "Restricted B3LYP", charge: 0, multiplicity: 1 });
    expect(r.results).toEqual([{ id: "virial", on: "molecule", group: "Wavefunction", label: "Virial ratio (−V/T)", value: 2.004, quantity: "number", digits: 6 }]);
    expect(r.orbitals).toEqual([
      { spin: "both", energy: -1, occupation: 2, surface: { ask: "orbital:0" } },
      { spin: "both", energy: -0.5, occupation: 2, surface: { ask: "orbital:1" } },
    ]);
    // (listed by Meno: the occupied orbitals alone, opening on the HOMO)
    const list = calcOf(r, ["meno"]).results?.find((x) => x.id === "orbitals");
    expect(list?.on === "list" && list.rows.map((row) => row.cells[0])).toEqual(["HOMO", "HOMO−1"]);
  });

  it("takes each atom's element from its atomic number, else its nuclear charge - never its name - and leaves out a ghost", () => {
    const r = readWfx("w.wfx", wfx({ names: ["X1", "Na2", "Bq3"], z: null, charges: [8, 1, 0] }));
    expect(r.atoms).toEqual(["O", "H"]);
    expect(r.frames[0]).toHaveLength(6);
    expect(() => readWfx("w.wfx", wfx({ z: null, charges: [8.5, 1, 1] }))).toThrow(/no element's atomic number/);
  });

  it("says no spin where it gives none, and no charge where its net charge is not whole; its model as written", () => {
    const r = readWfx("w.wfx", wfx({ multiplicity: null, netCharge: "0.5", model: "a model named at some length, ".repeat(5) }));
    expect(r.multiplicity).toBeUndefined();
    expect(r.charge).toBeUndefined();
    expect(r.method?.length).toBeGreaterThan(80);
  });

  it("gives each spin's orbitals as the specification words them, and the RMS of its gradients where it gives them", () => {
    const r = readWfx("w.wfx", wfx({ spins: ["Alpha", "Beta"], occupations: [1, 1], gradients: ["O1 0.003 0 0", "H2 0 0.004 0", "H3 0 0 0"] }));
    expect((r.orbitals as { spin: string }[]).map((o) => o.spin)).toEqual(["alpha", "beta"]);
    expect(r.results).toContainEqual({ id: "rms-gradient", on: "frames", group: "Optimisation", label: "RMS gradient", unit: "Eh/bohr", digits: 6, values: [Math.sqrt((9e-6 + 16e-6) / 9)] });
    expect(() => readWfx("w.wfx", wfx({ spins: ["Alpha", "Gamma"] }))).toThrow(/spins/);
  });

  it("promises no surface where its primitives do not read as they must, saying why when one is asked for", () => {
    const bad = wfx({ types: [1, 99, 1] });
    expect((readWfx("w.wfx", bad).orbitals as object[]).every((o) => !("surface" in o))).toBe(true);
    expect(() => wfxGrid("w.wfx", bad, "orbital:0")).toThrow(/type its specification does not list/);
    expect(() => wfxGrid("w.wfx", wfx({ coefficients: [[1, 2]] }), "orbital:0")).toThrow(/coefficients/);
    expect(() => wfxGrid("w.wfx", wfx({}), "orbital:7")).toThrow(/no orbital:7/);
  });

  it("reads a tag wherever it stands on a line - a closing one after its section's last values, spaces after it - as real files have them", () => {
    const orca = wfx({})
      .replace(/\n<\/Primitive Exponents>/, " </Primitive Exponents> ")
      .replace("<Net Charge>", "<Net Charge>  ")
      .replace(/\n<\/Molecular Orbital Energies>/, "</Molecular Orbital Energies>");
    expect(readWfx("w.wfx", orca)).toEqual(readWfx("w.wfx", wfx({})));
    expect(wfxGrid("w.wfx", orca, "orbital:1")).toEqual(wfxGrid("w.wfx", wfx({}), "orbital:1"));
  });

  it("gives no virial ratio where the file says 0, which no bound state's can be", () => {
    const r = readWfx("w.wfx", wfx({}).replace("2.0040000000E+00", "0.0"));
    expect(r.results?.some((x) => (x as { id: string }).id === "virial")).toBe(false);
  });

  it("refuses what is not as the specification lays it out", () => {
    expect(() => readWfx("w.wfx", wfx({}).replace("</Net Charge>", ""))).toThrow();
    expect(() => readWfx("w.wfx", wfx({}).replace(/<Nuclear Charges>[^]*?<\/Nuclear Charges>\n/, "").replace(/<Atomic Numbers>[^]*?<\/Atomic Numbers>\n/, ""))).toThrow(/nuclear charges/);
  });
});

describe("a WFX file's orbital on a grid", () => {
  const sOrbital = (a: number) => ({ nuclei: [0, 0, 0], centres: [0], powers: [[0, 0, 0]] as [number, number, number][], exponents: [a], coefficients: [[(2 * a / Math.PI) ** 0.75]] });

  it("is its coefficients times its unnormalised primitives' values: an s primitive's exp(-a r^2)", () => {
    const w = sOrbital(0.5);
    const v = orbitalOn(w, 0, [-1, -1, -1], 1, [3, 3, 3]);
    const c = (1 / Math.PI) ** 0.75;
    expect(v[13]).toBeCloseTo(c, 6);
    expect(v[0]).toBeCloseTo(c * Math.exp(-0.5 * 3), 6);
  });

  it("has a p primitive's node through its centre, and its two signs either side", () => {
    const w = { nuclei: [0, 0, 0], centres: [0], powers: [[1, 0, 0]] as [number, number, number][], exponents: [1], coefficients: [[1]] };
    const v = orbitalOn(w, 0, [-1, 0, 0], 1, [3, 1, 1]);
    expect([v[0], v[1], v[2]]).toEqual([expect.closeTo(-Math.exp(-1), 6), 0, expect.closeTo(Math.exp(-1), 6)]);
  });

  it("is normalised as the specification says the orbitals are: its square sums to one over the space", () => {
    const step = 0.1;
    const n = 81;
    const v = orbitalOn(sOrbital(0.8), 0, [-4, -4, -4], step, [n, n, n]);
    let sum = 0;
    for (const x of v) sum += x * x;
    expect(sum * step ** 3).toBeCloseTo(1, 4);
  });

  it("is drawn on Meno's grid about its nuclei, two-signed, an orbital", () => {
    const g = wfxGrid("w.wfx", wfx({}), "orbital:1");
    expect(g).toMatchObject({ signed: true, quantity: "orbital" });
    expect(g.axes[0][0]).toBeCloseTo(0.2, 12);
    expect(floatsOf(g.values)).toHaveLength(g.counts[0] * g.counts[1] * g.counts[2]);
  });
});

describe("the WFX specification's primitive types", () => {
  const named = (t: number) => {
    const [x, y, z] = POWERS[t - 1];
    return "X".repeat(x) + "Y".repeat(y) + "Z".repeat(z);
  };

  it("are its table's, in its order: S to G as it lists them, H by its loop", () => {
    expect([1, 2, 3, 4].map(named)).toEqual(["", "X", "Y", "Z"]);
    expect([5, 6, 7, 8, 9, 10].map(named)).toEqual(["XX", "YY", "ZZ", "XY", "XZ", "YZ"]);
    expect(Array.from({ length: 10 }, (_, i) => named(11 + i))).toEqual(["XXX", "YYY", "ZZZ", "XXY", "XXZ", "YYZ", "XYY", "XZZ", "YZZ", "XYZ"]);
    expect(Array.from({ length: 15 }, (_, i) => named(21 + i))).toEqual([
      "XXXX", "YYYY", "ZZZZ", "XXXY", "XXXZ", "XYYY", "YYYZ", "XZZZ", "YZZZ", "XXYY", "XXZZ", "YYZZ", "XXYZ", "XYYZ", "XYZZ",
    ]);
    // (H: x's power outermost, from none up; y's next; z's the rest - type 36 HZZZZZ, 56 HXXXXX)
    expect([36, 37, 41, 42, 56].map(named)).toEqual(["ZZZZZ", "YZZZZ", "YYYYY", "XZZZZ", "XXXXX"]);
    expect(POWERS).toHaveLength(56);
  });
});
