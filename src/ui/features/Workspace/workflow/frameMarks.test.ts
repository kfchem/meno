import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { sharesOf } from "../utils/molecule3d";
import { factor } from "../../../../lib/units";
import { MARKS_UNREAD, setEntries } from "./entries";
import { runMeno } from "./meno";
import { resultsOf, type RunResults } from "./run";
import { framesMolecule } from "./setTable";

// Each frame's marks - why it failed, its imaginary frequencies, whether its
// marks did not read - come through every place that makes a molecule of
// some frames or entries (workflow/entries `marksOf`): never a frame that is
// no minimum, or not known to be one, made to look like one.

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

const stopped = { kind: "stopped" as const, why: "it was stopped" };
/** Three conformers: the second stopped before it finished, the third judged a saddle point. */
const marked = () => waters([0, 1, 2], { failed: [null, stopped, null], imaginary: [null, null, [-120.5]] });
/** Three conformers whose file's marks of that did not read. */
const unread = () => waters([0, 1, 2], { marksUnread: true });

/** A Meno step of `kind` run on `molecules`, a conformer set, and what its exits hold. */
function ran(kind: Parameters<typeof runMeno>[0], molecules: Molecule3D[], options?: Parameters<typeof runMeno>[3]): RunResults {
  const out = runMeno(kind, setEntries(molecules, "conformers"), "conformers", options);
  if (!out.ok) throw new Error(out.said);
  return resultsOf(out, kind);
}

const marks = (m: Omit<Molecule3D, "id" | "at">) => ({ failed: m.failed, imaginary: m.imaginary, marksUnread: m.marksUnread });

describe("a frame's marks", () => {
  it("come with the frames a set's table makes a molecule of, each by its frame", () => {
    expect(marks(framesMolecule(marked(), [0, 1, 2]))).toEqual({ failed: [null, stopped, null], imaginary: [null, null, [-120.5]], marksUnread: undefined });
    expect(marks(framesMolecule(marked(), [2, 1]))).toEqual({ failed: [null, stopped], imaginary: [[-120.5], null], marksUnread: undefined });
    expect(marks(framesMolecule(marked(), [0]))).toEqual({ failed: undefined, imaginary: undefined, marksUnread: undefined });
    expect(framesMolecule(unread(), [1]).marksUnread).toBe(true);
    // (every frame picked, a conformer set whole again: no shares where one is no minimum, or not known to be one)
    expect(sharesOf(framesMolecule(unread(), [0, 1, 2]))).toBeUndefined();
  });

  it("come through Duplicates, Choose one - both its exits - Energy window's rest and As conformers", () => {
    expect(marks(ran("duplicates", [marked()]).molecules[0])).toEqual({ failed: [null, stopped, null], imaginary: [null, null, [-120.5]], marksUnread: undefined });
    const chosen = ran("choose", [marked()], { which: "number", number: 3 });
    expect(marks(chosen.molecules[0])).toEqual({ failed: undefined, imaginary: [[-120.5]], marksUnread: undefined });
    expect(marks(chosen.rest[0])).toEqual({ failed: [null, stopped], imaginary: undefined, marksUnread: undefined });
    expect(marks(ran("energy-window", [marked()], { window: 1.5 }).rest[0])).toEqual({ failed: undefined, imaginary: [[-120.5]], marksUnread: undefined });
    expect(ran("duplicates", [unread()]).molecules[0].marksUnread).toBe(true);
    // (Energy window refuses such a set, as Populations does: whether each is a minimum is not known)
    expect(runMeno("energy-window", setEntries([unread()], "conformers"), "conformers", { window: 1.5 })).toMatchObject({ ok: false });
    const picked = ran("choose", [unread()], { which: "number", number: 2 });
    expect([picked.molecules[0].marksUnread, picked.rest[0].marksUnread]).toEqual([true, true]);
    // (As conformers: single geometries grouped, each one's marks its frame's)
    const known = { perceived: true as const, elements: [], key: "O", by: { plugin: "rdkit", version: "0.1.7" } };
    const single = (extra: Partial<Molecule3D>, id: number) => setEntries([{ ...waters([0]), conformerSet: false, ...extra, id }], "molecules").map((e) => ({ ...e, stereo: known }));
    const grouped = runMeno("as-conformers", [...single({}, 1), ...single({ failed: [stopped] }, 2), ...single({ marksUnread: true }, 3)], "molecules");
    expect(grouped.ok && marks(resultsOf(grouped, "as-conformers").molecules[0])).toEqual({ failed: [null, stopped, null], imaginary: undefined, marksUnread: true });
  });

  it("not read are never lost on the way to Populations: what Duplicates kept of such a set is refused, and shows no shares", () => {
    const kept = ran("duplicates", [unread()]).molecules[0];
    const out = runMeno("populations", setEntries([{ ...kept, id: 1, at: { x: 0, y: 0 } }], "conformers"), "conformers", { temperature: 298.15 });
    expect(out.ok).toBe(false);
    expect(!out.ok && out.said).toContain(MARKS_UNREAD);
    expect(sharesOf(kept)).toBeUndefined();
  });
});
