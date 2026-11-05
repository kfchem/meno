import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { addConversation, updateConversation } from "./ops";
import { scriptedModel } from "./scripted";
import { LIMITS, runTurn, type ModelReply } from "./turn";
import { NO_SUCH } from "./tools";
import type { Said, ToolCall } from "./types";

/**
 * A page with a conversation's frame (-5, -5 to 60, 40) that may read and
 * propose: a set and a step inside it, and a set and a step outside.
 */
function page(read = true) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  doc.edit("conversation", (d) => addConversation(d, { x0: -5, y0: -5, x1: 60, y1: 40 }));
  doc.edit("rights", (d) => updateConversation(d, 1, { rights: { read, propose: true } }));
  const s = store.getState();
  const ids = { setIn: s.addSet({ x0: 0, y0: 20, x1: 10, y1: 30 }), setOut: s.addSet({ x0: 100, y0: 20, x1: 110, y1: 30 }), stepIn: s.addStep("energy-window", "meno", 30, 10), stepOut: s.addStep("energy-window", "meno", 200, 10) };
  const turn = async (replies: readonly ModelReply[] | ((r: never, n: number) => ModelReply), limits = LIMITS) => {
    await runTurn({ doc, calls: store.getState(), id: 1, words: "Go.", connection: scriptedModel(replies as never), turn: "t1", limits });
    return doc.getState().conversations![0].said;
  };
  return { doc, store, ids, turn };
}

const answers = (said: readonly Said[]) => said.flatMap((s) => (s.by === "tool" ? [s.answer] : []));
const once = (...calls: ToolCall[]): ModelReply[] => [{ text: "", calls }, { text: "." }];

describe("what a conversation may do, it may do only within its frame and its rights", () => {
  it("wires a set to a step only where both lie in its frame", async () => {
    const { ids, turn, doc } = page();
    const wires = () => JSON.stringify(doc.getState().wires ?? []);
    const before = wires();
    const said = await turn(once({ tool: "wire", args: { from: `set:${ids.setOut}`, to: `step:${ids.stepIn}` } }, { tool: "wire", args: { from: `set:${ids.setIn}`, to: `step:${ids.stepOut}` } }));
    expect(answers(said)).toEqual([NO_SUCH, NO_SUCH]);
    expect(wires()).toBe(before);
  });

  it("sets the options of a step only where it lies in its frame", async () => {
    const { ids, turn, doc } = page();
    const options = () => JSON.stringify(doc.getState().steps!.find((s) => s.id === ids.stepOut)!.options ?? {});
    const before = options();
    const said = await turn(once({ tool: "set_options", args: { step: `step:${ids.stepOut}`, options: { window: 7 } } }));
    expect(answers(said)).toEqual([NO_SUCH]);
    expect(options()).toBe(before);
  });

  it("adds a step only of a kind its doer does", async () => {
    const { turn, doc } = page();
    const steps = doc.getState().steps!.length;
    const said = await turn(once({ tool: "add_step", args: { kind: "energy-window", by: "no-such-doer" } }));
    expect(String(answers(said)[0])).toMatch(/does not do/);
    expect(doc.getState().steps!.length).toBe(steps);
  });

  it("reads nothing where it may not read", async () => {
    const { turn } = page(false);
    const said = await turn(once({ tool: "list" }, { tool: "read", args: { id: "set:1" } }));
    expect(answers(said)).toEqual(["This conversation may not read the page", "This conversation may not read the page"]);
  });

  it("takes at most its limit of replies for one message - not one more", async () => {
    const { turn } = page();
    const said = await turn(() => ({ text: "", calls: [{ tool: "list" }] }));
    expect(said.filter((s) => s.by === "model")).toHaveLength(LIMITS.replies);
    expect(said[said.length - 1]).toMatchObject({ by: "meno", text: `Stopped at the limit of ${LIMITS.replies} replies for one message.` });
  });
});
