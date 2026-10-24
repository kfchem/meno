import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { Option } from "../../lib/options";
import OptionRows from "../options/OptionRows";
import OptionsForm from "../options/OptionsForm";
import { numberDraft, numberField, rangeSaid, setAsItGoes, typedNumber, type NumberDraft, type NumberEvent, type NumberRange } from "./number";

// Vitest runs in Node, with no page to mount on: the field's keys as the
// steps they make (number.ts), and the forms as the server's renderer writes them.

/** The field after each of `events`, from `value`. */
function after(value: number, events: NumberEvent[], range: NumberRange = { min: 1, max: 100 }): NumberDraft {
  return events.reduce((d, e) => numberField(d, e, range), numberDraft(value));
}

describe("Meno's own number field", () => {
  it("holds what is typed, nothing too: the first digit of 25 taken out and 3 typed gives 35", () => {
    const typed = after(25, [
      { kind: "typed", text: "5" },
      { kind: "typed", text: "" },
    ]);
    expect(typed.text).toBe("");
    expect(typed.value).toBe(25);
    const set = after(25, [
      { kind: "typed", text: "5" },
      { kind: "typed", text: "" },
      { kind: "typed", text: "35" },
      { kind: "commit" },
    ]);
    expect(set).toEqual({ text: "35", value: 35, refused: false });
  });

  it("goes back to the last good number where what is typed is none it takes, on leaving it: nothing, a minus, one out of range", () => {
    for (const text of ["", "-", "abc", "0", "101"]) expect(after(25, [{ kind: "typed", text }, { kind: "commit" }])).toEqual({ text: "25", value: 25, refused: true });
    // (left as it was: nothing refused)
    expect(after(25, [{ kind: "commit" }]).refused).toBe(false);
  });

  it("reads a true minus and a comma; Escape takes back what was typed; the arrows step within the range", () => {
    expect(after(0, [{ kind: "typed", text: "−2,5" }, { kind: "commit" }], {}).value).toBe(-2.5);
    expect(after(25, [{ kind: "typed", text: "3" }, { kind: "escape" }])).toEqual({ text: "25", value: 25, refused: false });
    expect(after(100, [{ kind: "step", by: 1 }]).value).toBe(100);
    expect(after(0.2, [{ kind: "step", by: 1 }], { step: 0.1 }).value).toBe(0.3);
    expect(after(25, [{ kind: "typed", text: "30" }, { kind: "step", by: -1 }]).value).toBe(29);
  });

  it("steps a number with places of its own by the step, keeping them, where the option says no step (1 is taken)", () => {
    expect(after(0.25, [{ kind: "step", by: 1 }], {}).value).toBe(1.25);
    expect(after(2.5, [{ kind: "step", by: 1 }], {}).value).toBe(3.5);
    expect(after(2.5, [{ kind: "step", by: -1 }], {}).value).toBe(1.5);
    expect(after(0, [{ kind: "typed", text: "0.125" }, { kind: "step", by: 1 }], {}).value).toBe(1.125);
  });

  it("sets what was typed as it goes while typed in (its card closed), as leaving it would - and nothing where nothing was typed, or nothing it takes", () => {
    expect(setAsItGoes({ text: "35", value: 25, refused: false }, true, { min: 1 })).toBe(35);
    expect(setAsItGoes({ text: "35", value: 25, refused: false }, false, { min: 1 })).toBeNull();
    expect(setAsItGoes({ text: "25", value: 25, refused: false }, true, { min: 1 })).toBeNull();
    expect(setAsItGoes({ text: "", value: 25, refused: false }, true, { min: 1 })).toBeNull();
  });

  it("reads only a number as typed: no thousands' comma, no 0x or 0b, no word; an exponent and a decimal comma are read", () => {
    for (const t of ["1,000", "0x10", "0b11", "Infinity", "1 2", "1..2", "e3", ".", "-"]) expect(typedNumber(t), t).toBeNaN();
    expect(typedNumber("1e3")).toBe(1000);
    expect(typedNumber("2,5")).toBe(2.5);
    expect(typedNumber(" \u22123.5 ")).toBe(-3.5);
    expect(typedNumber(".5")).toBe(0.5);
    // (refused, it goes back as any number it does not take does)
    expect(after(25, [{ kind: "typed", text: "1,000" }, { kind: "commit" }], {})).toEqual({ text: "25", value: 25, refused: true });
  });

  it("shows nothing for no number - never NaN - and steps from the least it takes", () => {
    expect(numberDraft(NaN).text).toBe("");
    expect(after(NaN, [{ kind: "commit" }], {}).refused).toBe(false);
    expect(after(NaN, [{ kind: "step", by: 1 }], { min: 4 }).value).toBe(5);
  });

  it("says what it takes", () => {
    expect(rangeSaid({ min: 1, max: 100 })).toBe("From 1 to 100");
    expect(rangeSaid({ min: 0 })).toBe("At least 0");
    expect(rangeSaid({})).toBe("");
  });
});

describe("a number among a role's options", () => {
  const options: Option[] = [{ id: "t", label: "Temperature", type: "number", default: 298.15, min: 0, unit: "K" }];

  it("is Meno's number field in a card and in Settings, never the browser's (no steppers, no refusing an empty field)", () => {
    for (const html of [renderToString(<OptionsForm options={options} values={{ t: 25 }} onChange={() => {}} />), renderToString(<OptionRows options={options} values={{ t: 25 }} onChange={() => {}} />)]) {
      expect(html).not.toContain('type="number"');
      expect(html).toContain('inputMode="decimal"');
      expect(html).toContain('value="25"');
      expect(html).toContain('title="At least 0"');
    }
  });
});
