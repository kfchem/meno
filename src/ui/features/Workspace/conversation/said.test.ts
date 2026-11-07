import { describe, expect, it } from "vitest";
import { answerLine, callJson, callSaid, exchangeRows, foundRows } from "./said";
import { NO_ROOM } from "./change";

describe("what a tool call did, as the exchange says it", () => {
  it("says what it is on the page - never a tool's name, its arguments or an id", () => {
    expect(callSaid({ tool: "list" })).toBe("Listed what lies in the frame");
    expect(callSaid({ tool: "read", args: { id: "structure:27" } })).toBe("Read a structure in the frame");
    expect(callSaid({ tool: "search", args: { smiles: "c1ccccc1", how: "holds" } })).toBe("Looked for structures holding c1ccccc1");
    expect(callSaid({ tool: "put_structure", args: { smiles: "CCOC(C)=O" } })).toBe("Put down CCOC(C)=O");
    expect(callSaid({ tool: "put_arrow" })).toBe("Put down an arrow");
    expect(callSaid({ tool: "run" })).toBe("Asked for something Meno does not do");
    for (const t of ["list", "read", "search", "put_structure", "put_arrow", "put_plus", "put_text", "add_step", "wire", "set_options"]) expect(callSaid({ tool: t, args: { id: "step:3" } })).not.toMatch(/_|:\d/);
  });
});

describe("the exchange's rows", () => {
  it("pairs each call with its own answer, in their order - the model's words before them", () => {
    const rows = exchangeRows([
      { by: "person", text: "Draw it", at: 1 },
      { by: "model", text: "", calls: [{ tool: "put_arrow" }, { tool: "put_structure", args: { smiles: "CCO" } }], at: 2 },
      { by: "tool", tool: "put_arrow", ok: true, answer: { id: "arrow:1" }, at: 3 },
      { by: "tool", tool: "put_structure", ok: false, answer: "Meno does not read it", at: 4 },
      { by: "model", text: "There.", at: 5 },
    ]);
    expect(rows.map((r) => (r.kind === "call" ? `${callSaid(r.call)} · ${r.answer ? answerLine(r.answer) : "-"}` : r.said.by))).toEqual(["person", "Put down an arrow · Done", "Put down CCO · Meno does not read it", "model"]);
  });

  it("says why a piece was not put down where the frame has no room - as any refusal, its reason", () => {
    expect(answerLine({ by: "tool", tool: "put_structure", ok: false, answer: NO_ROOM, at: 1 })).toBe(NO_ROOM);
  });

});

describe("what a call found, unfolded", () => {
  const tool = (t: string, answer: unknown, ok = true) => ({ by: "tool" as const, tool: t, ok, answer, at: 1 });

  it("says it in Meno's words, a row each - what each thing is, what was read, what was found - never the call as JSON or an id", () => {
    expect(foundRows(tool("list", { things: [{ id: "structure:1", kind: "structure", line: "a structure drawn: CCO" }, { id: "plus:2", kind: "plus", line: 'a "+"' }], more: 3 }))).toEqual(["a structure drawn: CCO", 'a "+"', "and 3 more"]);
    expect(foundRows(tool("read", { atoms: [{}, {}, {}], bonds: [{}, {}], smiles: "CCO", stereo: "drawn, not written in the SMILES" }))).toEqual(["3 atoms", "2 bonds", "SMILES CCO", "Stereo: drawn, not written in the SMILES"]);
    expect(foundRows(tool("read", { formula: "C2H6O", name: "ethanol", atoms: [{}], frames: 1, energies: { values: [-1, -2], unit: "hartree" } }))).toEqual(["Formula: C2H6O", "Name: ethanol", "one atom", "2 energies, in hartree"]);
    expect(foundRows(tool("read", { name: "Esters", inScope: { structures: 2, molecules: 0, pictures: 1 } }))).toEqual(["Name: Esters", "In the frame: 2 structures, 0 molecules, one picture"]);
    expect(foundRows(tool("search", { found: ["structure:1", "structure:4"], couldNotTell: ["structure:9"], notLookedAt: 2 }))).toEqual(["A structure, 1", "A structure, 4", "Could not tell for one structure", "2 things not looked at"]);
    // (a piece put down: nothing more than its line)
    expect(foundRows(tool("put_arrow", { id: "arrow:1" }))).toEqual([]);
    // (refused: its why is its line, nothing below it)
    expect(foundRows(tool("put_structure", "There is no room", false))).toEqual([]);
    for (const rows of [foundRows(tool("list", { things: [{ id: "structure:1", line: "a structure drawn: CCO" }] })), foundRows(tool("read", { atoms: [], smiles: "C" }))]) expect(rows.join(" ")).not.toMatch(/[{}[\]"]|structure:\d/);
  });

  it("copies the call and what came of it as JSON, on asking", () => {
    expect(JSON.parse(callJson({ tool: "read", args: { id: "structure:1" } }, tool("read", { smiles: "CCO" })))).toEqual({ call: { tool: "read", args: { id: "structure:1" } }, answer: { ok: true, answer: { smiles: "CCO" } } });
    expect(JSON.parse(callJson({ tool: "list" }))).toEqual({ call: { tool: "list" } });
  });
});
