import { describe, expect, it } from "vitest";
import { unitsHeld } from "../../../../lib/calc/results";
import { FAILURE_WORDS } from "../workflow/failures";
import { barsAbove, FAILURES_ASTRAY, NO_LOWEST, NOT_FINISHED } from "./barsAbove";
import { chipCopy, chipDetails, chipEnergies, MADE_GROUP, setChipRuns, share, singleChipRuns, type ChipFacts, type SetChip } from "./chipSaid";

const kcal = (e: number) => e / 627.509474;
const said = (c: SetChip) => setChipRuns(c).map((r) => r.text).join("");

describe("a set's chip, shut, as runs to draw", () => {
  it("says which of how many, its number in its file, its title, its energy above the lowest, its share and its marks", () => {
    expect(said({ count: 5, frame: 2 })).toBe("3 / 5");
    expect(said({ count: 3, frame: 1, energies: [0, kcal(0.42), kcal(1.3)], populations: [0.62, 0.3, 0.08] })).toBe("2 / 3 · 0.42 kcal/mol · 30%");
    expect(said({ count: 3, frame: 0, numbers: [4, 9, 12], title: "Conformer A" })).toBe("#4 · 1 / 3Conformer A");
    expect(said({ count: 3, frame: 1, energies: [0, kcal(0.4), kcal(0.9)], failed: [null, { kind: "program-error", why: "it stopped" }, null] })).toBe(
      `2 / 3 · ${NOT_FINISHED} · ${FAILURE_WORDS["program-error"]}`,
    );
  });

  it("tells which words are which tone, its title after a little room and cut at 14rem", () => {
    const runs = setChipRuns({ count: 3, frame: 0, numbers: [4, 9, 12], title: "Conformer A", populations: [0.5, 0.3, 0.2] });
    expect(runs.map((r) => r.tone)).toEqual(["ink", "quiet", "ink", "ink"]);
    expect(runs[2]).toMatchObject({ gapPx: 8, mostPx: 224 });
    expect(share(0.001)).toBe("<1%");
    expect(share(0.999)).toBe(">99%");
  });

  it("says a path's frame's energy from the path's start, as its barrier is - never from its lowest, the path's other end", () => {
    // (a Diels-Alder's path: its start, the point refined 6.75 kcal/mol above it, and cyclohexene 68.03 below it)
    const path = [0, kcal(6.75), kcal(-68.03)];
    expect(said({ count: 3, frame: 1, energies: path, fromStart: true })).toContain("ΔE 6.75 kcal/mol from its start");
    expect(said({ count: 3, frame: 1, energies: path })).toContain("74.8 kcal/mol");
  });

  it("writes a conformer's energy and share by what they round to: 10.0 kcal/mol, not 10.00; >99%, not 100%, beside another", () => {
    const at = (frame: number, energies: number[], populations: number[]) => said({ count: energies.length, frame, energies, populations });
    expect(at(1, [0, kcal(9.9996)], [0.9999, 0.0001])).toBe("2 / 2 · 10.0 kcal/mol · <1%");
    expect(at(0, [0, kcal(9.9996)], [0.9999, 0.0001])).toContain(">99%");
    expect(at(1, [0, kcal(9.994)], [0.5, 0.5])).toContain("9.99 kcal/mol");
    expect(at(0, [0, kcal(30)], [1, 0])).toContain("100%");
  });

  it("shows a conformer set of one as a set: 1 / 1 with its energy and share (the maintainer, 2026-10-21)", () => {
    expect(said({ count: 1, frame: 0, energies: [-100], populations: [1] })).toBe("1 / 1 · 0.00 kcal/mol · 100%");
  });

  it("says no frame stands above another where none finished, or where its failures do not line up with its frames", () => {
    const energies = [-76, -76.0015936014, -77];
    expect(said({ count: 3, frame: 0, energies, marksUnread: true })).toContain(NO_LOWEST);
    const short = [null, { kind: "not-converged" as const, why: "x" }];
    expect(barsAbove(energies, short)).toEqual({ above: [null, null, null], noBaseline: true, why: FAILURES_ASTRAY });
    expect(said({ count: 3, frame: 0, energies, failed: short })).toContain(FAILURES_ASTRAY);
  });

  it("stands each bar above the lowest of the frames that finished - one that failed is no zero, and has no bar", () => {
    // (1 Eh = 627.5094740631 kcal/mol, CODATA 2018: 0.0015936014 Eh is 1.000000 kcal/mol; the third, not converged, the lowest)
    const energies = [-76, -76.0015936014, -77];
    const failed = [null, null, { kind: "not-converged" as const, why: "stopped at 200 cycles" }];
    const { above, noBaseline } = barsAbove(energies, failed);
    expect([above[0], above[1], above[2], noBaseline]).toEqual([expect.closeTo(1, 6), 0, null, false]);
    expect(said({ count: 3, frame: 2, energies, failed, conformers: true } as SetChip)).toContain(NOT_FINISHED);
  });
});

describe("what a chip says opened, and copies", () => {
  const failed = [null, { kind: "not-converged" as const, why: "The optimisation did not converge" }];
  const warnings = [{ kind: "hessian-not-stationary" as const, text: "Frequencies taken where the geometry had not settled" }];
  const c: ChipFacts = { count: 2, frame: 1, about: "Tight", failed, warnings };

  it("says why the frame told failed, first, and what its calculation warned of, as its reader says it", () => {
    const groups = chipDetails(c, 1);
    expect(groups[0]).toEqual({ group: "Failed", rows: [{ label: "Not converged", text: "The optimisation did not converge" }] });
    expect(groups[groups.length - 1]).toMatchObject({ group: "Warnings", rows: [{ text: "Frequencies taken where the geometry had not settled" }] });
    expect(said({ ...c, frame: 1 })).toContain("1 warning");
    // (another frame, which did not fail: its warnings alone)
    expect(chipDetails(c, 0).some((g) => g.group === "Failed")).toBe(false);
  });

  it("keeps how it was made folded under its name, its method first", () => {
    const made = { method: "ETKDG v3 + MMFF94", how: [{ label: "Kept", text: "17 of 50 embedded" }] };
    const g = chipDetails({ count: 3, frame: 0, made }, 0).find((x) => x.group === MADE_GROUP)!;
    expect(g.folded).toBe(true);
    expect(g.rows.map((r) => r.label)).toEqual(["Method", "Kept"]);
  });

  it("copies all it says of the frame shown - its line, what it was, each group under its name, a row's name and value a tab apart", () => {
    const text = chipCopy(c, 1);
    const lines = text.split("\n");
    expect(lines[0]).toBe(said({ ...c, frame: 1 }));
    expect(lines[1]).toBe("Tight");
    expect(lines).toContain("Failed");
    expect(lines).toContain("Not converged\tThe optimisation did not converge");
    expect(text).toContain("Warnings");
    // (how it was made too, folded as it is on the chip)
    const made = { method: "ETKDG v3 + MMFF94", how: [{ label: "Kept", text: "17 of 50 embedded" }] };
    const withMade = chipCopy({ ...c, made }, 1).split("\n");
    expect(withMade).toContain(MADE_GROUP);
    expect(withMade).toContain("Method\tETKDG v3 + MMFF94");
    expect(withMade).toContain("Kept\t17 of 50 embedded");
  });

  it("copies each frame's energy as a table - its number, its energy, how far above the lowest and its share - or none without energies", () => {
    const t = chipEnergies({ count: 2, frame: 0, energies: [-76, -76.0015936014], populations: [0.84, 0.16], numbers: [3, 7] })!;
    expect(t.split("\n")).toEqual(["Frame\tEnergy (Eh)\tAbove the lowest (kcal/mol)\tShare (%)", "3\t-76.000000\t1.00\t84.0", "7\t-76.001594\t0.00\t16.0"]);
    // (one that failed: its energy, nothing above the lowest)
    const f = chipEnergies({ count: 2, frame: 0, energies: [-76, -77], failed: [null, { kind: "not-converged", why: "x" }] })!;
    expect(f.split("\n")[2]).toBe("2\t-77.000000\t");
    expect(chipEnergies({ count: 2, frame: 0 })).toBeNull();
  });

  it("copies a path's energies from its start - its first frame none, each other the first's taken from it - not above the lowest", () => {
    const energies = [-76, -76.0015936014, -75.999];
    const col = (t: string) => t.split("\n").slice(1).map((l) => l.split("\t")[2]);
    const above = col(chipEnergies({ count: 3, frame: 0, energies })!);
    const t = chipEnergies({ count: 3, frame: 0, energies, fromStart: true })!;
    expect(t.split("\n")[0]).toBe("Frame\tEnergy (Eh)\tFrom its start (kcal/mol)");
    const fromStart = col(t);
    expect(fromStart[0]).toBe("0.00");
    expect(fromStart.map(Number)).toEqual(above.map((a) => expect.closeTo(Number(a) - Number(above[0]), 1)));
    expect(Number(fromStart[1])).toBeCloseTo(-1, 1);
  });

  it("says a single geometry's title, what it was and its marks, its title cut at 14rem", () => {
    const runs = singleChipRuns({ count: 1, frame: 0, title: "aspirin", about: "Tight", failed: [{ kind: "not-converged", why: "x" }] });
    expect(runs.map((r) => r.text).join("")).toBe(`aspirin · Tight · ${FAILURE_WORDS["not-converged"]}`);
    expect(runs[0]).toMatchObject({ tone: "ink", mostPx: 224 });
  });

  it("holds each number to its unit in its line, never broken between them", () => {
    expect(unitsHeld("Loose 1.0 · charge 0, singlet · −1.234567 Eh")).toBe("Loose 1.0 · charge 0, singlet · −1.234567 Eh");
    expect(unitsHeld("1.85 D · 120.5° · 2 Å")).toBe("1.85 D · 120.5° · 2 Å");
  });
});
