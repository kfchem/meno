import { describe, expect, it } from "vitest";
import { inputsOf, laterPortsNeed, type StepPort } from "./kinds";

const port = (id: string, name: string, extra: Partial<StepPort> = {}): StepPort => ({ id, name, takes: ["molecules"], ...extra });
const wired = (...ids: string[]) => (id: string) => ids.includes(id);

describe("a step's later inputs", () => {
  it("each needed unless marked optional: a second not wired says so", () => {
    const ports = [port("first", "First"), port("second", "Second")];
    expect(laterPortsNeed(ports, wired("first"))).toBe("Nothing comes into Second");
    expect(laterPortsNeed(ports, wired("first", "second"))).toBeNull();
  });

  it("an optional one, where wanted: the step runs with nothing wired into it", () => {
    const ports = [port("in", "Molecules"), port("number", "Number", { optional: true })];
    expect(laterPortsNeed(ports, wired("in"))).toBeNull();
    expect(laterPortsNeed(ports, wired("in", "number"))).toBeNull();
  });

  it("two that go together: both wired, or neither - one alone named, with the other it wants", () => {
    const ports = [port("guess", "Guess"), port("reactant", "Reactant side", { optional: true, together: "product" }), port("product", "Product side", { optional: true, together: "reactant" })];
    expect(laterPortsNeed(ports, wired("guess"))).toBeNull();
    expect(laterPortsNeed(ports, wired("guess", "reactant", "product"))).toBeNull();
    expect(laterPortsNeed(ports, wired("guess", "reactant"))).toBe("Reactant side is wired: wire Product side too, or neither");
    expect(laterPortsNeed(ports, wired("guess", "product"))).toBe("Product side is wired: wire Reactant side too, or neither");
  });

  it("an Energy diagram's Connects is optional, and the steps of two sets need both", () => {
    expect(inputsOf("energy-diagram").map((p) => [p.id, p.optional ?? false])).toEqual([
      ["levels", false],
      ["connects", true],
    ]);
    for (const kind of ["merge", "rebond", "compare-bonding"] as const) expect(inputsOf(kind).every((p) => !p.optional), kind).toBe(true);
  });
});
