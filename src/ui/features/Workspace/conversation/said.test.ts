import { describe, expect, it } from "vitest";
import { answerLine, callSaid, exchangeRows } from "./said";
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
