import { describe, expect, it } from "vitest";
import { captionPointer } from "./captionPointer";

describe("the pointer over a caption", () => {
  it("is its edge's wherever the edge is under it, over its words too", () => {
    expect(captionPointer({ words: true, edge: true })).toEqual({ asked: "sideways", own: "" });
    // (the edge held a little wider than the words' room: past it, the edge's still)
    expect(captionPointer({ words: false, edge: true })).toEqual({ asked: "sideways", own: "" });
  });

  it("is the system's text pointer over its words alone, and none off it", () => {
    expect(captionPointer({ words: true, edge: false })).toEqual({ asked: null, own: "text" });
    expect(captionPointer({ words: false, edge: false })).toEqual({ asked: null, own: "" });
  });
});
