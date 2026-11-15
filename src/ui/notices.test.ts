import { afterEach, describe, expect, it } from "vitest";
import { useNotices } from "./notices";

afterEach(() => useNotices.setState({ notices: [] }));

describe("notices in the corner", () => {
  it("say one of the same id again in its place, among the others - a new one after them", () => {
    const { show } = useNotices.getState();
    show({ id: "a", title: "A", text: "First.", stays: true });
    show({ id: "b", title: "B", text: "Second.", stays: true });
    show({ id: "a", title: "A", text: "First, again.", stays: true });
    expect(useNotices.getState().notices.map((n) => [n.id, n.text])).toEqual([
      ["a", "First, again."],
      ["b", "Second."],
    ]);
    show({ id: "c", title: "C", text: "Third.", stays: true });
    expect(useNotices.getState().notices.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});
