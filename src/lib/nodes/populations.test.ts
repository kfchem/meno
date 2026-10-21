import { describe, expect, it } from "vitest";
import type { By } from "../entry";
import { convert } from "../units";
import { PROPERTY } from "./base";
import { CONFIGURATIONS, populations } from "./populations";
import { entry, quantity } from "./testEntries";

const by = { program: "P", method: "M", basis: "B", treatment: "T" };
/** A free energy `kcal` kcal/mol above a reference, in hartrees, at 298.15 K. */
const g = (kcal: number, at: { kelvin?: number; atm?: number; solvent?: string } = { kelvin: 298.15, atm: 1 }, who: By = by) =>
  quantity(-100 + convert(kcal, "kcal/mol", "Eh"), "Eh", who, at);
const share = (e: { properties: Record<string, { value: unknown }> }) => e.properties[PROPERTY.population].value as number;

describe("Populations", () => {
  it("gives methylcyclohexane's chairs their shares from its free energy difference: 95.0% equatorial at 298.15 K", () => {
    // (the methyl group's A value, the axial chair's free energy above the equatorial's: 1.74 kcal/mol - E. L. Eliel,
    // S. H. Wilen, L. N. Mander, Stereochemistry of Organic Compounds, Wiley, 1994, Table 11.7. By hand: RT at
    // 298.15 K is 0.592485 kcal/mol (R = 8.314462618 J/(mol K), CODATA 2018, over 4.184 J/cal); K = exp(1.74/0.592485)
    // = 18.86, so the equatorial chair is 18.86/19.86 = 0.94964 - "about 95% equatorial" at room temperature, as
    // the text says)
    const out = populations([entry("eq", { [PROPERTY.freeEnergy]: g(0) }, "a"), entry("ax", { [PROPERTY.freeEnergy]: g(1.74) }, "a")], { kelvin: 298.15 });
    if (!out.ok) throw new Error(out.said);
    const [eq, ax] = out.exits.done;
    expect(share(eq)).toBeCloseTo(0.94964, 5);
    expect(share(ax)).toBeCloseTo(0.05036, 5);
    expect(out.exits.failed).toEqual([]);
    // (each share says the temperature, and what worked out the free energies it is of)
    expect(eq.properties[PROPERTY.population]).toMatchObject({ unit: "none", at: { kelvin: 298.15, atm: 1 }, by });
    expect(out.said).toBe(`Shares from free energy at 298.15 K · 2 in 1 group · ${CONFIGURATIONS}`);
    // (and each share says it: the record holds no configuration yet, so a group may hold two)
    expect(eq.properties[PROPERTY.population].note).toBe("configurations (R/S, E/Z) not told apart: stereoisomers in one group share one sum");
  });

  it("counts each as many times as its degeneracy says: 2 forms 0.5 kcal/mol up against 1, 46.24% at 298.15 K", () => {
    // (by hand: 2 exp(-0.5/0.592485) = 0.86000; 0.86000/1.86000 = 0.46238)
    const deg = (n: number) => quantity(n, "none");
    const out = populations(
      [entry("a", { [PROPERTY.freeEnergy]: g(0), [PROPERTY.degeneracy]: deg(1) }, "a"), entry("b", { [PROPERTY.freeEnergy]: g(0.5), [PROPERTY.degeneracy]: deg(2) }, "a")],
      { kelvin: 298.15 },
    );
    if (!out.ok) throw new Error(out.said);
    expect(share(out.exits.done[1])).toBeCloseTo(0.46238, 5);
  });

  it("weights each group on its own, its shares adding up to one", () => {
    const out = populations(
      [entry("a1", { [PROPERTY.freeEnergy]: g(0) }, "a"), entry("b1", { [PROPERTY.freeEnergy]: g(5) }, "b"), entry("a2", { [PROPERTY.freeEnergy]: g(1) }, "a"), entry("b2", { [PROPERTY.freeEnergy]: g(5) }, "b")],
      { kelvin: 298.15 },
    );
    if (!out.ok) throw new Error(out.said);
    const by = Object.fromEntries(out.exits.done.map((e) => [e.id, share(e)]));
    expect(by.a1 + by.a2).toBeCloseTo(1, 12);
    expect(by.b1).toBeCloseTo(0.5, 12);
    expect(by.a1).toBeCloseTo(0.84394, 5);
  });

  it("never weights the electronic energy in a free energy's place: those with only an energy fail, and their group with them", () => {
    const out = populations([entry("ok", { [PROPERTY.freeEnergy]: g(0) }, "a"), entry("e-only", { [PROPERTY.energy]: quantity(-100, "Eh", by) }, "a"), entry("other", { [PROPERTY.freeEnergy]: g(0) }, "b")], { kelvin: 298.15 });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.done.map((e) => e.id)).toEqual(["other"]);
    expect(out.exits.failed.map((e) => [e.id, e.status])).toEqual([
      ["ok", { failed: "another in its group could not be weighted (e-only: it has no free energy (thermo.free-energy), only an electronic energy, which is not weighted in its place)" }],
      ["e-only", { failed: "it has no free energy (thermo.free-energy), only an electronic energy, which is not weighted in its place" }],
    ]);
    // (counted: 1 + 2 = 3 came in)
    expect(out.said).toBe(`Shares from free energy at 298.15 K · 1 in 1 group · 2 failed · ${CONFIGURATIONS}`);
  });

  it("weights a group only where its free energies add up in one sum: one temperature (the node's), pressure, solvent, method and thermal treatment", () => {
    const two = (p: ReturnType<typeof g>, q: ReturnType<typeof g>) => populations([entry("p", { [PROPERTY.freeEnergy]: p }, "a"), entry("q", { [PROPERTY.freeEnergy]: q }, "a")], { kelvin: 298.15 });
    const why = (o: ReturnType<typeof two>) => (o.ok ? o.exits.failed.map((e) => (e.status as { failed: string }).failed) : [o.said]);
    expect(why(two(g(0), g(0, { kelvin: 310 })))).toEqual(["another in its group could not be weighted (q: its free energy is at 310 K, not 298.15 K)", "its free energy is at 310 K, not 298.15 K"]);
    expect(why(two(g(0), g(0, { kelvin: 298.15 }))).every((w) => w.includes("pressure: 1 atm (p) and not stated (q)"))).toBe(true);
    expect(why(two(g(0), g(0, { kelvin: 298.15, atm: 1, solvent: "S(water)" }))).every((w) => w.includes("solvent: none (gas phase) (p) and S(water) (q)"))).toBe(true);
    expect(why(two(g(0), g(0, undefined, { ...by, method: "N" }))).every((w) => w.includes("method: M (p) and N (q)"))).toBe(true);
    // (a free energy whose thermal treatment is unknown never goes with one whose is known)
    const { treatment: _, ...unknown } = by;
    expect(why(two(g(0), g(0, undefined, unknown))).every((w) => w.includes("thermal treatment: T (p) and unknown (q)"))).toBe(true);
    expect(why(two(g(0, { atm: 1 }), g(0)))[0]).toBe("its free energy does not say the temperature it was worked out at");
  });

  it("weights by degeneracy only where every one in a group has one", () => {
    const out = populations([entry("a", { [PROPERTY.freeEnergy]: g(0), [PROPERTY.degeneracy]: quantity(2, "none") }, "a"), entry("b", { [PROPERTY.freeEnergy]: g(0) }, "a")], { kelvin: 298.15 });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.failed.map((e) => (e.status as { failed: string }).failed)).toEqual(["only 1 of the 2 in its group have a degeneracy", "only 1 of the 2 in its group have a degeneracy"]);
  });

  it("refuses a temperature of 0 K or below, and nothing to weigh", () => {
    expect(populations([entry("a", { [PROPERTY.freeEnergy]: g(0) }, "a")], { kelvin: 0 })).toEqual({ ok: false, said: "The temperature must be above 0 K" });
    expect(populations([], { kelvin: 298.15 })).toEqual({ ok: false, said: "Nothing came in" });
    // (an entry with no group has nothing to be weighted within)
    const out = populations([entry("a", { [PROPERTY.freeEnergy]: g(0) })], { kelvin: 298.15 });
    expect(out.ok && out.exits.failed[0].status).toEqual({ failed: "it has no group to be weighted within" });
  });
});
