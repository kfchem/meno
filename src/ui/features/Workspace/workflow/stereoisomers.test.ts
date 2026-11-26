import { describe, expect, it, vi } from "vitest";
import type { ChemClient } from "../../../../lib/roles/client";
import { v2000 } from "../../../../lib/chem/testdata/v2000";
import { HEXAGON, v3000 } from "../../../../lib/chem/testdata/v3000";
import { drawnGroupsOf } from "../../../../lib/chem/stereoOpen";
import { STEREO_OPTIONS, stereoisomersAnswer } from "./stereoisomers";
import { optionsOf } from "./kinds";

/**
 * The plugin that makes stereoisomers, scripted: each request kept; asked to make one configuration whole (Meno's stereoisomers,
 * chem/menoIsomers), `make` answers it - the isomer, or none where it cannot be made; asked as a structure with groups, `made`.
 */
function plugin(make: (configured: Configured) => Record<string, unknown> | null, made?: unknown) {
  const asked: { op: string; args: Record<string, unknown>; ms?: number }[] = [];
  const chem = {
    request: async (op: string, args: Record<string, unknown>, ms?: number) => {
      asked.push({ op, args, ms });
      if (op !== "stereoisomers") throw new Error(`no ${op} here`);
      if (made !== undefined) return made;
      const one = make(args.configured as Configured);
      return { isomers: one ? [{ configured: args.configured, ...one }] : [], free: !one };
    },
  } as unknown as ChemClient;
  return { chem, asked };
}
type Configured = { centres: { atom: number; neighbours: number[]; sense: number }[]; doubles: { bond: number; ends: number[]; cis: boolean }[] };

const DEFAULTS = optionsOf(STEREO_OPTIONS, {});
/** Butan-2-ol, drawn flat: its carbinol carbon open - Meno counts two. */
const BUTANOL = v2000(["C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]]);
/** Each of butan-2-ol's two made, named by the sense Meno gave it. */
const byHand = (c: Configured) => (c.centres[0].sense > 0 ? { smiles: "C[C@H](O)CC", molblock: "second" } : { smiles: "C[C@@H](O)CC", molblock: "first" });

describe("Stereoisomers, Meno's", () => {
  it("keeps one as drawn where nothing is left open - asking the plugin nothing", async () => {
    const { chem, asked } = plugin(() => null);
    expect(await stereoisomersAnswer(chem, [v2000(["C", "C", "O"], [[0, 1, 1], [1, 2, 1]])], DEFAULTS, "Sketchkit")).toEqual({ as: "drawn" });
    expect(asked).toEqual([]);
  });

  it("counts them itself and gives each to the plugin whole, as many as its options allow, in their time - each as a drawing - in the order of their SMILES", async () => {
    const { chem, asked } = plugin(byHand);
    expect(await stereoisomersAnswer(chem, [BUTANOL], DEFAULTS, "Sketchkit")).toEqual({ made: ["first", "second"], smiles: ["C[C@@H](O)CC", "C[C@H](O)CC"] });
    expect(asked).toHaveLength(2);
    expect(asked.map((a) => (a.args.configured as Configured).centres)).toEqual([
      [{ atom: 1, neighbours: [0, 2, 4], sense: 1 }],
      [{ atom: 1, neighbours: [0, 2, 4], sense: -1 }],
    ]);
    expect(asked[0]).toMatchObject({ op: "stereoisomers", args: { molblocks: [BUTANOL], open: { atoms: [1], bonds: [] }, notEnumerated: [], most: 1, inThreeD: true, drawings: true }, ms: 150_000 });
  });

  it("gives each one the configuration the plugin made it with, sorted by SMILES with its drawing", async () => {
    const conf = (sense: number) => ({ centres: [{ atom: 1, neighbours: [0, 2, 4], sense }], doubles: [] });
    const { chem } = plugin((c) => ({ ...byHand(c), configuration: conf(c.centres[0].sense) }));
    expect(await stereoisomersAnswer(chem, [BUTANOL], DEFAULTS, "Sketchkit")).toEqual({ made: ["first", "second"], smiles: ["C[C@@H](O)CC", "C[C@H](O)CC"], configurations: [conf(-1), conf(1)] });
  });

  it("keeps one as drawn where only one of what it leaves open can be made in 3D", async () => {
    const { chem } = plugin((c) => (c.centres[0].sense > 0 ? { smiles: "C1CC2CCC1C2", molblock: "one" } : null));
    expect(await stereoisomersAnswer(chem, [BUTANOL], DEFAULTS, "Sketchkit")).toEqual({ as: "drawn" });
  });

  it("sets aside, saying why: too many, whole; too long, alone; left open, as its option says; one not drawn back, in the plugin's words", async () => {
    const many = plugin(byHand);
    expect(await stereoisomersAnswer(many.chem, [BUTANOL], { ...DEFAULTS, most: 1 }, "Sketchkit")).toEqual({ aside: "more than the 1 stereoisomers made of one (up to 2)", kind: "too many" });
    expect(many.asked).toEqual([]);
    // (its time past between two of them: the second never asked)
    let now = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => (now += 4000));
    expect(await stereoisomersAnswer(plugin(byHand).chem, [BUTANOL], { ...DEFAULTS, within: 5 }, "Sketchkit")).toEqual({ aside: "took more than 5 s to examine", kind: "too long" });
    clock.mockRestore();
    const aside = plugin(byHand);
    expect(await stereoisomersAnswer(aside.chem, [BUTANOL], { ...DEFAULTS, open: "aside" }, "Sketchkit")).toEqual({ aside: "stereo left open: 2 stereoisomers", kind: "stereo open" });
    // (set aside: no drawing asked for)
    expect(aside.asked[0].args.drawings).toBeUndefined();
    const adduct = plugin((c) => (c.centres[0].sense > 0 ? { smiles: "a", molblock: "x" } : { smiles: "b", error: "its coordination bond from N could not be written back as drawn" }));
    expect(await stereoisomersAnswer(adduct.chem, [BUTANOL], DEFAULTS, "Sketchkit")).toEqual({ aside: "its coordination bond from N could not be written back as drawn", kind: "drawing" });
  });

  it("sets aside an allene's axis left open, its stereoisomers never asked for", async () => {
    const allene = v2000(["C", "C", "C", "C", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 2], [3, 4, 1]]);
    const { chem, asked } = plugin(() => null);
    expect(await stereoisomersAnswer(chem, [allene], DEFAULTS, "Sketchkit")).toEqual({ aside: "an allene's axis left open, which a drawing in 2D cannot give", kind: "axis" });
    expect(asked).toEqual([]);
  });

  it("passes by a C=N whose E/Z is none of its own, and says so on what it keeps or makes", async () => {
    // (a guanidine: CN=C(N)NCC(O)C, its C=N of either configuration and its carbinol carbon open)
    const guanidine = v2000(["C", "N", "C", "N", "N", "C", "C", "O", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 1], [2, 4, 1], [4, 5, 1], [5, 6, 1], [6, 7, 1], [6, 8, 1]]);
    const { chem, asked } = plugin((c) => (c.centres[0].sense > 0 ? { smiles: "b", molblock: "B" } : { smiles: "a", molblock: "A" }));
    const note = {
      stereo_not_enumerated: {
        value: "E/Z of 1 C=N not enumerated: its double bond moves with a hydrogen on an N, O or S beside it (an amidine, a guanidine, an imidic acid) - no configuration of its own",
        unit: "none",
        method: "C=N bonds whose E/Z moves by tautomerism (InChI Technical Manual v1.04)",
      },
    };
    expect(await stereoisomersAnswer(chem, [guanidine], DEFAULTS, "Sketchkit")).toEqual({ made: ["A", "B"], smiles: ["a", "b"], properties: note });
    expect(asked[0].args).toMatchObject({ open: { atoms: [6], bonds: [] }, notEnumerated: [1] });
    // (nothing else open: kept as drawn, said so)
    const alone = v2000(["C", "N", "C", "N", "N"], [[0, 1, 1], [1, 2, 2], [2, 3, 1], [2, 4, 1]]);
    expect(await stereoisomersAnswer(plugin(() => null).chem, [alone], DEFAULTS, "Sketchkit")).toEqual({ as: "drawn", properties: note });
  });

  it("sets aside one Meno cannot read", async () => {
    expect(await stereoisomersAnswer(plugin(() => null).chem, ["no block"], DEFAULTS, "Sketchkit")).toEqual({ aside: "Meno could not read it", kind: "unreadable" });
  });
});

describe("Stereoisomers of a structure with AND and OR groups (foundation part 7)", () => {
  // (trans-2-methylcyclohexan-1-ol, its two centres and1 - and its O-sec-butyl ether, the side chain's centre drawn as it is)
  const ring = HEXAGON.map((p) => ({ el: "C", ...p }));
  const ringBonds = [0, 1, 2, 3, 4, 5].map((k) => ({ a: k, b: (k + 1) % 6, order: 1 }));
  const atoms = [...ring, { el: "O", x: 0, y: 3 }, { el: "C", x: 2.598, y: 1.5 }];
  const bonds = [...ringBonds, { a: 0, b: 6, order: 1, stereo: "up" as const }, { a: 1, b: 7, order: 1, stereo: "down" as const }];
  const RACEMATE = v3000(atoms, bonds, [{ name: "STERAC1", atoms: [0, 1] }]);
  const read = [...drawnGroupsOf([RACEMATE])!.read.values()];
  const half = (turn: boolean, molblock: string, smiles: string) => ({
    configured: { centres: read.map((c) => (turn ? { ...c, sense: c.sense > 0 ? -1 : 1 } : c)), doubles: [] },
    smiles,
    molblock,
  });

  it("makes each half, the half as drawn first, each as a drawing - though nothing is left open - and says which they are", async () => {
    const { chem, asked } = plugin(() => null, { isomers: [half(true, "turned", "a"), half(false, "drawn", "b")], free: false });
    const answer = await stereoisomersAnswer(chem, [RACEMATE], DEFAULTS, "Sketchkit");
    expect(answer).toMatchObject({ made: ["drawn", "turned"] });
    expect("made" in answer && answer.properties?.stereo_groups?.value).toBe("in order: and1 as drawn; and1 turned over");
    // (the groups' centres asked back; nothing open, so set aside never applies to them)
    expect((asked[0].args.open as { atoms: number[] }).atoms).toEqual([0, 1]);
    const aside = await stereoisomersAnswer(plugin(() => null, { isomers: [half(true, "turned", "a"), half(false, "drawn", "b")], free: false }).chem, [RACEMATE], optionsOf(STEREO_OPTIONS, { open: "aside" }), "Sketchkit");
    expect(aside).toMatchObject({ made: ["drawn", "turned"] });
  });

  it("keeps it as drawn where the turned half cannot be made, and says so", async () => {
    const { chem } = plugin(() => null, { isomers: [half(false, "drawn", "b")], free: false });
    expect(await stereoisomersAnswer(chem, [RACEMATE], DEFAULTS, "Sketchkit")).toMatchObject({
      as: "drawn",
      properties: { stereo_groups: { value: "and1 turned over cannot be made in 3D" } },
    });
  });
});
