import { afterEach, describe, expect, it } from "vitest";
import { COLUMN_TAB, conversationTabs } from "./tabs";
import type { Connection } from "./turn";
import { setConnectionMaker } from "./connections";
import { scriptedModel } from "./scripted";
import { NEW_RIGHTS, type Conversation } from "./types";

const conversation = (id: number, over: Partial<Conversation> = {}): Conversation => ({ id, x0: 0, y0: 0, x1: 20, y1: 10, rights: NEW_RIGHTS, said: [], sent: [], ...over });

afterEach(() => setConnectionMaker(() => null));

describe("conversations' frames on the page", () => {
  it("are sized by their edges as sets are, their line by whether they are pointed at or read in the column - but outward, a line of their own", () => {
    const tabs = conversationTabs([conversation(1), conversation(2), conversation(3)], { hovered: 2, shown: 3, talking: {} });
    expect(tabs.map((t) => [t.key, t.tone, t.edges, t.tabOnly])).toEqual([
      ["conversation:1", "rest", true, undefined],
      ["conversation:2", "hover", true, undefined],
      ["conversation:3", "chosen", true, undefined],
    ]);
    expect(tabs[0].box).toEqual({ x0: 0, y0: 0, x1: 20, y1: 10 });
    // (what lies inside may be sent away: never a set's hairline - the maintainer, 2026-11-07)
    expect(tabs.every((t) => t.outward)).toBe(true);
    // (read in the column and pointed at, both: as read - pointing at it changes nothing)
    expect(conversationTabs([conversation(1)], { hovered: 1, shown: 1, talking: {} })[0].tone).toBe("chosen");
  });

  it("are drawn as they are given - on their way to the document's frame, a frame grown to hold its card eased out to it - and as the document has them where none is given", () => {
    const eased = new Map([[2, { x0: 4, y0: 5, x1: 6, y1: 7 }]]);
    const tabs = conversationTabs([conversation(1), conversation(2)], { hovered: null, shown: null, talking: {}, frames: eased });
    expect(tabs[0].box).toEqual({ x0: 0, y0: 0, x1: 20, y1: 10 });
    expect(tabs[1].box).toEqual({ x0: 4, y0: 5, x1: 6, y1: 7 });
  });

  it("say where what is inside them may go, and no name: sent to the hosts their model plugin names, kept on this computer, or nowhere", () => {
    // (a conversation has no name; one an old file gave was dropped as it was read)
    expect(conversationTabs([conversation(1)], { hovered: null, shown: null, talking: {} })[0].tab).toEqual({ icon: "chat", status: "Sends nothing: no model plugin" });
    // (a model on this computer: the scripted one)
    setConnectionMaker(() => scriptedModel([]));
    expect(conversationTabs([conversation(1)], { hovered: null, shown: null, talking: {} })[0].tab).toEqual({ icon: "this-computer", status: "Stays on this computer" });
    expect(conversationTabs([conversation(1)], { hovered: null, shown: null, talking: { 1: { running: true } } })[0].tab.status).toBe("Talking… · stays on this computer");
    // (a model's service elsewhere: the hosts it names, made up here)
    const away: Connection = { id: "made-up-model", to: "api.example.com, files.example.com", send: () => Promise.reject(new Error("not sent")) };
    setConnectionMaker(() => away);
    expect(conversationTabs([conversation(1)], { hovered: null, shown: null, talking: {} })[0].tab).toMatchObject({ icon: "sent-away", status: "May be sent to api.example.com, files.example.com" });
    expect(conversationTabs([conversation(1)], { hovered: null, shown: null, talking: { 1: { running: true } } })[0].tab.status).toBe("Talking… · sending to api.example.com, files.example.com");
  });

  it("of the whole page, are their tab alone, in Meno's warning colour, never sized", () => {
    const [tab] = conversationTabs([conversation(1, { wholePage: true })], { hovered: null, shown: null, talking: {} });
    expect([tab.tabOnly, tab.edges, tab.tab.warn]).toEqual([true, undefined, "Sees the whole page"]);
  });
});

describe("a conversation has no name", () => {
  it("is shown in the column by its icon alone: its tab says nothing of a name, and what it is only to the pointer", () => {
    expect(COLUMN_TAB).toEqual({ name: "", title: "Conversation" });
  });

  it("is drawn on the page with its tab's icon and where its frame's contents may go - no word before them - the tab the width of what it says", async () => {
    const { frameTabParts, tabWidthPx, FRAME_PX } = await import("../pageGl/frameParts");
    const tab = conversationTabs([conversation(1)], { hovered: null, shown: null, talking: {} })[0];
    const parts = frameTabParts([tab], true);
    expect(parts.texts.map((t) => [t.key, t.text])).toEqual([["conversation:1:status", "Sends nothing: no model plugin"]]);
    expect(parts.icons.map((i) => i.icon)).toEqual(["chat"]);
    // (an icon, a gap, its status: no name's gap between)
    const { textWidth } = await import("../pageGl/texts");
    expect(tabWidthPx(tab.tab, true)).toBeCloseTo(FRAME_PX.icon + FRAME_PX.gap + textWidth("Sends nothing: no model plugin", FRAME_PX.words), 9);
  });
});
