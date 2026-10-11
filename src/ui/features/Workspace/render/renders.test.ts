import { describe, expect, it } from "vitest";
import { progressOf } from "./renders";
import { askOf, renderOptions } from "./renderOptions";
import { valuesOf } from "../../../../lib/options";

describe("a render", () => {
  it("is as far as its job last said, in lines of its log", () => {
    expect(progressOf("Blender 5.2\nprogress 0/240\nFra:1\nprogress 12/240\nFra:13 Mem: 30M\n")).toEqual({ done: 12, total: 240 });
    expect(progressOf("progress 1/1\n")).toEqual({ done: 1, total: 1 });
    // (nothing said, or what is not how far)
    expect(progressOf("Rendering\n")).toBeNull();
    expect(progressOf("progress 5/0\nprogress 9/4\n")).toBeNull();
  });

  it("is asked for by Meno's own choices: a picture's size and shape, a film's motion, length and rate - offered only where they can be", () => {
    const picture = renderOptions("picture", ["turn"], false);
    expect(picture.map((o) => o.id)).toEqual(["width", "shape", "molecules"]);
    const film = renderOptions("film", ["turn", "frames"], true);
    expect(film.map((o) => o.id)).toEqual(["motion", "seconds", "fps", "width", "shape", "molecules", "surfaces"]);
    const ask = askOf("film", valuesOf(film));
    expect(ask).toEqual({ kind: "film", width: 1920, shape: "16:9", motion: "turn", seconds: 8, fps: 30, molecules: "meno", surfaces: "meno" });
    expect(askOf("picture", valuesOf(picture))).toEqual({ kind: "picture", width: 2400, shape: "fit", molecules: "meno", surfaces: "meno" });
  });
});
