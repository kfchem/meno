import { afterEach, describe, expect, it } from "vitest";
import { conversationTabs } from "./tabs";
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

  it("say their name and where what is inside them may go: sent to the hosts their model plugin names, kept on this computer, or nowhere", () => {
    expect(conversationTabs([conversation(1, { name: "Esters" })], { hovered: null, shown: null, talking: {} })[0].tab).toEqual({ icon: "chat", name: "Esters", status: "Sends nothing: no model plugin" });
    // (a model on this computer: the scripted one)
    setConnectionMaker(() => scriptedModel([]));
    expect(conversationTabs([conversation(1)], { hovered: null, shown: null, talking: {} })[0].tab).toMatchObject({ icon: "this-computer", name: "Conversation", status: "Stays on this computer" });
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
