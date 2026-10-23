/**
 * A workflow's structures drawn, written to an SD file as a set selected
 * carries them (workflow/parts `partsOf`): each structure a record of its
 * own, its record after it as data items - its state, how it was made, its
 * number, every property under its own name with its unit, the values of
 * what it was made from - and read back as written.
 */
import { describe, expect, it } from "vitest";
import { readStructures } from "../../../lib/io/structures";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "./document";
import { exportedDrawn, heldNotWritten, structureFileText, withHeld } from "./fileActions";
import type { Drawn, DrawnModel, DrawnRecord } from "./store/types";
import { BEFORE_THE_EDIT, numberedRecord, recordHow, recordNumber, recordOn, recordWhy, setMembers } from "./workflow/entries";
import { resultOf } from "./workflow/flow";
import { addSet, addStep, connect } from "./workflow/model";
import { partsOf } from "./workflow/parts";
import { placeResults, runStep, type RunWith } from "./workflow/run";
import { template } from "./workflow/testdata/enumerationCases";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** A para-disubstituted benzene drawn, R1 and R2, in a set (1), Enumerated (2) on Me and Cl each: its products and those set aside, each in its set. */
function enumerated(): { doc: WorkspaceDocument; step: number } {
  let doc: WorkspaceDocument = { ...emptyWorkspaceDocument(), model: template("*c1ccc(*)cc1"), nextId: 5000 };
  doc = addSet(doc, { x0: -10, y0: -10, x1: 10, y1: 10 });
  doc = addStep(doc, "enumerate", 20, 0, { lists: "R1: Me\nCl\nR2: Me\nCl" });
  const step = doc.steps![0].id;
  return { doc: runStep(connect(doc, { set: 1 }, step), step, W), step };
}

/** What is written of `doc`'s sets `sets` selected, with the step that made them, as an SD file. */
const written = (doc: WorkspaceDocument, sets: number[], steps: number[]) =>
  structureFileText({ ...doc.model, arrows: [], pluses: [], flow: partsOf(doc, new Set(sets), new Set(steps)) } as unknown as Drawn, "/x/w.sdf");

/** Each record of an SD file's text: its title, and its data items in turn (CTfile Formats). */
function records(text: string): { title: string; items: [string, string][] }[] {
  return text
    .split(/^\$\$\$\$\n/m)
    .filter((r) => r.trim())
    .map((r) => {
      const lines = r.split("\n");
      const items: [string, string][] = [];
      for (let i = lines.findIndex((l) => l.startsWith("M  END")) + 1; i < lines.length; i++) {
        const name = /^>\s*<(.*)>$/.exec(lines[i]);
        if (!name) continue;
        const data: string[] = [];
        // (to the empty line that ends it)
        while (lines[i + 1] != null && lines[i + 1] !== "") data.push(lines[++i]);
        items.push([name[1], data.join("\n")]);
      }
      return { title: lines[0], items };
    });
}

describe("a workflow's structures drawn, written to an SD file", () => {
  it("writes each product of an Enumerate a record of its own, with its number, how it was made and its state - and is read back as written", () => {
    const { doc, step } = enumerated();
    const out = resultOf(doc, step, "out")!;
    const rest = resultOf(doc, step, "rest")!;
    const text = written(doc, [out.id, rest.id], [step]);
    const read = records(text);
    // (the products, then those set aside, each as its set holds it: its number in its title)
    const said = (r: DrawnRecord | undefined) => {
      const why = recordWhy(r);
      return {
        title: `w ${recordNumber(r)}`,
        items: [
          ["State", why ? "set aside" : "finished"],
          ...(why ? [["Set aside", why]] : []),
          ["number", String(recordNumber(r))],
          ["made.how", recordHow(r)],
        ],
      };
    };
    const members = [...setMembers(doc, out).records, ...setMembers(doc, rest).records];
    // (the template drawn - no record of its own - one record before them, as what is drawn was written before)
    expect(read.slice(1)).toEqual(members.map(said));
    expect(read[0].items).toEqual([]);
    expect(read.slice(1).map((r) => r.title)).toEqual(["w 1", "w 2", "w 4", "w 3"]);
    // (and each opens as a record of its own, a structure each: 1 + 4)
    expect(readStructures("sdf", "w.sdf", text).records).toHaveLength(5);
  });

  it("writes every property under its own name, its unit beside it, as worked out - what it was made from among them - and one not worked out with why, never a value", () => {
    const { doc, step } = enumerated();
    const out = resultOf(doc, step, "out")!;
    const [first, second] = setMembers(doc, out).structures;
    const by = { plugin: "a plugin", version: "1.0", program: "a program 2.1", method: "descriptors" };
    // (as Generate then Descriptors leave a structure: its seed's value, as that one's; its own values, one that could not be worked out)
    const given: DrawnRecord = {
      from: ["seed 3"],
      status: "done",
      properties: {
        "made_from.nll": { value: -12.345678901, unit: "none", by: { plugin: "a generator", version: "0.4" }, status: "computed" },
        mw: { value: 142.5861234567891, unit: "g/mol", by, status: "computed" },
        smiles: { value: "Cc1ccc(Cl)cc1", unit: "none", by, status: "computed" },
        aromatic: { value: true, unit: "none", by, status: "computed" },
        logp: { value: 0, unit: "none", by, status: { failed: "the model gave no value" } },
        tpsa: { value: 0, unit: "\u00c5^2" as never, by, status: { notApplicable: "it has no polar atoms" } },
      },
    };
    const withRecord = (d: WorkspaceDocument, ids: number[], r: DrawnRecord): WorkspaceDocument => ({
      ...d,
      sets: d.sets!.map((s) => (s.id !== out.id ? s : { ...s, members: s.members!.map((m) => ("structure" in m && [...m.structure].sort().join() === [...ids].sort().join() ? { structure: m.structure, record: r } : m)) })),
    });
    let page = withRecord(doc, first, recordOn(given, doc.model, first));
    // (the second edited since its values were worked out: what it says is of a structure it no longer is)
    page = withRecord(page, second, { ...given, of: "another" });
    const read = records(written(page, [out.id], [step]));
    expect(read[1]).toEqual({
      title: "w 1",
      items: [
        ["State", "finished"],
        ["From", "seed 3"],
        ["made_from.nll", "-12.345678901"],
        ["mw (g/mol)", "142.5861234567891"],
        ["smiles", "Cc1ccc(Cl)cc1"],
        ["aromatic", "true"],
        // (not worked out: its bare name - no unit of a value it has not)
        ["logp", "not worked out: the model gave no value"],
        ["tpsa", "not applicable: it has no polar atoms"],
      ],
    });
    // (none of its values, nor its state, written for the one edited since: said so)
    expect(read[2]).toEqual({ title: "w 2", items: [["Stale", BEFORE_THE_EDIT], ["From", "seed 3"]] });
  });

  /** `doc`'s out set with its first structure's record `r`, on the structure as it is. */
  const firstWith = (r: DrawnRecord) => {
    const { doc, step } = enumerated();
    const out = resultOf(doc, step, "out")!;
    const [first] = setMembers(doc, out).structures;
    const page = {
      ...doc,
      sets: doc.sets!.map((s) => (s.id !== out.id ? s : { ...s, members: s.members!.map((m) => ("structure" in m && [...m.structure].sort().join() === [...first].sort().join() ? { structure: m.structure, record: recordOn(r, doc.model, first) } : m)) })),
    };
    return records(written(page, [out.id], [step]))[1];
  };

  it("keeps what was worked out of a structure a later step set aside - true of it still - beside its state, and none of the values that step did not give", () => {
    // (Generate, then Descriptors set it aside: a structure-step plugin answers for a structure whole - set aside, it is given none of
    //  that step's values - and what it had before stays, of it as it is)
    const by = { plugin: "a generator", version: "0.4" };
    const r: DrawnRecord = {
      from: ["seed 3"],
      status: { aside: "the descriptors could not be worked out: the model ran out of memory" },
      properties: { "made_from.nll": { value: -12.5, unit: "none", by, status: "computed" }, mw: { value: 142.5861234567891, unit: "g/mol", by, status: "computed" } },
    };
    expect(firstWith(r).items).toEqual([
      ["State", "set aside"],
      ["Set aside", "the descriptors could not be worked out: the model ran out of memory"],
      ["From", "seed 3"],
      ["made_from.nll", "-12.5"],
      ["mw (g/mol)", "142.5861234567891"],
    ]);
    // (and one the step marked failed itself, beside a value from before it: that one not worked out, the earlier as it is)
    const failed: DrawnRecord = {
      status: { failed: "the descriptor step failed" },
      properties: { "made_from.nll": { value: -12.5, unit: "none", by, status: "computed" }, logp: { value: 0, unit: "none", by, status: { failed: "the descriptor step failed" } } },
    };
    expect(firstWith(failed).items).toEqual([
      ["State", "failed"],
      ["Failed", "the descriptor step failed"],
      ["made_from.nll", "-12.5"],
      ["logp", "not worked out: the descriptor step failed"],
    ]);
  });

  it("writes a text value so that no line of it ends the item or begins another: a data header, a record's end, a blank line", () => {
    const by = { plugin: "a plugin", version: "1" };
    const text = "first\n> <fake>\n99\n\n$$$$\nlast";
    const item = firstWith({ status: "done", properties: { note: { value: text, unit: "none", by, status: "computed" } } });
    // (one item, as it was given - read back whole, no fake one beside it)
    expect(item.items).toEqual([
      ["State", "finished"],
      ["note", "first\n > <fake>\n99\n \n $$$$\nlast"],
    ]);
  });

  /** A step's 120 products, each its number: more than the page shows - the rest held in the set. */
  function hundredTwenty(): { doc: WorkspaceDocument; step: number; out: number } {
    const product = (k: number): DrawnModel => ({
      atoms: [
        { id: 1, el: "C", x: 0, y: 0 },
        { id: 2, el: "C", x: 1.56, y: 0.9 },
        { id: 3, el: k % 2 ? "Cl" : "Br", x: 3.12, y: 0 },
      ] as never,
      bonds: [
        { id: 4, a: 1, b: 2, order: 1 },
        { id: 5, a: 2, b: 3, order: 1 },
      ] as never,
      record: numberedRecord(k + 1, `product ${k + 1}`),
    });
    let doc = addStep(emptyWorkspaceDocument(), "descriptors", 0, 0);
    const step = doc.steps![0];
    doc = placeResults(doc, step, { molecules: [], rest: [], holds: "structures", drawn: { made: Array.from({ length: 120 }, (_, k) => product(k)), rest: [] } }, W);
    return { doc, step: step.id, out: resultOf(doc, step.id, "out")!.id };
  }
  /** The canvas `doc` as the store holds it, for what Export writes of it. */
  const canvas = (doc: WorkspaceDocument) => ({ ...doc, arrows: [], pluses: [], captions: [], sets: doc.sets ?? [], steps: doc.steps ?? [], wires: doc.wires ?? [], molecules3d: [], turns3d: {}, frames3d: {} }) as never;
  /** The 120 numbers, in order, as titles. */
  const all = Array.from({ length: 120 }, (_, k) => `w ${k + 1}`);

  it("writes every structure a set holds, those it shows and those it holds off the page alike, a record each in its order", () => {
    const { doc, step: stepId, out: outId } = hundredTwenty();
    const step = { id: stepId };
    const out = doc.sets!.find((b) => b.id === outId)!;
    const shown = setMembers(doc, out).structures.length;
    expect([shown > 0, shown < 120, shown + (out.drawnCollection?.length ?? 0)]).toEqual([true, true, 120]);
    const part = { ...doc.model, arrows: [], pluses: [], flow: partsOf(doc, new Set([out.id]), new Set([step.id])) } as unknown as Drawn;
    const read = records(structureFileText(withHeld(part, { sets: doc.sets! }), "/x/w.sdf"));
    // (none of what is drawn besides: the 120, in the set's order, each its number and how)
    expect(read.map((r) => r.title)).toEqual(all);
    expect(read[119].items).toEqual([
      ["State", "finished"],
      ["number", "120"],
      ["made.how", "product 120"],
    ]);
    // (each held one its own structure: its halogen as it was made)
    const text = structureFileText(withHeld(part, { sets: doc.sets! }), "/x/w.sdf");
    expect(readStructures("sdf", "w.sdf", text).records).toHaveLength(120);
    expect(text.split("$$$$\n").filter((r) => r.trim()).map((r) => (/ Br /.test(r) ? "Br" : "Cl"))).toEqual(Array.from({ length: 120 }, (_, k) => (k % 2 ? "Cl" : "Br")));
    // (without what it holds - the page's alone - not all of them: what Export is given, from what is selected, holds them all)
    expect(records(structureFileText(part, "/x/w.sdf"))).toHaveLength(shown);
  });

  it("writes, nothing selected, every structure each set on the canvas holds - a record each, as a set selected is written", () => {
    const { doc } = hundredTwenty();
    const read = records(structureFileText(exportedDrawn(canvas(doc)), "/x/w.sdf"));
    expect(read.map((r) => r.title)).toEqual(all);
    expect(read[60].items).toEqual([
      ["State", "finished"],
      ["number", "61"],
      ["made.how", "product 61"],
    ]);
  });

  it("says, of a MOL or RXN file - one molfile, which holds no records - the structures a set holds off the page as not written", () => {
    const { doc, step, out } = hundredTwenty();
    const held = doc.sets!.find((b) => b.id === out)!.drawnCollection!.length;
    const selected = exportedDrawn(canvas(doc), { ...doc.model, arrows: [], pluses: [], flow: partsOf(doc, new Set([out]), new Set([step])) } as unknown as Drawn);
    expect(heldNotWritten(selected)).toBe(`${held} structures this set holds off the page were not written; export the set as SD to write them all.`);
    expect(heldNotWritten(exportedDrawn(canvas(doc)))).toBe(`${held} structures this set holds off the page were not written; export the set as SD to write them all.`);
    // (a set that holds none off the page: nothing to say)
    const { doc: small } = enumerated();
    expect(heldNotWritten(exportedDrawn(canvas(small)))).toBeNull();
  });

  it("writes what is drawn as one record, as before, where no set is selected with it", () => {
    const { doc } = enumerated();
    expect(records(written(doc, [], []))).toHaveLength(1);
  });
});
