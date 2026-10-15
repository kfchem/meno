import { describe, expect, it } from "vitest";
import { acceptOptions, rememberable, valuesOf, type Option, shownOptions } from "./options";

const OPTIONS: Option[] = [
  { id: "version", label: "Version", type: "choice", choices: [{ value: "auto", label: "Auto" }, { value: "V3000", label: "V3000" }], default: "auto" },
  { id: "scale", label: "Scale", type: "number", default: 1, min: 0.25, max: 4, unit: "×" },
  { id: "title", label: "Title", type: "text", default: "" },
  { id: "hydrogens", label: "Hydrogens", type: "switch", default: false },
];

describe("a role's options", () => {
  it("are their defaults, where nothing was chosen before", () => {
    expect(valuesOf(OPTIONS)).toEqual({ version: "auto", scale: 1, title: "", hydrogens: false });
  });

  it("are the chemist's last choices, each where it still fits its option", () => {
    expect(valuesOf(OPTIONS, { version: "V3000", scale: 2, title: "run 3", hydrogens: true })).toEqual({ version: "V3000", scale: 2, title: "run 3", hydrogens: true });
    // (a choice no longer offered, a number out of range, a value of the wrong sort: the default)
    expect(valuesOf(OPTIONS, { version: "V9000", scale: 40, title: 3, hydrogens: "yes", gone: 1 })).toEqual({ version: "auto", scale: 1, title: "", hydrogens: false });
  });
});

describe("options that start from what is written", () => {
  const WRITE: Option[] = [
    { id: "charge", label: "Charge", type: "number", default: 0, from: "charge" },
    { id: "title", label: "Title", type: "text", default: "", from: "name" },
    { id: "method", label: "Method", type: "text", default: "B3LYP" },
  ];

  it("start from what Meno knows of the molecule written, never from what was chosen for another", () => {
    expect(valuesOf(WRITE, { charge: 2, title: "last one", method: "M062X" }, { charge: -1, name: "acetate" })).toEqual({ charge: -1, title: "acetate", method: "M062X" });
    // (known nothing of: the default)
    expect(valuesOf(WRITE, { charge: 2 })).toEqual({ charge: 0, title: "", method: "B3LYP" });
  });

  it("are not remembered", () => {
    expect(rememberable(WRITE, { charge: -1, title: "acetate", method: "M062X" })).toEqual({ method: "M062X" });
  });
});

describe("options a plugin declares", () => {
  it("are read as data, each in the general form with a default it takes; the rest left out", () => {
    const read = acceptOptions([
      { id: "job", label: "Job", type: "choice", choices: [{ value: "sp", label: "SP" }, { value: 3, label: "bad" }], default: "sp" },
      { id: "cores", label: "Cores", type: "number", default: 4, min: 0, step: 1, unit: "cores" },
      { id: "charge", label: "Charge", type: "number", default: 0, from: "charge" },
      { id: "title", label: "Title", type: "text", default: "x", from: "nothing Meno knows" },
      { id: "chk", label: "Checkpoint", type: "switch", default: true },
      // (none of these)
      { id: "job", label: "Again", type: "switch", default: false },
      { id: "Bad Id", label: "Bad", type: "switch", default: false },
      { id: "missing", type: "text", default: "" },
      { id: "outside", label: "Outside", type: "number", default: 9, max: 5 },
      { id: "script", label: "Script", type: "javascript", default: "alert(1)" },
    ]);
    expect(read).toEqual([
      { id: "job", label: "Job", type: "choice", choices: [{ value: "sp", label: "SP" }], default: "sp" },
      { id: "cores", label: "Cores", type: "number", default: 4, min: 0, step: 1, unit: "cores" },
      { id: "charge", label: "Charge", type: "number", default: 0, from: "charge" },
      { id: "title", label: "Title", type: "text", default: "x" },
      { id: "chk", label: "Checkpoint", type: "switch", default: true },
    ]);
    expect(acceptOptions("not a list")).toEqual([]);
  });
});

describe("options that apply to one choice only, and choices that fill in others' values", () => {
  const options: Option[] = [
    {
      id: "look",
      label: "Look",
      type: "choice",
      default: "plain",
      choices: [
        { value: "plain", label: "Plain", sets: { shading: "lit" } },
        { value: "toon", label: "Toon", sets: { shading: "toon", band: 0.4 } },
      ],
    },
    { id: "shading", label: "Shading", type: "choice", default: "lit", choices: [{ value: "lit", label: "Lit" }, { value: "toon", label: "Toon" }], group: "Adjust" },
    { id: "band", label: "Band", type: "number", default: 0.5, when: { id: "shading", in: ["toon"] }, group: "Adjust" },
    { id: "engine", label: "Renderer", type: "choice", default: "a", choices: [{ value: "a", label: "A" }], when: { id: "shading", in: ["lit"] } },
  ];

  it("are shown while another option has one of the values they name - its own form's, or another's beside it", () => {
    expect(shownOptions(options, { look: "plain", shading: "lit", band: 0.5, engine: "a" }).map((o) => o.id)).toEqual(["look", "shading", "engine"]);
    expect(shownOptions(options, { look: "toon", shading: "toon" }).map((o) => o.id)).toEqual(["look", "shading", "band"]);
    // (an option of another form: its `when` names one that is not here)
    expect(shownOptions([options[3]], {}, { shading: "lit" })).toHaveLength(1);
    expect(shownOptions([options[3]], {}, { shading: "toon" })).toHaveLength(0);
  });

  it("are read from a plugin's manifest as data - the rule, its group, and what a choice fills in - and not otherwise", () => {
    const read = acceptOptions([
      { id: "look", label: "Look", type: "choice", default: "a", choices: [{ value: "a", label: "A", sets: { band: 0.4, "bad id": 1, deep: { x: 1 } } }] },
      { id: "band", label: "Band", type: "number", default: 0.5, when: { id: "look", in: ["a", 3, null] }, group: "Adjust" },
      { id: "loose", label: "Loose", type: "switch", default: false, when: { id: "no id!", in: ["a"] } },
    ]);
    const look = read[0] as unknown as { choices: { sets?: unknown }[] };
    expect(look.choices[0].sets).toEqual({ band: 0.4 });
    expect(read[1]).toMatchObject({ when: { id: "look", in: ["a", 3] }, group: "Adjust" });
    expect(read[2].when).toBeUndefined();
  });
});
