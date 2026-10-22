import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { sharesOf } from "../utils/molecule3d";
import { factor } from "../../../../lib/units";
import { setEntries, type SetEntry } from "./entries";
import { runMeno } from "./meno";
import { conformersWorked, workedOf } from "./programs";
import { resultsOf, type RunResults } from "./run";

// docs/WORKFLOWS.md, *A part of a search*: a conformer set that is only some
// of a search's conformers shows no shares - shares worked out again over a
// part are not the compound's populations - unless a Populations step
// worked them out; and what a step makes of a part is a part too.

const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");
const kcal = (k: number) => -76 + k / KCAL_PER_HARTREE;

/** A water's conformers, a geometry each - its second hydrogen further along - with energies `above` its lowest, in kcal/mol. */
function waters(above: number[], extra: Partial<Molecule3D> = {}, id = 1): Molecule3D {
  const geo = (k: number) => [0, 0, 0, 1, 0, 0, -0.3, 0.95 + k * 0.4, 0];
  const first = geo(0);
  return {
    id,
    at: { x: 0, y: 0 },
    atoms: [0, 1, 2].map((i) => ({ el: i === 0 ? "O" : "H", x: first[3 * i], y: first[3 * i + 1], z: first[3 * i + 2] })),
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    ...(above.length > 1 ? { frames: above.slice(1).map((_, k) => geo(k + 1)) } : {}),
    energies: above.map(kcal),
    conformerSet: true,
    ...extra,
  };
}

/** A Meno step of `kind` run on `molecules`, a conformer set, and what its exits hold. */
function ran(kind: Parameters<typeof runMeno>[0], molecules: Molecule3D[], options?: Parameters<typeof runMeno>[3]): RunResults {
  const out = runMeno(kind, setEntries(molecules, "conformers"), "conformers", options);
  if (!out.ok) throw new Error(out.said);
  return resultsOf(out, kind);
}

const parts = (ms: readonly Omit<Molecule3D, "id" | "at">[]) => ms.map((m) => m.partOf ?? false);
const shown = (ms: readonly Omit<Molecule3D, "id" | "at">[]) => ms.map((m) => sharesOf(m) != null);

describe("a part of a search's conformers", () => {
  it("is what an Energy window splits from a compound, in either exit - a compound all within it, whole", () => {
    const split = ran("energy-window", [waters([0, 1, 4])], { window: 3 });
    expect([parts(split.molecules), parts(split.rest)]).toEqual([[true], [true]]);
    expect([shown(split.molecules), shown(split.rest)]).toEqual([[false], [false]]);
    const all = ran("energy-window", [waters([0, 1, 2])], { window: 3 });
    expect([parts(all.molecules), shown(all.molecules), all.rest]).toEqual([[false], [true], []]);
  });

  it("is what Choose one chooses from several, and the rest - one chosen from one, whole", () => {
    const three = ran("choose", [waters([0, 1, 2])]);
    expect([parts(three.molecules), parts(three.rest)]).toEqual([[true], [true]]);
    expect(shown(three.rest)).toEqual([false]);
    const one = ran("choose", [waters([0])]);
    expect([parts(one.molecules), one.rest]).toEqual([[false], []]);
  });

  it("is the copies Duplicates takes out; what it keeps is the compound as it came, its copies merged - a part only where that was", () => {
    // (the second 0.4 Å along from the first; the third the first again: its copy)
    const m = waters([0, 1, 0.5]);
    m.frames![1] = m.frames![0].map((v, i) => (i === 7 ? 0.95 : v));
    const out = ran("duplicates", [m], { rmsd: 0.125 });
    expect([out.molecules[0].energies!.length, out.rest[0].energies!.length]).toEqual([2, 1]);
    expect([parts(out.molecules), parts(out.rest)]).toEqual([[false], [true]]);
    expect(shown(out.molecules)).toEqual([true]);
    const ofPart = ran("duplicates", [{ ...m, partOf: true }], { rmsd: 0.125 });
    expect([parts(ofPart.molecules), parts(ofPart.rest)]).toEqual([[true], [true]]);
  });

  it("is not what Duplicates takes out of a compound set: copies of a structure, of no search", () => {
    // (three waters alike, each a molecule of its own: one kept, two copies set aside)
    const water = (id: number) => ({ ...waters([0]), id, conformerSet: false });
    const out = runMeno("duplicates", setEntries([water(1), water(2), water(3)], "molecules"), "molecules", { rmsd: 0.125 });
    const got = out.ok ? resultsOf(out, "duplicates") : undefined;
    expect([got?.molecules.length, got?.rest.length]).toEqual([1, 2]);
    expect([parts(got!.molecules), parts(got!.rest), got!.rest.map((m) => m.conformerSet)]).toEqual([[false], [false, false], [undefined, undefined]]);
  });

  it("is what any step makes of a part: one Meno's steps keep whole, or a program works out", () => {
    const part = waters([0, 1, 2], { partOf: true });
    expect(setEntries([part], "conformers").every((e) => e.partOf)).toBe(true);
    expect(parts(ran("energy-window", [part], { window: 3 }).molecules)).toEqual([true]);
    // (As conformers: a compound made of any entry that was a part, a part - each one's stereoisomer known, as As conformers asks)
    const single = { ...waters([0]), conformerSet: false };
    const known = { perceived: true as const, elements: [], key: "O", by: { plugin: "rdkit", version: "0.1.7" } };
    const singles = [...setEntries([{ ...single, partOf: true }], "molecules"), ...setEntries([{ ...single, id: 2 }], "molecules")].map((e) => ({ ...e, stereo: known }));
    const grouped = runMeno("as-conformers", singles, "molecules");
    expect(grouped.ok && resultsOf(grouped, "as-conformers").molecules.map((m) => m.partOf)).toEqual([true]);
    // (an optimisation of a part's conformer, a part still)
    const entry: SetEntry = setEntries([part], "conformers")[0];
    const xyz = [...entry.xyz];
    const optimised = workedOf("optimise", entry, { schema: 1, program: "a program", atoms: ["O", "H", "H"], frames: [xyz], energies: [-76] }, ["a program"]);
    expect(typeof optimised !== "string" && optimised.partOf).toBe(true);
  });

  it("is not what a conformer search finds anew from one of them: those it found are the compound's, whole", () => {
    const entry = setEntries([waters([0, 1], { partOf: true })], "conformers")[0];
    const found = conformersWorked(entry, { schema: 1, program: "search", atoms: ["O", "H", "H"], frames: [[...entry.xyz], [...entry.xyz]], energies: [-1, -0.99] }, ["search"]);
    expect(typeof found !== "string" && found.map((w) => w.partOf)).toEqual([undefined, undefined]);
  });

  it("shows the shares a Populations step worked out of it, saying at what temperature", () => {
    const out = runMeno("populations", setEntries([waters([0, 0], { partOf: true })], "conformers"), "conformers", { temperature: 298.15 });
    // (said of what they are: shares over the conformers given, not the compound's populations)
    expect(out.said).toBe("1 compound at 298.15 K, from electronic energies · shares over the 2 conformers given, part of a search");
    const [m] = out.ok ? resultsOf(out, "populations").molecules : [];
    expect([m.partOf, sharesOf(m)]).toEqual([true, [0.5, 0.5]]);
  });

  it("says no more than the temperature of a whole compound's, and of several, how many are parts", () => {
    const whole = runMeno("populations", setEntries([waters([0, 0, 1])], "conformers"), "conformers", { temperature: 298.15 });
    expect(whole.said).toBe("1 compound at 298.15 K, from electronic energies");
    const both = runMeno("populations", setEntries([waters([0, 1]), waters([0, 2], { partOf: true }, 2)], "conformers"), "conformers", { temperature: 300 });
    expect(both.said).toBe("2 compounds at 300 K, from electronic energies · 1 of them part of a search, shares over the conformers given");
  });
});
