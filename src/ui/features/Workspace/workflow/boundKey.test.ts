// A step's input key changes with an option taken from a property, and with which property (found in review).
import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import type { WorkflowStep } from "../store/types";
import { inputKey } from "./flow";

describe("a step's input key", () => {
  it("changes with an option taken from a property, and with which property: binding or unbinding marks the step changed", () => {
    const doc = createWorkspaceDocument().getState();
    // (a step that takes nothing in, so its key is its kind, its doer and its options alone)
    const step: WorkflowStep = { id: 1, kind: "generate", by: "molgen", x: 0, y: 0 };
    const own = inputKey(doc, step, "molgen");
    const bound = inputKey(doc, { ...step, bound: { count: "n" } }, "molgen");
    const other = inputKey(doc, { ...step, bound: { count: "m" } }, "molgen");
    expect(new Set([own, bound, other]).size).toBe(3);
  });
});
