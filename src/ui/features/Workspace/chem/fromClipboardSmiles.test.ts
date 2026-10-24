/**
 * A MOL file and a SMILES as the clipboard may hold them under their own
 * kinds (lib/clipboard `mol`, `smiles`; on a Mac, also under the type names
 * "com.mdli.molfile" and "org.opensmiles.smiles": src-tauri/src/clipboard.rs
 * `read_names`): a SMILES read as one; a MOL file before it, which keeps
 * where its atoms are.
 */
import { describe, expect, it, vi } from "vitest";
import { writeClipboard } from "../../../../lib/clipboard";
import type { Model } from "../store/types";
import { SEVERAL_SMILES, structureOnClipboard } from "./fromClipboard";

/** What a SMILES read is asked for, and what it gives: one atom per letter, in a row - the SMILES's own reading is the plugin's. */
const asked: string[] = [];
vi.mock("./fromSmiles", () => ({
  structureFromSmiles: async (smiles: string): Promise<Model> => {
    asked.push(smiles);
    return { atoms: [...smiles].map((c, i) => ({ id: i + 1, x: i, y: 0, r: 0.9, el: c })), bonds: [] };
  },
}));

/** A MOL file of ethanol, written by hand: its three heavy atoms where they are. */
const MOL = [
  "",
  "  hand-written",
  "",
  "  3  2  0  0  0  0  0  0  0  0999 V2000",
  "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    2.5981    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0",
  "  1  2  1  0",
  "  2  3  1  0",
  "M  END",
  "",
].join("\n");

describe("a structure pasted as a MOL file or a SMILES", () => {
  it("reads a SMILES given as one, as a SMILES typed in is", async () => {
    asked.length = 0;
    await writeClipboard([{ flavor: "smiles", text: "CCO\n" }]);
    const got = (await structureOnClipboard())!;
    expect(asked).toEqual(["CCO"]);
    expect(got.atoms.map((a) => a.el)).toEqual(["C", "C", "O"]);
  });

  it("reads a MOL file, its atoms where the file has them", async () => {
    await writeClipboard([{ flavor: "mol", text: MOL }]);
    const got = (await structureOnClipboard())!;
    expect(got.atoms.map((a) => a.el)).toEqual(["C", "C", "O"]);
    expect(got.bonds).toHaveLength(2);
  });

  it("takes the MOL file where both are there - it keeps where its atoms are - and asks for no SMILES", async () => {
    asked.length = 0;
    await writeClipboard([
      { flavor: "smiles", text: "CCO" },
      { flavor: "mol", text: MOL },
    ]);
    const got = (await structureOnClipboard())!;
    expect(asked).toEqual([]);
    expect(got.bonds).toHaveLength(2);
  });

  it("takes a SMILES before plain text, and none where it is empty", async () => {
    asked.length = 0;
    await writeClipboard([
      { flavor: "text", text: "two words" },
      { flavor: "smiles", text: "CCO" },
    ]);
    expect((await structureOnClipboard())!.atoms).toHaveLength(3);
    await writeClipboard([{ flavor: "smiles", text: "  " }]);
    expect(await structureOnClipboard()).toBeNull();
  });

  it("refuses several SMILES on lines of their own, saying so - none of them chosen, none dropped unsaid", async () => {
    asked.length = 0;
    await writeClipboard([{ flavor: "smiles", text: "CCO\nCCN" }]);
    await expect(structureOnClipboard()).rejects.toThrow(SEVERAL_SMILES);
    expect(asked).toEqual([]);
    // (one line with a name after it, and blank lines round it: one SMILES, read as typed in)
    await writeClipboard([{ flavor: "smiles", text: "\nCCO ethanol\n\n" }]);
    await structureOnClipboard();
    expect(asked).toEqual(["CCO ethanol"]);
  });
});
