import { describe, expect, it } from "vitest";
import { ACCEL_EXACT, Atoms, BondType, MENO_DEPARTURES, _correct_maps, _get_maps, _order_maps, type Chain, type Departures } from "./accelMapper";
import type { Molecule } from "./molecule";
import { dielsAlder, enol, oxaElectrocyclisation, sn2, withWaters } from "./reactionMap.fixtures";

/**
 * Meno's speed-ups give the maps the port gives without them, every map in
 * its order (docs/ATOM-MAPPING.md, *Speed*): a recursive _get_maps call is
 * answered from an earlier one of the same known pairs in another order
 * only where no tie on the way could tell the orders apart; here the maps
 * with that reuse and without it (`reuse: false`, every call made, as the
 * original makes them) are compared stage by stage, exactly and with the
 * departures - on reactions beside waters, where the recursion runs deep.
 */

function atomsOf(m: Molecule): Atoms {
  const atoms = new Atoms();
  for (const a of m.atoms) atoms.getNewAtom([a.el, a.x, a.y, a.z]);
  atoms.initBonds();
  for (const b of m.bonds) atoms.addBond(b.a1 + 1, b.a2 + 1, b.order >= 1 && b.order <= 4 ? b.order : BondType.undefined);
  return atoms;
}
const ser = (cs: Chain[]) => cs.map((c) => c.map((p) => `${p[0].number}:${p[1].number}`).join(" "));

function stages(r: Molecule, p: Molecule, dep: Departures, reuse: boolean) {
  const A = atomsOf(r);
  const B = atomsOf(p);
  let calls = 0;
  const raw = _get_maps(A, B, [], null, 0, { getMaps: () => calls++, reuse }, dep);
  const cor = _correct_maps(A, B, raw);
  const ord = _order_maps(A, B, cor, {}, undefined, dep);
  return { raw: ser(raw), cor: ser(cor), ord: ser(ord), calls };
}

const s = sn2();
const e = enol();
const da = dielsAlder();
const ox = oxaElectrocyclisation();
const CASES: [string, Molecule, Molecule][] = [
  ["SN2 beside three waters", withWaters(s.reactant, 3, 1), withWaters(s.product, 3, 2)],
  ["an enolisation beside three waters", withWaters(e.reactant, 3, 7), withWaters(e.product, 3, 11)],
  ["a Diels-Alder reaction beside two waters", withWaters(da.reactants[0], 2, 13), withWaters(da.product, 2, 17)],
  ["an oxa-electrocyclisation beside two waters", withWaters(ox.reactant, 2, 19), withWaters(ox.product, 2, 23)],
];

describe("reusing recursive calls changes no map", () => {
  for (const [name, r, p] of CASES) {
    for (const [mode, dep] of [
      ["exactly", ACCEL_EXACT],
      ["with the departures", MENO_DEPARTURES],
    ] as const) {
      // (ACCeL fails on the oxa-electrocyclisation; with the departures it maps)
      if (name.startsWith("an oxa") && mode === "exactly") continue;
      it(`${name}, ${mode}`, { timeout: 60_000 }, () => {
        const reused = stages(r, p, dep, true);
        const every = stages(r, p, dep, false);
        expect(reused.raw).toEqual(every.raw);
        expect(reused.cor).toEqual(every.cor);
        expect(reused.ord).toEqual(every.ord);
        expect(reused.calls).toBeLessThanOrEqual(every.calls);
      });
    }
  }

  it("makes far fewer calls where like molecules stand beside the reaction", { timeout: 60_000 }, () => {
    const [, r, p] = CASES[0];
    const reused = stages(r, p, ACCEL_EXACT, true);
    const every = stages(r, p, ACCEL_EXACT, false);
    expect(every.calls).toBeGreaterThan(5 * reused.calls);
  });
});
