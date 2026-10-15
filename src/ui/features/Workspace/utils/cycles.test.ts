import { describe, expect, it } from "vitest";
import { CycleEase } from "./cycles";

const on = (key: string, angle: number, half = 0.3) => ({ key, index: 0, angle, half });
const settle = (e: CycleEase) => {
  for (let i = 0; i < 200 && e.step(1 / 60); i++);
};

describe("a cycle as it is drawn", () => {
  it("is drawn as it is the first time, with nothing on its way", () => {
    const e = new CycleEase();
    e.take([on("a1", 0)]);
    expect(e.members()[0].half).toBeCloseTo(0.3);
    expect(e.step(1 / 60)).toBe(false);
  });

  it("opens round what comes on to its line, a little at a time", () => {
    const e = new CycleEase();
    e.take([on("a1", 0)]);
    e.take([on("a1", 0), on("a2", 2)]);
    expect(e.members().find((m) => m.angle === 2)!.half).toBe(0);
    e.step(1 / 60);
    const half = e.members().find((m) => m.angle === 2)!.half;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.3);
    settle(e);
    expect(e.members().find((m) => m.angle === 2)!.half).toBeCloseTo(0.3);
  });

  it("closes after what goes off it, running on through it meanwhile, and forgets it once closed", () => {
    const e = new CycleEase();
    e.take([on("a1", 0), on("a2", 2)]);
    e.take([on("a1", 0)]);
    const going = e.members().find((m) => m.angle === 2)!;
    expect(going.passing).toBe(true);
    expect(going.half).toBeCloseTo(0.3);
    settle(e);
    expect(e.members()).toHaveLength(1);
  });

  it("follows what is moved along its line at once", () => {
    const e = new CycleEase();
    e.take([on("a1", 0)]);
    e.take([on("a1", 0.5)]);
    expect(e.members()[0].angle).toBe(0.5);
    expect(e.step(1 / 60)).toBe(false);
  });
});
