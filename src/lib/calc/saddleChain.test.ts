import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../../ui/features/Workspace/store/types";
import { imaginaryOf, setEntries, type SetEntry } from "../../ui/features/Workspace/workflow/entries";
import { runMeno } from "../../ui/features/Workspace/workflow/meno";
import { isFailure, workedOf } from "../../ui/features/Workspace/workflow/programs";
import type { ReaderOutput } from "./output";
import { combine } from "./read";
import planar from "./fixtures/nh3-planar-read.json";
import pyramid from "./fixtures/nh3-pyramid-read.json";

/**
 * A program's verdict on imaginary frequencies, from its output to a step
 * after it - read (a reader's answers for ORCA 6.1.1's outputs, in Meno's
 * form), put together (`combine`), worked (`workedOf`), the
 * molecule a step's entry becomes, and the entries the next step reads of
 * it (`setEntries`). Ammonia at GFN2-xTB, ORCA's own (NATIVE-XTB2 NumFreq):
 * planar - "* xyz 0 1", N at the origin, three H 1.0 Å from it in its plane
 * at 120° - one imaginary frequency, -927.98 cm-1, the umbrella's; and its
 * pyramid, optimised, none.
 */
const entryOf = (number: number, out: ReaderOutput): SetEntry =>
  ({ compound: 0, number, atoms: out.atoms.map((el) => ({ el })), bonds: [1, 2, 3].map((k) => ({ a1: 0, a2: k, order: 1 })), xyz: out.frames[out.frames.length - 1] }) as unknown as SetEntry;

/** An output read, as a Frequencies step's entry becomes a molecule and the next step's entry is read of it. */
function through(number: number, read: ReaderOutput): SetEntry {
  const { output, readers } = combine([{ from: "cclib", version: "1.9rc1", output: read }]);
  const w = workedOf("frequencies", entryOf(number, read), output, readers);
  if (isFailure(w)) throw new Error(w.why);
  const m = {
    id: number,
    at: { x: 0, y: 0 },
    atoms: w.atoms.map((a, i) => ({ ...a, x: w.xyz[3 * i], y: w.xyz[3 * i + 1], z: w.xyz[3 * i + 2] })),
    bonds: w.bonds,
    ...(w.energy != null ? { energies: [w.energy] } : {}),
    ...(w.calc ? { calc: w.calc } : {}),
  } as unknown as Molecule3D;
  const [e] = setEntries([m], "molecules");
  return { ...e, number };
}
/** The same output, its vibrations not among what was read: the verdict alone. */
const verdictAlone = (read: ReaderOutput): ReaderOutput => ({ ...read, results: (read.results as { id: string }[]).filter((r) => r.id !== "vibrations") });

describe("a program's verdict on imaginary frequencies, from its output to the step after it", () => {
  const saddle = through(1, planar as unknown as ReaderOutput);
  const minimum = through(2, pyramid as unknown as ReaderOutput);

  it("reaches the entry - the saddle point's one, and none of the minimum's - and not computed where none judged", () => {
    expect(imaginaryOf(saddle)).toEqual([-927.98]);
    expect(imaginaryOf(minimum)).toEqual([]);
    // (none judged, with no vibrations read beside it: still none, never "not computed")
    expect(imaginaryOf(through(2, verdictAlone(pyramid as unknown as ReaderOutput)))).toEqual([]);
    // (none judged at all, and none read: not computed)
    const { imaginary: _i, ...unjudged } = verdictAlone(pyramid as unknown as ReaderOutput);
    expect(imaginaryOf(through(2, unjudged))).toBe("not computed");
  });

  it("is refused by Populations and Duplicates, as a saddle point among conformers is", () => {
    const said = "a #1 has 1 imaginary frequency, 928.0i cm⁻¹: it is no minimum - take it out first";
    expect(runMeno("populations", [minimum, saddle], "molecules", {})).toEqual({ ok: false, said });
    expect(runMeno("duplicates", [minimum, saddle], "molecules", {})).toEqual({ ok: false, said });
  });

  it("is what a Filter on it keeps: the saddle point, of one", () => {
    const kept = runMeno("filter", [minimum, saddle], "molecules", { conditions: "imaginary = 1" });
    expect(kept.ok && kept.kept.map((e) => e.number)).toEqual([1]);
  });

  it("is refused by Energy window; and a Filter on none keeps the minimum, with its vibrations read or not", () => {
    const conformers = [minimum, saddle].map((e) => ({ ...e, compound: 0 }));
    expect(runMeno("energy-window", conformers, "conformers", { window: 10 })).toMatchObject({ ok: false });
    for (const m of [minimum, through(2, verdictAlone(pyramid as unknown as ReaderOutput))]) {
      const kept = runMeno("filter", [m, saddle], "molecules", { conditions: "imaginary = 0" });
      expect(kept.ok && kept.kept.map((e) => e.number)).toEqual([2]);
    }
  });
});
