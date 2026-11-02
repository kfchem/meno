import { describe, expect, it } from "vitest";
import { NotRead, whoReads } from "./read";
import type { PythonPlugin, ReaderPlugin } from "./catalog";

// (two made-up plugins that read one made-up kind, as no two plugins Meno carries read one undecided)
const reader = (id: string, name: string): ReaderPlugin => ({ id, name, reads: ["made-up"], profile: `plugin-${id}` }) as unknown as PythonPlugin;
const readers = [reader("one", "One"), reader("two", "Two")];
const kind = { id: "made-up", name: "Made-up output", extensions: [] };
const none = { read: {}, also: {} };

describe("a file two added plugins read, with nothing saying which", () => {
  it("is read by neither, and says to choose which in Settings - never the first by its name", () => {
    const said = whoReads(kind, "a.out", new Set(["one", "two"]), none, readers);
    expect(said).toBeInstanceOf(NotRead);
    expect((said as NotRead).message).toBe("a.out (Made-up output): One and Two each read it - choose which in Settings, Files.");
  });

  it("is read by the one chosen, or by the one added", () => {
    expect((whoReads(kind, "a.out", new Set(["one", "two"]), { read: { "made-up": "two" }, also: {} }, readers) as { reader: ReaderPlugin }).reader.id).toBe("two");
    expect((whoReads(kind, "a.out", new Set(["one"]), none, readers) as { reader: ReaderPlugin }).reader.id).toBe("one");
  });
});
