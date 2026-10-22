import { describe, expect, it } from "vitest";
import type { By } from "../entry";
import { convert } from "../units";
import { PROPERTY, reasonOf } from "./base";
import { populations } from "./populations";
import { entry, perceived, quantity } from "./testEntries";

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
    expect(out.said).toBe("Shares from free energy at 298.15 K · 2 in 1 group");
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
    expect(out.said).toBe(
      "Shares from free energy at 298.15 K · 1 in 1 group · 2 failed (1: another in its group could not be weighted (e-only: it has no free energy (thermo.free-energy), only an electronic energy, which is not weighted in its place); 1: it has no free energy (thermo.free-energy), only an electronic energy, which is not weighted in its place)",
    );
  });

  it("weights a group only where its free energies add up in one sum: one temperature (the node's), pressure, solvent, method and thermal treatment", () => {
    const two = (p: ReturnType<typeof g>, q: ReturnType<typeof g>) => populations([entry("p", { [PROPERTY.freeEnergy]: p }, "a"), entry("q", { [PROPERTY.freeEnergy]: q }, "a")], { kelvin: 298.15 });
    const why = (o: ReturnType<typeof two>) => (o.ok ? o.exits.failed.map((e) => (e.status as { failed: string }).failed) : [o.said]);
    expect(why(two(g(0), g(0, { kelvin: 310 })))).toEqual(["another in its group could not be weighted (q: its free energy is at 310 K, not 298.15 K)", "its free energy is at 310 K, not 298.15 K"]);
    expect(why(two(g(0), g(0, { kelvin: 298.15 }))).every((w) => w.includes("pressure: 1 atm (p) and not stated (q)"))).toBe(true);
    expect(why(two(g(0, { kelvin: 298.15, atm: 1, solvent: "none" }), g(0, { kelvin: 298.15, atm: 1, solvent: "S(water)" }))).every((w) => w.includes("solvent: none (gas phase) (p) and S(water) (q)"))).toBe(true);
    // (the gas phase stated never goes with a solvent not stated: absent is not the gas phase)
    expect(why(two(g(0, { kelvin: 298.15, atm: 1, solvent: "none" }), g(0))).every((w) => w.includes("solvent: none (gas phase) (p) and not stated (q)"))).toBe(true);
    expect(why(two(g(0), g(0, undefined, { ...by, method: "N" }))).every((w) => w.includes("method: M (p) and N (q)"))).toBe(true);
    // (a free energy whose thermal treatment is unknown never goes with one whose is known)
    const { treatment: _, ...unknown } = by;
    expect(why(two(g(0), g(0, undefined, unknown))).every((w) => w.includes("thermal treatment: T (p) and unknown (q)"))).toBe(true);
    expect(why(two(g(0, { atm: 1 }), g(0)))[0]).toBe("its free energy does not say the temperature it was worked out at");
  });

  it("takes a solvent and a thermal treatment as their words are, whole: two free energies alike but for the solvation's reference state, or a frequency scaling, stay apart", () => {
    const two = (p: ReturnType<typeof g>, q: ReturnType<typeof g>) => populations([entry("p", { [PROPERTY.freeEnergy]: p }, "a"), entry("q", { [PROPERTY.freeEnergy]: q }, "a")], { kelvin: 298.15 });
    const failed = (o: ReturnType<typeof two>) => (o.ok ? o.exits.failed.map((e) => (e.status as { failed: string }).failed) : [o.said]);
    const at = (solvent: string) => ({ kelvin: 298.15, atm: 1, solvent });
    // (the reference states a program prints with its solvation model differ in G by 1.90 kcal/mol: never one sum)
    const gsolv = "ALPB(water), reference state gsolv [1 M gas/solution]";
    const bar1M = "ALPB(water), reference state bar1M [1 bar gas/1 M solution]";
    expect(failed(two(g(0, at(gsolv)), g(0, at(bar1M)))).every((w) => w.includes(`solvent: ${gsolv} (p) and ${bar1M} (q)`))).toBe(true);
    // (nor with the same model printed with no reference state)
    expect(failed(two(g(0, at(gsolv)), g(0, at("ALPB(water)")))).every((w) => w.includes(`solvent: ${gsolv} (p) and ALPB(water) (q)`))).toBe(true);
    // (a thermal treatment with its frequencies scaled is another treatment)
    const scaled = { ...by, treatment: "T, frequencies scaled by 1.03" };
    expect(failed(two(g(0), g(0, undefined, scaled))).every((w) => w.includes("thermal treatment: T (p) and T, frequencies scaled by 1.03 (q)"))).toBe(true);
    // (and the same words, whole, are one sum)
    const same = two(g(0, at(gsolv)), g(0, at(gsolv)));
    expect(same.ok && same.exits.done.map(share)).toEqual([0.5, 0.5]);
  });

  it("weights by degeneracy only where every one in a group has one", () => {
    const out = populations([entry("a", { [PROPERTY.freeEnergy]: g(0), [PROPERTY.degeneracy]: quantity(2, "none") }, "a"), entry("b", { [PROPERTY.freeEnergy]: g(0) }, "a")], { kelvin: 298.15 });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.failed.map((e) => (e.status as { failed: string }).failed)).toEqual(["only 1 of the 2 in its group have a degeneracy", "only 1 of the 2 in its group have a degeneracy"]);
  });

  it("never weights stereoisomers in one sum: a group of two configurations - cis and trans 1,4-dimethylcyclohexane - fails whole", () => {
    // (two centres each, the keys of cis and trans different, as the plugin gives them)
    const centres = [
      { kind: "centre" as const, atoms: [0], specified: true },
      { kind: "centre" as const, atoms: [3], specified: true },
    ];
    const out = populations(
      [entry("cis", { [PROPERTY.freeEnergy]: g(0) }, "a", perceived("cis-key", centres)), entry("trans", { [PROPERTY.freeEnergy]: g(1) }, "a", perceived("trans-key", centres))],
      { kelvin: 298.15 },
    );
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.done).toEqual([]);
    expect(out.exits.failed.map((e) => (e.status as { failed: string }).failed)).toEqual([
      "its group holds 2 configurations - different stereoisomers, which are not weighted in one sum",
      "its group holds 2 configurations - different stereoisomers, which are not weighted in one sum",
    ]);
    // ((R)- and (S)-2-butanol alike, one centre each; and the same configuration weighs as one)
    const one = [{ kind: "centre" as const, atoms: [1], specified: true }];
    const r = (id: string, kcal: number, key: string) => entry(id, { [PROPERTY.freeEnergy]: g(kcal) }, "b", perceived(key, one));
    expect(populations([r("R", 0, "R-key"), r("S", 0, "S-key")], { kelvin: 298.15 }).ok && "refused").toBe("refused");
    const same = populations([r("R1", 0, "R-key"), r("R2", 1, "R-key")], { kelvin: 298.15 });
    expect(same.ok && same.exits.done.length).toBe(2);
  });

  it("weights no group whose configuration was not perceived, or left unspecified, saying which", () => {
    const why = (stereo: Parameters<typeof entry>[3]) => {
      const out = populations([entry("x", { [PROPERTY.freeEnergy]: g(0) }, "a", stereo), entry("y", { [PROPERTY.freeEnergy]: g(1) }, "a")], { kelvin: 298.15 });
      return out.ok ? (out.exits.failed[0]?.status as { failed: string } | undefined)?.failed : out.said;
    };
    expect(why(null)).toBe("its configuration (R/S, E/Z) was not perceived, so stereoisomers could not be told apart");
    expect(why({ perceived: false, why: "no plugin perceives it" })).toBe("its configuration (R/S, E/Z) was not perceived (no plugin perceives it), so stereoisomers could not be told apart");
    expect(why(perceived("k", [{ kind: "double", atoms: [1, 2], specified: false }]))).toBe("a configuration of it (R/S, E/Z) is left unspecified");
    // (one perceived with no stereogenic element - methylcyclohexane - weighs as any other)
    expect(why(perceived())).toBeUndefined();
  });

  it("weights no group with one that is no minimum - its calculation judged it has an imaginary frequency - saying which", () => {
    const saddle = entry("b", { [PROPERTY.freeEnergy]: g(1), [PROPERTY.imaginary]: quantity(1, "none") }, "a");
    const out = populations([entry("a", { [PROPERTY.freeEnergy]: g(0) }, "a"), saddle], { kelvin: 298.15 });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.done).toEqual([]);
    expect(out.exits.failed.map((e) => reasonOf(e))).toEqual([
      "another in its group could not be weighted (b: it has 1 imaginary frequency: it is no minimum - take it out first)",
      "it has 1 imaginary frequency: it is no minimum - take it out first",
    ]);
    // (none judged imaginary: weighted)
    const fine = populations([entry("a", { [PROPERTY.freeEnergy]: g(0) }, "a"), entry("b", { [PROPERTY.freeEnergy]: g(1), [PROPERTY.imaginary]: quantity(0, "none") }, "a")], { kelvin: 298.15 });
    if (!fine.ok) throw new Error(fine.said);
    expect(fine.exits.done).toHaveLength(2);
  });

  it("refuses a temperature of 0 K or below, and nothing to weigh", () => {
    expect(populations([entry("a", { [PROPERTY.freeEnergy]: g(0) }, "a")], { kelvin: 0 })).toEqual({ ok: false, said: "The temperature must be above 0 K" });
    expect(populations([], { kelvin: 298.15 })).toEqual({ ok: false, said: "Nothing came in" });
    // (an entry with no group has nothing to be weighted within)
    const out = populations([entry("a", { [PROPERTY.freeEnergy]: g(0) })], { kelvin: 298.15 });
    expect(out.ok && out.exits.failed[0].status).toEqual({ failed: "it has no group to be weighted within" });
  });
});
