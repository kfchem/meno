import { afterEach, describe, expect, it } from "vitest";
import { conversationTabs } from "./tabs";
import { setConnectionMaker } from "./connections";
import { scriptedModel } from "./scripted";
import { NEW_RIGHTS, type Conversation } from "./types";

const conversation = (id: number, over: Partial<Conversation> = {}): Conversation => ({ id, x0: 0, y0: 0, x1: 20, y1: 10, rights: NEW_RIGHTS, said: [], sent: [], ...over });

afterEach(() => setConnectionMaker(() => null));

describe("conversations' frames on the page", () => {
  it("are drawn as sets' are: sized by their edges, their line by whether they are pointed at or read in the column", () => {
    const tabs = conversationTabs([conversation(1), conversation(2), conversation(3)], { hovered: 2, shown: 3, talking: {} });
    expect(tabs.map((t) => [t.key, t.tone, t.edges, t.tabOnly])).toEqual([
      ["conversation:1", "rest", true, undefined],
      ["conversation:2", "hover", true, undefined],
      ["conversation:3", "chosen", true, undefined],
    ]);
    expect(tabs[0].box).toEqual({ x0: 0, y0: 0, x1: 20, y1: 10 });
  });

  it("say their name, and that they send nothing, what they talk through, or that they talk", () => {
    expect(conversationTabs([conversation(1, { name: "Esters" })], { hovered: null, shown: null, talking: {} })[0].tab).toEqual({ icon: "chat", name: "Esters", status: "Sends nothing: no model plugin" });
    setConnectionMaker(() => scriptedModel([]));
    expect(conversationTabs([conversation(1)], { hovered: null, shown: null, talking: {} })[0].tab).toMatchObject({ name: "Conversation", status: expect.stringMatching(/^through /) });
    expect(conversationTabs([conversation(1)], { hovered: null, shown: null, talking: { 1: { running: true } } })[0].tab.status).toBe("Talking…");
  });

  it("of the whole page, are their tab alone, in Meno's warning colour, never sized", () => {
    const [tab] = conversationTabs([conversation(1, { wholePage: true })], { hovered: null, shown: null, talking: {} });
    expect([tab.tabOnly, tab.edges, tab.tab.warn]).toEqual([true, undefined, "Sees the whole page"]);
  });
});
