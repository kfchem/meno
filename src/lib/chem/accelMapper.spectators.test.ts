import { describe, expect, it } from "vitest";
import {
  ACCEL_EXACT,
  Atoms,
  BondType,
  EVALUATION_KEYS,
  MENO_DEPARTURES,
  SPECTATORS_AT_LEAST,
  _correct_maps,
  _get_maps,
  _order_maps,
  hungarian,
  spectatorKinds,
  type Departures,
  type Evaluated,
} from "./accelMapper";
import type { Molecule } from "./molecule";
import { enol, sn2, withWaters } from "./reactionMap.fixtures";

/**
 * `spectatorsByRmsd` and `spectatorsRefined` (docs/ATOM-MAPPING.md, *Like
 * molecules standing apart*) beside the port without them: the same
 * solute maps, the same ranking but for the like molecules' total RMSD,
 * which is never higher - and far fewer calls.
 */

function atomsOf(m: Molecule): Atoms {
  const atoms = new Atoms();
  for (const a of m.atoms) atoms.getNewAtom([a.el, a.x, a.y, a.z]);
  atoms.initBonds();
  for (const b of m.bonds) atoms.addBond(b.a1 + 1, b.a2 + 1, b.order >= 1 && b.order <= 4 ? b.order : BondType.undefined);
  return atoms;
}

function run(r: Molecule, p: Molecule, dep: Departures) {
  const A = atomsOf(r);
  const B = atomsOf(p);
  let calls = 0;
  let ev: Evaluated[] = [];
  _order_maps(A, B, _correct_maps(A, B, _get_maps(A, B, [], null, 0, { getMaps: () => calls++ }, dep)), {}, { orderMaps: (e) => (ev = e) }, dep);
  const held = new Set(spectatorKinds(A, B).flatMap((k) => [...k]));
  const solute = (e: Evaluated) =>
    e.map
      .filter((pr) => !held.has(pr[1]))
      .map((pr) => `${pr[1].number}>${pr[0].number}`)
      .sort()
      .join(" ");
  return { calls, ev, solutes: new Set(ev.map(solute)), first: ev[0], firstSolute: solute(ev[0]) };
}

const s = sn2();
const e = enol();
const CASES: [string, Molecule, Molecule][] = [
  ["an SN2 beside four waters", withWaters(s.reactant, 4, 3), withWaters(s.product, 4, 5)],
  ["an enolisation beside four waters", withWaters(e.reactant, 4, 7), withWaters(e.product, 4, 11)],
];

describe("like molecules standing apart, placed by RMSD", () => {
  it("are found: four or more of one kind, as many on each side", () => {
    const [, r, p] = CASES[0];
    const kinds = spectatorKinds(atomsOf(r), atomsOf(p));
    expect(SPECTATORS_AT_LEAST).toBe(4);
    expect(kinds.length).toBe(1);
    expect(kinds[0].size).toBe(2 * 4 * 3);
    // three waters are not enough
    expect(spectatorKinds(atomsOf(withWaters(s.reactant, 3, 3)), atomsOf(withWaters(s.product, 3, 5))).length).toBe(0);
  });

  for (const [name, r, p] of CASES) {
    for (const [mode, base] of [
      ["exactly otherwise", ACCEL_EXACT],
      ["with the other departures", MENO_DEPARTURES],
    ] as const) {
      it(`${name}, ${mode}: the same solute maps and ranking, a total RMSD no higher`, { timeout: 120_000 }, () => {
        const literal = run(r, p, { ...base, spectatorsByRmsd: false, spectatorsRefined: false });
        const block = run(r, p, { ...base, spectatorsByRmsd: true, spectatorsRefined: false });
        const refined = run(r, p, { ...base, spectatorsByRmsd: true, spectatorsRefined: true });
        for (const got of [block, refined]) {
          expect([...got.solutes].sort()).toEqual([...literal.solutes].sort());
          expect(got.firstSolute).toBe(literal.firstSolute);
          for (const k of EVALUATION_KEYS.slice(0, -1)) expect(got.first[k]).toBe(literal.first[k]);
          // (an SN2's pieces apart: ACCeL tries every permutation of the waters; one molecule's enolisation, it does not)
          if (name.includes("SN2")) expect(got.calls).toBeLessThan(literal.calls);
        }
        expect(refined.first.total_rmsd).toBeLessThanOrEqual(literal.first.total_rmsd + 1e-9);
        expect(refined.first.total_rmsd).toBeLessThanOrEqual(block.first.total_rmsd + 1e-9);
      });
    }
  }
});

describe("hungarian", () => {
  it("finds the least-cost assignment", () => {
    expect(
      hungarian([
        [4, 1, 3],
        [2, 0, 5],
        [3, 2, 2],
      ]),
    ).toEqual([1, 0, 2]);
    expect(hungarian([[7]])).toEqual([0]);
  });
});
