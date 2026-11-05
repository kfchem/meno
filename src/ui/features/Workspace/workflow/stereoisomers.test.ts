import { describe, expect, it } from "vitest";
import type { ChemClient } from "../../../../lib/roles/client";
import { v2000 } from "../../../../lib/chem/testdata/v2000";
import { STEREO_OPTIONS, stereoisomersAnswer } from "./stereoisomers";
import { optionsOf } from "./kinds";

/** The plugin that finds stereoisomers, scripted: the elements it perceives, and what it makes as asked - each request kept. */
function plugin(elements: unknown, made?: unknown) {
  const asked: { op: string; args: Record<string, unknown>; ms?: number }[] = [];
  const chem = {
    request: async (op: string, args: Record<string, unknown>, ms?: number) => {
      asked.push({ op, args, ms });
      if (op === "stereo_elements") return elements;
      if (op === "stereoisomers") return made;
      throw new Error(`no ${op} here`);
    },
  } as unknown as ChemClient;
  return { chem, asked };
}

const DEFAULTS = optionsOf(STEREO_OPTIONS, {});
/** Butan-2-ol, drawn flat: its carbinol carbon open. */
const BUTANOL = v2000(["C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]]);
const CENTRE = { read: true, elements: [{ kind: "centre", at: 1, state: "unspecified" }] };
const none = { centres: [], doubles: [] };

describe("Stereoisomers, Meno's", () => {
  it("keeps one as drawn where nothing is left open - asking for none of its stereoisomers", async () => {
    const { chem, asked } = plugin({ read: true, elements: [{ kind: "centre", at: 1, state: "specified" }] });
    expect(await stereoisomersAnswer(chem, [BUTANOL], DEFAULTS, "RDKit")).toEqual({ as: "drawn" });
    expect(asked.map((a) => a.op)).toEqual(["stereo_elements"]);
  });

  it("asks for them whole, as many as its options allow, in their time - each as a drawing - and gives them in the order of their SMILES", async () => {
    const made = { isomers: [{ configured: none, smiles: "C[C@H](O)CC", molblock: "second" }, { configured: none, smiles: "C[C@@H](O)CC", molblock: "first" }], free: false };
    const { chem, asked } = plugin(CENTRE, made);
    expect(await stereoisomersAnswer(chem, [BUTANOL], DEFAULTS, "RDKit")).toEqual({ made: ["first", "second"], smiles: ["C[C@@H](O)CC", "C[C@H](O)CC"] });
    expect(asked[1]).toEqual({
      op: "stereoisomers",
      args: { molblocks: [BUTANOL], open: { atoms: [1], bonds: [] }, configured: none, notEnumerated: [], most: 32, inThreeD: true, whole: true, withinMs: 30_000, drawings: true },
      // (a request's own two minutes past the time it is given)
      ms: 150_000,
    });
  });

  it("keeps one as drawn where what it leaves open can go one way only in 3D", async () => {
    const { chem } = plugin(CENTRE, { isomers: [{ configured: none, smiles: "C1CC2CCC1C2", molblock: "one" }], free: false });
    expect(await stereoisomersAnswer(chem, [BUTANOL], DEFAULTS, "RDKit")).toEqual({ as: "drawn" });
  });

  it("sets aside, saying why: too many, whole; too long, alone; left open, as its option says; one not drawn back, in the plugin's words", async () => {
    expect(await stereoisomersAnswer(plugin(CENTRE, { tooMany: { counted: 33, bound: 64 } }).chem, [BUTANOL], DEFAULTS, "RDKit")).toEqual({ aside: "more than the 32 stereoisomers made of one (up to 64)", kind: "too many" });
    expect(await stereoisomersAnswer(plugin(CENTRE, { tooLong: true }).chem, [BUTANOL], { ...DEFAULTS, within: 5 }, "RDKit")).toEqual({ aside: "took more than 5 s to examine", kind: "too long" });
    const two = { isomers: [{ configured: none, smiles: "a" }, { configured: none, smiles: "b" }], free: false };
    const aside = plugin(CENTRE, two);
    expect(await stereoisomersAnswer(aside.chem, [BUTANOL], { ...DEFAULTS, open: "aside" }, "RDKit")).toEqual({ aside: "stereo left open: 2 stereoisomers", kind: "stereo open" });
    // (set aside: no drawing asked for)
    expect(aside.asked[1].args.drawings).toBeUndefined();
    const adduct = { isomers: [{ configured: none, smiles: "a", molblock: "x" }, { configured: none, smiles: "b", error: "its coordination bond from N could not be written back as drawn" }], free: false };
    expect(await stereoisomersAnswer(plugin(CENTRE, adduct).chem, [BUTANOL], DEFAULTS, "RDKit")).toEqual({ aside: "its coordination bond from N could not be written back as drawn", kind: "drawing" });
  });

  it("sets aside an allene's axis left open, its stereoisomers never asked for", async () => {
    const allene = v2000(["C", "C", "C", "C", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 2], [3, 4, 1]]);
    const { chem, asked } = plugin({ read: true, elements: [{ kind: "double", at: 1, state: "unspecified" }, { kind: "double", at: 2, state: "unspecified" }] });
    expect(await stereoisomersAnswer(chem, [allene], DEFAULTS, "RDKit")).toEqual({ aside: "an allene's axis left open, which a drawing in 2D cannot give", kind: "axis" });
    expect(asked.map((a) => a.op)).toEqual(["stereo_elements"]);
  });

  it("passes by a C=N whose E/Z is none of its own, and says so on what it keeps or makes", async () => {
    // (a guanidine: CN=C(N)NCC(O)C, its C=N of either configuration and its carbinol carbon open)
    const guanidine = v2000(["C", "N", "C", "N", "N", "C", "C", "O", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 1], [2, 4, 1], [4, 5, 1], [5, 6, 1], [6, 7, 1], [6, 8, 1]]);
    const elements = { read: true, elements: [{ kind: "double", at: 1, state: "unknown" }, { kind: "centre", at: 6, state: "unspecified" }] };
    const made = { isomers: [{ configured: none, smiles: "b", molblock: "B" }, { configured: none, smiles: "a", molblock: "A" }], free: false };
    const { chem, asked } = plugin(elements, made);
    const note = {
      stereo_not_enumerated: {
        value: "E/Z of 1 C=N not enumerated: its double bond moves with a hydrogen on an N, O or S beside it (an amidine, a guanidine, an imidic acid) - no configuration of its own",
        unit: "none",
        method: "C=N bonds whose E/Z moves by tautomerism (InChI Technical Manual v1.04)",
      },
    };
    expect(await stereoisomersAnswer(chem, [guanidine], DEFAULTS, "RDKit")).toEqual({ made: ["A", "B"], smiles: ["a", "b"], properties: note });
    expect(asked[1].args).toMatchObject({ open: { atoms: [6], bonds: [] }, notEnumerated: [1] });
    // (nothing else open: kept as drawn, said so)
    const alone = plugin({ read: true, elements: [elements.elements[0]] });
    expect(await stereoisomersAnswer(alone.chem, [guanidine], DEFAULTS, "RDKit")).toEqual({ as: "drawn", properties: note });
  });

  it("sets aside one the plugin cannot read, or make sense of, naming the toolkit", async () => {
    expect(await stereoisomersAnswer(plugin({ read: false }).chem, [BUTANOL], DEFAULTS, "RDKit")).toEqual({ aside: "RDKit could not read it", kind: "unreadable" });
    expect(await stereoisomersAnswer(plugin({ read: true, problem: "SANITIZE_PROPERTIES" }).chem, [BUTANOL], DEFAULTS, "RDKit")).toEqual({ aside: "RDKit could not read it (SANITIZE_PROPERTIES)", kind: "valence" });
  });
});
