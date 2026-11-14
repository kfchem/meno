/**
 * A step that holds no value of its own for an option - one put down otherwise than on the canvas, a template's, a
 * file's - takes the one Settings, Calculations, keeps for its kind done by who does it (docs/WORKFLOWS.md, decided:
 * 17), else the option's own default: on its card, when it is judged ready, and when it runs. Its own values stay its own.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { notReadyFor, stepOptions, stepRole, stepValues } from "./doers";

describe("Meno's own step with no options of its own", () => {
  afterEach(() => useAppSettings.setState((s) => ({ ...s, options: {} })));

  it("an Energy window: asks for its window until Settings keeps one, then is ready with it", () => {
    const step = { kind: "energy-window" as const, by: "meno", options: undefined };
    expect(notReadyFor(step)).toMatch(/window/i);
    useAppSettings.setState((s) => ({ ...s, options: { [stepRole("energy-window", "meno")]: { window: 2.5 } } }));
    expect(notReadyFor(step)).toBeUndefined();
    expect(stepValues(step).window).toBe(2.5);
    // (shown on its card as its value, Settings' its default)
    expect(stepOptions(step).find((o) => o.id === "window")?.default).toBe(2.5);
    // (a step's own window stays its own)
    expect(stepValues({ ...step, options: { window: 4 } }).window).toBe(4);
  });
});
