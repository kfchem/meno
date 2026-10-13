import { describe, expect, it } from "vitest";
import { reducer, createInitialState } from "./state";
import type { State, TabInstance } from "./types";

const tab = (id: string, label = id): TabInstance => ({
  meta: { id, label },
  content: { kind: "settings" },
});

function withTabs(...ids: string[]): State {
  let s: State = { tabOrder: [], mountOrder: [], tabsById: {}, activeId: null };
  for (const id of ids) s = reducer(s, { type: "ADD_TAB", tab: tab(id) });
  return s;
}

describe("tab reducer", () => {
  it("starts with a single workspace", () => {
    const s = createInitialState();
    expect(s.tabOrder).toHaveLength(1);
    expect(s.tabsById[s.tabOrder[0]].content.kind).toBe("workspace");
    expect(s.activeId).toBe(s.tabOrder[0]);
  });

  it("puts a tab in another's place, which goes, and brings it to the front", () => {
    const s = reducer(withTabs("a", "b", "c"), { type: "SELECT_TAB", id: "a" });
    const r = reducer(s, { type: "REPLACE_TAB", id: "b", tab: tab("d") });
    expect(r.tabOrder).toEqual(["a", "d", "c"]);
    expect(r.mountOrder).toEqual(["a", "d", "c"]);
    expect(r.tabsById.b).toBeUndefined();
    expect(r.activeId).toBe("d");
    expect(reducer(s, { type: "REPLACE_TAB", id: "x", tab: tab("d") })).toBe(s);
  });

  it("activates newly added tabs", () => {
    const s = withTabs("a", "b");
    expect(s.tabOrder).toEqual(["a", "b"]);
    expect(s.activeId).toBe("b");
  });

  it("moves focus to the right neighbour, then the left, when closing the active tab", () => {
    let s = reducer(withTabs("a", "b", "c"), { type: "SELECT_TAB", id: "b" });
    s = reducer(s, { type: "CLOSE_TAB", id: "b" });
    expect(s.activeId).toBe("c");
    s = reducer(s, { type: "CLOSE_TAB", id: "c" });
    expect(s.activeId).toBe("a");
    s = reducer(s, { type: "CLOSE_TAB", id: "a" });
    expect(s.activeId).toBeNull();
    expect(s.tabOrder).toEqual([]);
  });

  it("reorders the tab bar without changing mount order", () => {
    const s = reducer(withTabs("a", "b", "c"), {
      type: "REORDER",
      order: ["c", "a", "b", "ghost"],
    });
    expect(s.tabOrder).toEqual(["c", "a", "b"]);
    expect(s.mountOrder).toEqual(["a", "b", "c"]);
  });

  it("patches data, renames and marks dirty", () => {
    let s = withTabs("a");
    s = reducer(s, { type: "PATCH_DATA", id: "a", patch: { text: "hi" } });
    s = reducer(s, { type: "RENAME_TAB", id: "a", label: "notes.txt" });
    s = reducer(s, { type: "SET_DIRTY", id: "a", dirty: true });
    expect(s.tabsById.a.content.data).toEqual({ text: "hi" });
    expect(s.tabsById.a.meta).toEqual({
      id: "a",
      label: "notes.txt",
      dirty: true,
    });
  });

  it("is the same state where a tab's dirty marker does not change - told at every frame of a drag", () => {
    let s = withTabs("a");
    expect(reducer(s, { type: "SET_DIRTY", id: "a", dirty: false })).toBe(s);
    s = reducer(s, { type: "SET_DIRTY", id: "a", dirty: true });
    expect(reducer(s, { type: "SET_DIRTY", id: "a", dirty: true })).toBe(s);
    expect(reducer(s, { type: "SET_DIRTY", id: "a", dirty: false }).tabsById.a.meta.dirty).toBe(false);
  });

  it("ignores actions for unknown tabs", () => {
    const s = withTabs("a");
    expect(reducer(s, { type: "CLOSE_TAB", id: "x" })).toBe(s);
    expect(reducer(s, { type: "RENAME_TAB", id: "x", label: "y" })).toBe(s);
    expect(reducer(s, { type: "PATCH_DATA", id: "x", patch: {} })).toBe(s);
  });
});
