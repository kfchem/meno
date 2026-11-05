import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { processFileContent } from "../utils/io";
import { cleanUp } from "./cleanUp";
import { drawingOf } from "./drawing";
import { identityInputOf, identityOfDrawn } from "./identityOf";

/** But-2-ene in a V2000 MOL file: its methyls on one side of the double bond (`cis`) or across it, the double bond's stereo `code`. */
function v2000(cis: boolean, code: number): string {
  const c4 = cis ? "    2.2500    1.3000" : "    2.2500   -1.3000";
  return [
    "",
    "  Meno",
    "",
    "  4  3  0  0  0  0  0  0  0  0999 V2000",
    "   -0.7500    1.3000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
    "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
    "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
    `${c4}    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0`,
    "  1  2  1  0",
    `  2  3  2  ${code}`,
    "  3  4  1  0",
    "M  END",
  ].join("\n");
}

/** The same in a V3000 MOL file, the double bond's CFG `cfg`. */
function v3000(cis: boolean, cfg: number): string {
  return [
    "",
    "  Meno",
    "",
    "  0  0  0     0  0            999 V3000",
    "M  V30 BEGIN CTAB",
    "M  V30 COUNTS 4 3 0 0 0",
    "M  V30 BEGIN ATOM",
    "M  V30 1 C -0.75 1.3 0 0",
    "M  V30 2 C 0 0 0 0",
    "M  V30 3 C 1.5 0 0 0",
    `M  V30 4 C 2.25 ${cis ? 1.3 : -1.3} 0 0`,
    "M  V30 END ATOM",
    "M  V30 BEGIN BOND",
    "M  V30 1 1 1 2",
    `M  V30 2 2 2 3${cfg ? ` CFG=${cfg}` : ""}`,
    "M  V30 3 1 3 4",
    "M  V30 END BOND",
    "M  V30 END CTAB",
    "M  END",
  ].join("\n");
}

/** A reaction of one molecule, `mol`, into itself, in a V2000 RXN file. */
const rxn = (mol: string) => ["$RXN", "", "  Meno", "", "  1  1", "$MOL", mol, "$MOL", mol].join("\n");

const read = async (name: string, text: string) => (await processFileContent(name, text)).model as Model;
const doubleBond = (m: Model) => m.bonds.find((b) => b.order === 2)!;

describe("a double bond a file says is either: cis or trans not known (a MOL file's crossed one)", () => {
  it("is read as either, and no cis or trans is read off where its ends happen to lie", async () => {
    for (const cis of [false, true]) {
      const m = await read("butene.mol", v2000(cis, 3));
      expect(doubleBond(m).stereo).toBe("either");
      const d = drawingOf(m);
      expect(d.bonds.find((b) => b.order === 2)?.either).toBe(true);
      expect(identityInputOf(m).input.bonds.find((b) => b.order === 2)?.stereo).toBeUndefined();
    }
  });

  it("is a double bond's only: a single bond said either is drawn as it is, while a wavy one stays either at its ends", async () => {
    const m = await read("e.mol", v2000(false, 0));
    const single = m.bonds.find((b) => b.order === 1)!;
    const drawnAs = (stereo: "wavy" | "either") => drawingOf({ ...m, bonds: m.bonds.map((b) => (b === single ? { ...b, stereo } : b)) }).bonds.find((b) => b.order === 1 && b.either);
    expect(drawnAs("wavy")).toBeDefined();
    expect(drawnAs("either")).toBeUndefined();
  });

  it("is a structure of its own: E, Z and either are three, and either drawn either way is one", async () => {
    const e = identityOfDrawn(await read("e.mol", v2000(false, 0))).text;
    const z = identityOfDrawn(await read("z.mol", v2000(true, 0))).text;
    const either = identityOfDrawn(await read("x.mol", v2000(false, 3))).text;
    expect(new Set([e, z, either]).size).toBe(3);
    expect(identityOfDrawn(await read("y.mol", v2000(true, 3))).text).toBe(either);
  });

  it("is the same read from a V3000 file (CFG=2) and from a reaction's", async () => {
    const either = identityOfDrawn(await read("x.mol", v2000(false, 3))).text;
    const v3 = await read("x3.mol", v3000(false, 2));
    expect(doubleBond(v3).stereo).toBe("either");
    expect(identityOfDrawn(v3).text).toBe(either);
    expect(identityOfDrawn(await read("e3.mol", v3000(false, 0))).text).not.toBe(either);
    const r = await read("r.rxn", rxn(v2000(false, 3)));
    const doubles = r.bonds.filter((b) => b.order === 2);
    expect(doubles.length).toBeGreaterThan(0);
    expect(doubles.every((b) => b.stereo === "either")).toBe(true);
    expect(identityInputOf(r).input.bonds.filter((b) => b.order === 2).every((b) => !b.stereo)).toBe(true);
  });

  it("is left either by Clean-up, and the structure it is with it", async () => {
    const m = await read("x.mol", v2000(true, 3));
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model: m, nextId: 2000 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const before = identityOfDrawn(store.getState().model).text;
    await cleanUp(store);
    const after = store.getState().model;
    expect(doubleBond(after).stereo).toBe("either");
    expect(identityOfDrawn(after).text).toBe(before);
  });
});
