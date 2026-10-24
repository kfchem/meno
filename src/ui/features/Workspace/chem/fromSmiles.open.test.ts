import { describe, expect, it, vi } from "vitest";
import { measured } from "../../../../testing/timeouts";

// (the plugin's answers, by what is asked: its drawing of ethanol, and what it says the SMILES leaves open - or that
//  it cannot be asked)
const ETHANOL = "\n  Meno\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\n    1.2990    0.7500    0.0000 C   0  0\n    2.5981    0.0000    0.0000 O   0  0\n  1  2  1  0\n  2  3  1  0\nM  END\n";
let open: { atoms: number[]; bonds: number[]; cumulated?: number[][] } | "fails" | "hangs" = { atoms: [], bonds: [] };
vi.mock("../../../../lib/roles/worker", () => ({
  chemWorker: async () => ({
    request: async (op: string) => {
      if (op === "from_smiles") return { molblock: ETHANOL };
      if (open === "fails") throw new Error("no such request: stereo_left_open");
      if (open === "hangs") return new Promise(() => {});
      return open;
    },
  }),
}));
vi.mock("./cleanUp", () => ({ laidOut: async (m: unknown) => m }));

describe("a structure read from a SMILES, and the stereo it leaves open", () => {
  it("says how many stereocentres and double bonds its SMILES leaves without a configuration - none where none is", async () => {
    const { structureFromSmiles, stereoOpenSaid } = await import("./fromSmiles");
    open = { atoms: [23], bonds: [] };
    expect(stereoOpenSaid((await structureFromSmiles("C")).stereoOpen)).toBe("1 stereocentre not specified");
    open = { atoms: [1, 4], bonds: [7] };
    expect(stereoOpenSaid((await structureFromSmiles("C")).stereoOpen)).toBe("2 stereocentres and 1 double bond not specified");
    open = { atoms: [], bonds: [1, 5] };
    expect(stereoOpenSaid((await structureFromSmiles("C")).stereoOpen)).toBe("2 double bonds not specified");
    open = { atoms: [], bonds: [] };
    const plain = await structureFromSmiles("CCO");
    expect("stereoOpen" in plain).toBe(false);
    expect(stereoOpenSaid(plain.stereoOpen)).toBeNull();
  }, measured(390));

  it("says nothing where the plugin cannot be asked, and the structure comes all the same", async () => {
    const { structureFromSmiles, stereoOpenSaid } = await import("./fromSmiles");
    open = "fails";
    const drawn = await structureFromSmiles("CCO");
    expect(drawn.atoms.map((a) => a.el)).toEqual(["C", "C", "O"]);
    expect(stereoOpenSaid(drawn.stereoOpen)).toBeNull();
  });

  it("counts a run of cumulated double bonds once: an allene's axis, a butatriene's cis or trans", async () => {
    const { stereoOpenOf, stereoOpenSaid } = await import("./fromSmiles");
    expect(stereoOpenSaid(stereoOpenOf({ atoms: [], bonds: [1, 2], cumulated: [[1, 2]] }))).toBe("1 axis not specified");
    expect(stereoOpenSaid(stereoOpenOf({ atoms: [], bonds: [1, 2, 3], cumulated: [[1, 2, 3]] }))).toBe("1 double bond not specified");
    expect(stereoOpenSaid(stereoOpenOf({ atoms: [4], bonds: [1, 2, 6], cumulated: [[1, 2]] }))).toBe("1 stereocentre, 1 double bond and 1 axis not specified");
    // (a worker that says no runs - an older one: every bond as one)
    expect(stereoOpenSaid(stereoOpenOf({ atoms: [], bonds: [1, 2] }))).toBe("2 double bonds not specified");
    expect(stereoOpenOf({ atoms: [], bonds: [] })).toBeUndefined();
  });

  it("never waits on a worker that does not answer: past its time, nothing said, the structure there", async () => {
    vi.useFakeTimers();
    try {
      const { structureFromSmiles, STEREO_ASK_MS } = await import("./fromSmiles");
      open = "hangs";
      const reading = structureFromSmiles("CCO");
      await vi.advanceTimersByTimeAsync(STEREO_ASK_MS + 1);
      const drawn = await reading;
      expect(drawn.atoms.map((a) => a.el)).toEqual(["C", "C", "O"]);
      expect("stereoOpen" in drawn).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("goes onto the page without what it is told to be", async () => {
    const { structureFromSmiles, withoutStereoOpen } = await import("./fromSmiles");
    open = { atoms: [1], bonds: [] };
    const read = await structureFromSmiles("C");
    expect("stereoOpen" in withoutStereoOpen(read)).toBe(false);
  });
});
