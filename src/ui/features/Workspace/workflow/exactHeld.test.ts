import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import type { Restraint } from "../../../../lib/entry";
import { dihedral } from "../../../../lib/steps/measure";
import { convergedAt, convergedIn, convergedOf, heldAt, heldWhy } from "./converged";
import { readCarried3D } from "../utils/copyPaste";
import type { Molecule3D } from "../store/types";
import { notAllMinima } from "./meno";
import { exactMissed, exactRows, fixedAtoms, isFailure, workedOf } from "./programs";
import type { SetEntry } from "./entries";
import type { Worked } from "./run";

// Distances and dihedrals held exactly at their values (docs/WORKFLOWS.md, *Restraints wired in*): a run that held any is no
// stationary point, and each is checked where the run ended, on the one basis of atoms held (1e-4 Å).

type V = [number, number, number];
const RAD = Math.PI / 180;

/**
 * H-C-C-H at a torsion of `phi` degrees: C-C 1.54 Å, the first C-H `r` Å long at `theta` degrees to the C-C bond and the
 * last `r4` Å at `theta4` (as the first, unless given) - the first three where they are whatever the torsion.
 */
function hcch(phi: number, r = 1.09, theta = 110, r4 = r, theta4 = theta): number[] {
  const h1: V = [r * Math.cos(theta * RAD), r * Math.sin(theta * RAD), 0];
  const c2: V = [0, 0, 0];
  const c3: V = [1.54, 0, 0];
  const h4: V = [1.54 - r4 * Math.cos(theta4 * RAD), r4 * Math.sin(theta4 * RAD) * Math.cos(phi * RAD), r4 * Math.sin(theta4 * RAD) * Math.sin(phi * RAD)];
  return [...h1, ...c2, ...c3, ...h4];
}
const measured = (xyz: readonly number[]) => dihedral([xyz[0], xyz[1], xyz[2]], [xyz[3], xyz[4], xyz[5]], [xyz[6], xyz[7], xyz[8]], [xyz[9], xyz[10], xyz[11]]);

/** H-C-C-H as a step's entry, at `xyz`. */
const entryAt = (xyz: number[]): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: [{ el: "H" }, { el: "C" }, { el: "C" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
      { a1: 2, a2: 3, order: 1 },
    ],
    xyz,
  }) as unknown as SetEntry;
const START = hcch(70);
const output = (last: number[], more: Partial<ReaderOutput> = {}): ReaderOutput =>
  ({ schema: 1, program: "Tightbind", method: "TB2", atoms: ["H", "C", "C", "H"], frames: [START, last], energies: [-5.07, -5.08], optimised: true, ...more }) as unknown as ReaderOutput;
const torsion = (value: number): Restraint => ({ kind: "dihedral", atoms: [0, 1, 2, 3], value, exact: true });
const cc = (value: number): Restraint => ({ kind: "distance", atoms: [1, 2], value, exact: true });
const run = (rows: Restraint[], last: number[], kind: "optimise" | "saddle-point" = "optimise", more: Partial<ReaderOutput> = {}) =>
  workedOf(kind, entryAt(START), output(last, more), ["tightbind 0.2.0"], undefined, fixedAtoms(rows), true, exactRows(rows));
const worked = (w: ReturnType<typeof workedOf>): Worked => {
  if (isFailure(w)) throw new Error(w.why);
  return w as Worked;
};

describe("a distance or dihedral held exactly", () => {
  it("is each row held exactly of those held, in their order - not one held by a strength, nor atoms fixed", () => {
    const rows: Restraint[] = [{ kind: "fixed", atoms: [0] }, torsion(60), { kind: "distance", atoms: [1, 2], value: 1.5, strength: 500 }, cc(1.54)];
    expect(exactRows(rows)).toEqual([torsion(60), cc(1.54)]);
    expect(exactRows([])).toEqual([]);
    // (a row held by a strength is never taken for one held exactly: never checked at its value, nor marking a run held)
    expect(exactRows([{ kind: "distance", atoms: [1, 2], value: 1.5, strength: 500 }, { kind: "dihedral", atoms: [0, 1, 2, 3], value: 60, strength: 50 }])).toEqual([]);
  });

  it("holds a distance to within 1e-4 Å of its value, as atoms held stay within it", () => {
    const at = hcch(60);
    expect(exactMissed(cc(1.54), at)).toBeNull();
    expect(exactMissed(cc(1.54009), at)).toBeNull();
    expect(exactMissed(cc(1.54011), at)).toBe("Distance 2-3 ended at 1.54000 Å, held at 1.54011 Å");
  });

  it("holds a dihedral to the angle 1e-4 Å turns its end - H-C-C-H at 1.09 Å and 110°, about 0.0056°", () => {
    // (by hand: HELD_MOVED_MOST / (r sin theta) = 1e-4 / (1.09 sin 110°) = 9.763e-5 rad = 0.005594°)
    const at = hcch(60);
    const phi = measured(at);
    expect(Math.abs(phi)).toBeCloseTo(60, 9);
    expect(exactMissed(torsion(phi + 0.004), at)).toBeNull();
    expect(exactMissed(torsion(phi - 0.004), at)).toBeNull();
    expect(exactMissed(torsion(phi + 0.008), at)).toBe(`Torsion 1-2-3-4 ended at ${phi.toFixed(3)}°, held at ${phi + 0.008}°`);
    // (the smaller lever of its two ends taken: its last end bond twice as long turns it half as far, and its first still
    //  bounds it - 0.004° within, 0.008° not)
    const longer = hcch(60, 1.09, 110, 2.18);
    expect(exactMissed(torsion(measured(longer) + 0.004), longer)).toBeNull();
    expect(exactMissed(torsion(measured(longer) + 0.008), longer)).not.toBeNull();
    // (each end's lever its bond times the sine of its angle: one end at 30° - or at 150° - and the other at 110°, its lever
    //  1.09 sin 30° = 0.545 Å, so 1e-4 / 0.545 rad = 0.0105° - 0.008° off within, 0.012° not; without the sine, 0.0056°)
    for (const [theta, theta4] of [
      [30, 110],
      [110, 30],
      [150, 110],
      [110, 150],
    ]) {
      const bentEnd = hcch(60, 1.09, theta, 1.09, theta4);
      expect(exactMissed(torsion(measured(bentEnd) + 0.008), bentEnd), `${theta} ${theta4}`).toBeNull();
      expect(exactMissed(torsion(measured(bentEnd) + 0.012), bentEnd), `${theta} ${theta4}`).not.toBeNull();
    }
  });

  it("compares a dihedral with its value the shorter way round, across ±180°", () => {
    const at = hcch(179.999);
    const phi = measured(at);
    expect(Math.abs(phi)).toBeCloseTo(179.999, 6);
    // (179.999° and -179.999° are 0.002° apart, not 359.998°)
    expect(exactMissed(torsion(-phi), at)).toBeNull();
    expect(exactMissed(torsion(phi + 360), at)).toBeNull();
    expect(exactMissed(torsion(-phi + 0.01 * Math.sign(phi)), at)).not.toBeNull();
  });

  it("is no dihedral where three of its atoms ended in a line, and is said so", () => {
    // (within LINE_WITHIN, 1°, of a line - the guard a torsion is refused by as it is made: 179.5° fails on the line, not on its
    //  angle, however near its value; a straight 180° too)
    for (const theta of [179.5, 180, 0.5]) {
      const at = hcch(60, 1.09, theta);
      expect(exactMissed(torsion(measured(at)), at), String(theta)).toBe(`Torsion 1-2-3-4 ended with three of its atoms in a line, within 1°: no torsion to hold at ${measured(at)}°`);
    }
    // (178.5°, outside it: judged by its lever - 1.09 sin 1.5° = 0.0285 Å, so about 0.2° - 0.1° off within, 0.3° not)
    const bent = hcch(60, 1.09, 178.5);
    expect(exactMissed(torsion(measured(bent) + 0.1), bent)).toBeNull();
    expect(exactMissed(torsion(measured(bent) + 0.3), bent)).not.toBeNull();
    // (an end atom ended within 1e-4 Å of its neighbour - no line, but no lever either: no torsion to hold, said so)
    const onto = hcch(60, 0.00005, 110);
    expect(exactMissed(torsion(measured(onto)), onto)).toBe(`Torsion 1-2-3-4 ended with an end atom within 0.0001 Å of its neighbour's axis: no torsion to hold at ${measured(onto)}°`);
  });

  it("says how a run that held one converged - no stationary point - with the rows, and any atoms held besides", () => {
    const at = hcch(60);
    const phi = measured(at);
    const held = worked(run([torsion(phi)], at));
    expect(convergedOf(held)).toMatchObject({ how: "optimisation with restraints held", rows: [torsion(phi)] });
    expect(convergedOf(held)?.held).toBeUndefined();
    expect(heldAt(convergedOf(held))).toBe(true);
    // (atoms fixed besides: said with them)
    const both = worked(workedOf("optimise", entryAt(at), output(at, { frames: [at, at] }), ["tightbind 0.2.0"], undefined, [0], true, [cc(1.54)]));
    expect(convergedOf(both)).toMatchObject({ how: "optimisation with restraints held", held: [0], rows: [cc(1.54)] });
    expect(heldWhy(convergedOf(both))).toBe("Optimised with distance 2-3 held at 1.54 Å and atom 1 held where it stood: no stationary point - optimise it free of them first");
    // (to a saddle point, alike)
    expect(convergedOf(worked(run([cc(1.54)], at, "saddle-point")))?.how).toBe("saddle point optimisation with restraints held");
    // (Frequencies at that geometry carry how it converged, and so what it held)
    const freq = worked(workedOf("frequencies", held, output(at, { frames: [at], optimised: undefined }), ["tightbind 0.2.0"]));
    expect(convergedOf(freq)?.rows).toEqual([torsion(phi)]);
  });

  it("is held by an optimisation alone: an energy or frequencies run given one neither checks it nor is said held", () => {
    // (its output read as one that converged - an optimisation's, say - and the row 0.04 Å off where it ended: still neither)
    const at = hcch(60);
    for (const kind of ["energy", "frequencies"] as const) {
      const w = workedOf(kind, entryAt(at), output(at, { frames: [at], energies: [-5.08], optimised: true }), ["tightbind 0.2.0"], undefined, [], true, [cc(1.5)]);
      expect(isFailure(w), kind).toBe(false);
      expect(convergedOf(w as Worked)?.rows, kind).toBeUndefined();
    }
  });

  it("keeps its own copy of the rows it held, whatever is done to those it was given", () => {
    const given = [cc(1.54)];
    const c = convergedAt("optimisation with restraints held", hcch(60), undefined, given);
    given[0].atoms[0] = 3;
    expect(c.rows).toEqual([cc(1.54)]);
  });

  it("fails an entry whose row ended off its value, saying where - never passed on as held", () => {
    const at = hcch(60);
    expect(run([cc(1.5)], at)).toEqual({ kind: "failed", why: "Distance 2-3 ended at 1.54000 Å, held at 1.5 Å" });
    // (a run not converged is said so, as ever: it may have stopped short of the value it was making for)
    expect(run([cc(1.5)], at, "optimise", { optimised: false })).toMatchObject({ failed: { kind: "not-converged" } });
  });

  it("is no minimum for a step that takes minima, until it is optimised free of it", () => {
    const at = hcch(60);
    const held = worked(run([cc(1.54)], at));
    expect(heldWhy(convergedOf(held))).toBe("Optimised with distance 2-3 held at 1.54 Å: no stationary point - optimise it free of it first");
    expect(notAllMinima([held])).toBe("a #1: optimised with distance 2-3 held at 1.54 Å: no stationary point - optimise it free of it first");
    const phi = Math.round(measured(at) * 1e6) / 1e6;
    const two = worked(run([cc(1.54), torsion(phi)], at));
    expect(heldWhy(convergedOf(two))).toBe(`Optimised with distance 2-3 held at 1.54 Å and torsion 1-2-3-4 held at ${phi}°: no stationary point - optimise it free of them first`);
    const again = worked(workedOf("optimise", held, output(hcch(65), { frames: [at, hcch(65)] }), ["tightbind 0.2.0"]));
    expect(notAllMinima([again])).toBeNull();
  });

  it("goes through a file and back with the rows it held - a record that does not say them as it must, none", () => {
    const at = hcch(60);
    const held = worked(run([{ kind: "fixed", atoms: [1] }, cc(1.54)], at));
    const e = entryAt(at);
    const m = { id: 1, at: { x: 0, y: 0 }, atoms: e.atoms.map((a, k) => ({ ...a, x: at[3 * k], y: at[3 * k + 1], z: at[3 * k + 2] })), bonds: e.bonds, converged: [held.converged] } as unknown as Molecule3D;
    const back = readCarried3D(JSON.parse(JSON.stringify(m)));
    expect(back?.converged).toEqual([{ how: "optimisation with restraints held", geometry: held.converged!.geometry, held: [1], rows: [cc(1.54)] }]);
    const g = held.converged!.geometry;
    const how = "optimisation with restraints held";
    // (rows not as the record writes one held exactly: none)
    for (const bad of [[], [{ ...cc(1.54), exact: undefined }], [{ ...cc(1.54), strength: 500 }], [{ ...cc(1.54), atoms: [1] }], [{ ...cc(1.54), atoms: [1, 1] }], [{ ...cc(1.54), atoms: [0, 0, 2] }], [{ ...cc(1.54), atoms: [-1, 2] }], [{ ...cc(1.54), atoms: [1.5, 2] }], [{ ...cc(1.54), value: "1.54" }], [{ kind: "fixed", atoms: [0], exact: true }], "rows", null])
      expect(convergedIn({ how, geometry: g, rows: bad }), JSON.stringify(bad)).toBeNull();
    // (how and what it lists agree, or none: rows said only "with restraints held", which must list some)
    expect(convergedIn({ how, geometry: g })).toBeNull();
    expect(convergedIn({ how, geometry: g, held: [0] })).toBeNull();
    expect(convergedIn({ how: "optimisation", geometry: g, rows: [cc(1.54)] })).toBeNull();
    // (rows that do not read, of a run said free or holding atoms alone: none, never read back without them)
    expect(convergedIn({ how: "optimisation", geometry: g, rows: [] })).toBeNull();
    expect(convergedIn({ how: "optimisation with atoms held", geometry: g, held: [0], rows: "rows" })).toBeNull();
    expect(convergedIn({ how: "optimisation with atoms held", geometry: g, held: [0], rows: [cc(1.54)] })).toBeNull();
    expect(convergedIn({ how, geometry: g, held: [], rows: [cc(1.54)] })).toBeNull();
    expect(convergedIn({ how: "saddle point optimisation with restraints held", geometry: g, rows: [torsion(-60)] })).toEqual({ how: "saddle point optimisation with restraints held", geometry: g, rows: [torsion(-60)] });
  });
});
