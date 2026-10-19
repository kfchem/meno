import { describe, expect, it } from "vitest";
import { captionPointer } from "./captionPointer";

const bare = { asked: undefined, own: "" };

describe("the pointer over a caption", () => {
  it("is its edge's wherever the edge is under it, over its words too", () => {
    expect(captionPointer({ words: true, edge: true }, { asked: undefined, own: "text" })).toEqual({ asked: "sideways", own: "" });
    // (the edge held a little wider than the words' room: past it, the edge's still)
    expect(captionPointer({ words: false, edge: true }, bare)).toEqual({ asked: "sideways", own: "" });
  });

  it("is the system's text pointer over its words alone, and none off it", () => {
    expect(captionPointer({ words: true, edge: false }, { asked: "sideways", own: "" })).toEqual({ asked: undefined, own: "text" });
    expect(captionPointer({ words: false, edge: false }, { asked: undefined, own: "text" })).toEqual(bare);
  });

  it("leaves the canvas's other pointers as they are: ink's crosshair, a handle's", () => {
    const ink = { asked: undefined, own: "crosshair" };
    // (over the edge and off it again, writing in ink: the crosshair still there)
    const onEdge = captionPointer({ words: false, edge: true }, ink);
    expect(onEdge).toEqual({ asked: "sideways", own: "crosshair" });
    expect(captionPointer({ words: false, edge: false }, onEdge)).toEqual(ink);
    // (a shape's handle asked for its pointer: the words going leave it)
    expect(captionPointer({ words: false, edge: false }, { asked: "corner-down", own: "" })).toEqual({ asked: "corner-down", own: "" });
  });
});
