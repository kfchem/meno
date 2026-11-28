import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bondChangeLabel } from "./slices/modelSlice";

const source = (file: string) => readFileSync(join(process.cwd(), "src/ui/features/Workspace/store/slices", file), "utf8");

/** The words each step is listed by in the title bar's history: what the chemist did. */
describe("a bond's change in the history", () => {
  it("says what the bond was made, so that clicks on bonds one after another read apart", () => {
    expect(bondChangeLabel({ order: 1, stereo: "none" }, { order: 2 })).toBe("make bond double");
    expect(bondChangeLabel({ order: 2 }, { order: 3, stereo: "none" })).toBe("make bond triple");
    expect(bondChangeLabel({ order: 3 }, { order: 1 })).toBe("make bond single");
    expect(bondChangeLabel({ order: 1 }, { stereo: "up" })).toBe("make bond wedged");
    expect(bondChangeLabel({ order: 1, stereo: "up" }, { stereo: "down" })).toBe("make bond hashed");
    expect(bondChangeLabel({ order: 1, stereo: "down" }, { stereo: "none" })).toBe("make bond plain");
  });

  it("is a change of the bond where it was made none of them", () => {
    expect(bondChangeLabel({ order: 2 }, {})).toBe("change bond");
    expect(bondChangeLabel({ order: 1, stereo: "up" }, { stereo: "up" })).toBe("change bond");
  });
});

describe("the other steps the history named in a way a chemist would not", () => {
  it("a run stopped is listed as stopped, not as run", () => {
    const runs = source("stepRuns.ts");
    const stopped = [...runs.matchAll(/doc\.edit\("([^"]+)"[^\n]*stopped: true/g)].map((m) => m[1]);
    expect(stopped.length).toBeGreaterThan(0);
    expect(new Set(stopped)).toEqual(new Set(["stop step"]));
  });

  it("a structure marked as checked against its figure, or not, in a few words", () => {
    expect(source("pdfsSlice.ts")).toContain('checked ? "mark as checked" : "mark as not checked"');
  });

  it("an atom's label typed is a change of the atom, to what was typed; frames laid out gathered into a stack again", () => {
    expect(source("uiSlice.ts")).toContain('`change atom to ${value}`');
    expect(source("uiSlice.ts")).not.toContain('"rename atom"');
    for (const file of ["molecules3dSlice.ts", "recordsSlice.ts"]) expect(source(file)).toContain('doc.edit("gather into a stack"');
  });
});
