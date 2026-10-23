import { describe, expect, it } from "vitest";
import type { ChemClient } from "../../../../lib/roles/client";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import type { Molecule3D } from "../store/types";
import { binned, chartOf, sampleOf, SAMPLE, sturges } from "./setSummary";
import { sampleDrawings } from "./sampleDrawings";

/** A water with `n` geometries and the energies given, as a conformer search makes it. */
function waters(energies: number[], extra: Partial<Molecule3D> = {}): Omit<Molecule3D, "id" | "at"> {
  const geo = (k: number) => [0, 0, 0, 0.96, 0, 0, -0.24, 0.93 + k / 100, 0];
  const g = geo(0);
  return {
    atoms: [0, 1, 2].map((i) => ({ el: i ? "H" : "O", x: g[3 * i], y: g[3 * i + 1], z: g[3 * i + 2] })),
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(energies.length > 1 ? { frames: energies.slice(1).map((_, k) => geo(k + 1)) } : {}),
    energies,
    conformerSet: true,
    made: { how: [], energies: "Field X" },
    ...extra,
  };
}

// (1 Eh = 627.5094740631 kcal/mol, CODATA 2018: 0.0015936014 Eh above is 1.000000 kcal/mol)
const KCAL = 0.0015936014;

describe("a large set's sample", () => {
  it("draws each compound of a conformer set once, the first twelve in the step's order, saying of how many", () => {
    const two = sampleOf([waters([-76, -75.9]), waters([-80])], "conformers");
    expect(two.picks).toEqual([
      { molecule: 0, frame: 0 },
      { molecule: 1, frame: 0 },
    ]);
    expect(two.said).toBe("Each compound, drawn once");
    const many = sampleOf(Array.from({ length: 20 }, () => waters([-76])), "conformers");
    expect(many.picks).toHaveLength(SAMPLE);
    expect(many.said).toBe("The first 12 of 20 compounds, in the step's order, each drawn once");
  });

  it("draws a set of molecules' first twelve, each as it ends - a path, its last frame", () => {
    const path = { ...waters([-76, -76.1, -76.2]), conformerSet: false, path: true as const };
    const s = sampleOf(Array.from({ length: 60 }, () => path), "molecules");
    expect([s.picks.length, s.picks[0].frame, s.said]).toEqual([12, 2, "The first 12 of 60 molecules, in the step's order"]);
  });
});

describe("a large set's chart", () => {
  it("bins by Sturges's rule: the bits it takes to count them, and one more", () => {
    // (Sturges 1926: ⌈log₂ n⌉ + 1)
    expect([1, 2, 8, 400, 1024].map(sturges)).toEqual([1, 2, 4, 10, 11]);
    expect(binned([0, 1, 2, 3])).toEqual([
      { from: 0, to: 1, count: 1 },
      { from: 1, to: 2, count: 1 },
      { from: 2, to: 3, count: 2 },
    ]);
    expect(binned([5, 5, 5])).toEqual([{ from: 5, to: 5, count: 3 }]);
    expect(binned([])).toEqual([]);
    // (no finite number, in no bin: its caller counts it)
    expect(binned([0, NaN, 1, Infinity])).toEqual([
      { from: 0, to: 0.5, count: 1 },
      { from: 0.5, to: 1, count: 1 },
    ]);
  });

  it("charts each conformer's energy above its compound's lowest, in kcal/mol, saying by what and of how many", () => {
    const chart = chartOf([waters([-76, -76 + KCAL, -76 + 2 * KCAL, -76 + 3 * KCAL]), waters([-80, -80 + 3 * KCAL])], "conformers");
    if ("none" in chart) throw new Error(chart.none);
    expect([chart.quantity, chart.unit, chart.by, chart.counted, chart.left]).toEqual(["ΔE above each compound's lowest", "kcal/mol", "Field X", 6, []]);
    // (0, 1, 2, 3 and 0, 3 kcal/mol: sturges(6) = 4 bins of 0.75)
    expect(chart.bins.map((b) => b.count)).toEqual([2, 1, 1, 2]);
    expect(chart.bins[3].to).toBeCloseTo(3, 6);
  });

  it("counts, and does not chart, those worked out another way and those with no energy; and charts no energies of different compounds", () => {
    const chart = chartOf([waters([-76, -76 + KCAL]), waters([-80, -80], { made: { how: [], energies: "Field Y" } }), { ...waters([]), energies: undefined, frames: [[0, 0, 0, 1, 0, 0, 0, 1, 0]] }], "conformers");
    if ("none" in chart) throw new Error(chart.none);
    expect([chart.counted, chart.left]).toEqual([
      2,
      [
        { count: 2, why: "worked out another way" },
        { count: 2, why: "with no usable energy" },
      ],
    ]);
    expect(chartOf([waters([-76])], "molecules")).toEqual({ none: "No energies charted: they are of different compounds" });
    expect(chartOf([{ ...waters([]), energies: undefined }], "conformers")).toEqual({ none: "No energies to chart" });
  });
});

/** Water as a drawing, its heavy atom alone - as the plugin that draws molecules gives it - and an ethanol, laid out as given. */
const WATER_BLOCK = "\n  Meno\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\nM  END\n";
const ETHANOL_BLOCK =
  "\n  Meno\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\n    1.3000    0.7500    0.0000 C   0  0\n    2.6000    0.0000    0.0000 O   0  0\n  1  2  1  0\n  2  3  1  0\nM  END\n";

const client = (answer: (n: number) => string | Error): ChemClient => {
  let n = 0;
  return {
    request: async () => {
      const a = answer(n++);
      if (a instanceof Error) throw a;
      return { molblock: a, perceived: true };
    },
  } as unknown as ChemClient;
};

describe("a large set's chart, where its energies are not all alike", () => {
  it("counts an energy that is no finite number as no usable energy, and charts the rest", () => {
    const chart = chartOf([waters([-76, NaN, -76 + KCAL, Infinity])], "conformers");
    if ("none" in chart) throw new Error(chart.none);
    expect([chart.counted, chart.left]).toEqual([2, [{ count: 2, why: "with no usable energy" }]]);
    expect(chart.bins.map((b) => b.count)).toEqual([1, 1]);
  });

  it("charts none worked out by a method not stated - two such may be two methods - and counts them", () => {
    const unstated = { made: undefined, calc: undefined };
    const chart = chartOf([waters([-76, -76 + KCAL]), waters([-80, -80 + KCAL], unstated), waters([-90, -90 + KCAL], unstated)], "conformers");
    if ("none" in chart) throw new Error(chart.none);
    expect([chart.by, chart.counted, chart.left]).toEqual(["Field X", 2, [{ count: 4, why: "worked out by a method not stated" }]]);
    expect(chartOf([waters([-80, -80 + KCAL], unstated)], "conformers")).toEqual({ none: "No energies charted: what worked them out is not stated" });
  });

  it("charts the method most were worked out by, not the first's - the first of those as many - and says how many were left", () => {
    const odd = { made: { how: [], energies: "Field Y" } };
    const chart = chartOf([waters([-76, -76 + KCAL], odd), waters([-80, -80 + KCAL, -80 + 2 * KCAL]), waters([-90, -90 + KCAL])], "conformers");
    if ("none" in chart) throw new Error(chart.none);
    expect([chart.by, chart.counted, chart.left]).toEqual(["Field X", 5, [{ count: 2, why: "worked out another way" }]]);
    // (as many each way: the first's)
    const tie = chartOf([waters([-76, -76 + KCAL], odd), waters([-80, -80 + KCAL])], "conformers");
    expect("none" in tie ? null : tie.by).toBe("Field Y");
  });

  it("charts no compound only a part of whose conformers is here - its lowest may not be among them - and counts them", () => {
    const chart = chartOf([waters([-76, -76 + KCAL]), waters([-80, -80 + KCAL, -80 + 2 * KCAL], { partOf: true })], "conformers");
    if ("none" in chart) throw new Error(chart.none);
    expect([chart.counted, chart.left]).toEqual([2, [{ count: 3, why: "of a compound only a part of whose conformers is here" }]]);
    expect(chartOf([waters([-80, -80 + KCAL], { partOf: true })], "conformers")).toEqual({ none: "No energies charted: each compound is only a part of a search's conformers" });
  });

  it("sets energies against one another by the program, its version and the level that worked them out - not by each one's job or state", () => {
    // (two compounds from jobs 1 and 2 of one run: one method, one chart)
    const job = (number: number, charge: number): Partial<Molecule3D> => ({ made: undefined, calc: { readers: ["prog"], program: "prog", version: "6.7", method: "GFN2-xTB", job: { number, of: 2 }, charge } });
    const chart = chartOf([waters([-76, -76 + KCAL], job(1, 0)), waters([-80, -80 + KCAL], job(2, -1))], "conformers");
    if ("none" in chart) throw new Error(chart.none);
    expect([chart.by, chart.counted, chart.left]).toEqual(["prog 6.7 \u00b7 GFN2-xTB", 4, []]);
    // (another version of the program: another way, counted, not charted with them)
    const older = { ...job(2, 0), calc: { ...job(2, 0).calc!, version: "6.6" } };
    const two = chartOf([waters([-76, -76 + KCAL], job(1, 0)), waters([-80, -80 + KCAL, -80 + 2 * KCAL], older)], "conformers");
    if ("none" in two) throw new Error(two.none);
    expect([two.by, two.counted, two.left]).toEqual(["prog 6.6 \u00b7 GFN2-xTB", 3, [{ count: 2, why: "worked out another way" }]]);
  });
});

describe("a large set's sample drawn", () => {
  const style = styleOf(DEFAULT_STYLE_CHOICE);
  const m = waters([-76]);

  it("draws each by Meno's engine, read back as given; one the plugin could not draw says why, in its place", async () => {
    const cells = await sampleDrawings(
      [
        { m, frame: 0 },
        { m, frame: 0 },
        { m, frame: 0 },
      ],
      style,
      Promise.resolve(client((n) => (n === 1 ? new Error("cannot read it") : n === 0 ? ETHANOL_BLOCK : WATER_BLOCK))),
    );
    expect(cells.map((c) => ("why" in c ? c.why : c.notAsGiven))).toEqual([[], "It could not be drawn: cannot read it", []]);
    expect(cells.every((c) => "why" in c || (c.svg.startsWith("<svg") && c.w > 0 && c.h > 0))).toBe(true);
  });

  it("says why none is drawn where no plugin draws molecules", async () => {
    const cells = await sampleDrawings([{ m, frame: 0 }], style, Promise.reject(new Error("No plugin Meno knows of does this")));
    expect(cells).toEqual([{ why: "No plugin Meno knows of does this" }]);
  });
});
