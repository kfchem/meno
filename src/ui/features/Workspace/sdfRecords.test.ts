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
import { structureFileText } from "./fileActions";
import type { Drawn, DrawnRecord } from "./store/types";
import { BEFORE_THE_EDIT, recordHow, recordNumber, recordOn, recordWhy, setMembers } from "./workflow/entries";
import { resultOf } from "./workflow/flow";
import { addSet, addStep, connect } from "./workflow/model";
import { partsOf } from "./workflow/parts";
import { runStep, type RunWith } from "./workflow/run";
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
        while (lines[i + 1]?.trim()) data.push(lines[++i]);
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
        ["logp", "not worked out: the model gave no value"],
      ],
    });
    // (none of its values, nor its state, written for the one edited since: said so)
    expect(read[2]).toEqual({ title: "w 2", items: [["Stale", BEFORE_THE_EDIT], ["From", "seed 3"]] });
  });

  it("writes what is drawn as one record, as before, where no set is selected with it", () => {
    const { doc } = enumerated();
    expect(records(written(doc, [], []))).toHaveLength(1);
  });
});
