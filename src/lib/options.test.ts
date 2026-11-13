import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { acceptOptions, firstUnset, givenOnly, noDefault, rememberable, valuesOf, type Option, shownOptions } from "./options";

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

  it("read a whole number alone where the plugin says so - only by true - and hold what is remembered to it", () => {
    const read = acceptOptions([
      { id: "count", label: "How many", type: "number", default: 200, min: 1, max: 5000, step: 1, whole: true },
      { id: "t", label: "Temperature", type: "number", default: 298.15, min: 1, step: 1, whole: "yes" },
      // (none: its default is no whole number)
      { id: "bad", label: "Bad", type: "number", default: 2.5, whole: true },
    ]);
    expect(read).toEqual([
      { id: "count", label: "How many", type: "number", default: 200, min: 1, max: 5000, step: 1, whole: true },
      { id: "t", label: "Temperature", type: "number", default: 298.15, min: 1, step: 1 },
    ]);
    expect(valuesOf(read, { count: 12.5, t: 300.5 })).toEqual({ count: 200, t: 300.5 });
    expect(valuesOf(read, { count: 600 })).toEqual({ count: 600, t: 298.15 });
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

describe("a number with no default", () => {
  const window: Option = { id: "window", label: "Within", type: "number", default: Number.NaN, min: 0, unit: "kcal/mol" };
  const within: Option = { id: "within", label: "Of", type: "choice", choices: [{ value: "a", label: "A" }], default: "a" };

  it("is none until given: never held, nor remembered, as a number that is none", () => {
    expect([noDefault(window), noDefault(within), noDefault({ ...window, default: 3 })]).toEqual([true, false, false]);
    const values = valuesOf([window, within]);
    expect(Number.isNaN(values.window)).toBe(true);
    expect(givenOnly(values)).toEqual({ within: "a" });
    expect(givenOnly({ a: Number.POSITIVE_INFINITY, b: 0, c: "", d: false })).toEqual({ b: 0, c: "", d: false });
    expect(rememberable([window, within], values)).toEqual({ within: "a" });
    // (the chemist's own, once given: remembered, and what each new one starts with)
    expect(rememberable([window, within], { ...values, window: 2 })).toEqual({ window: 2, within: "a" });
    expect(valuesOf([window, within], { window: 2 }).window).toBe(2);
  });
});

describe("a number that sets nothing", () => {
  it("is read from a plugin's manifest where it is one, and not otherwise", () => {
    const [memory, other] = acceptOptions([
      { id: "maxcore", label: "Memory for each core", type: "number", default: 0, unset: 0, min: 0 },
      { id: "cores", label: "Cores", type: "number", default: 4, unset: "none" },
    ]);
    expect(memory).toMatchObject({ id: "maxcore", type: "number", unset: 0 });
    expect(other).not.toHaveProperty("unset");
  });
});

describe("options the plugins declare", () => {
  // (every list of options in its manifest - a role's, a step's, a kind it writes, a look's - read as Meno reads it)
  const lists = (x: unknown, out: unknown[][] = []): unknown[][] => {
    if (Array.isArray(x)) x.forEach((y) => lists(y, out));
    else if (x && typeof x === "object")
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        if (k === "options" && Array.isArray(v)) out.push(v);
        lists(v, out);
      }
    return out;
  };
  // (Meno's made-up test plugins; the plugins' own repository runs this on its plugins, MENO_PLUGINS_DIR)
  const root = process.env.MENO_PLUGINS_DIR ? resolve(process.env.MENO_PLUGINS_DIR) : join(__dirname, "../test/plugins");

  it("are each read as declared - none left out as no option, a whole number's step a whole number", () => {
    for (const id of readdirSync(root)) {
      let manifest: unknown;
      try {
        manifest = JSON.parse(readFileSync(join(root, id, "manifest.json"), "utf8"));
      } catch {
        continue;
      }
      for (const declared of lists(manifest)) {
        const read = acceptOptions(declared).map((o) => o.id);
        const ids = (declared as { id?: unknown }[]).map((o) => o.id);
        // (named, where one is left out: the plugin and the option)
        expect(ids.filter((x) => !read.includes(x as string)).map((x) => `${id}: ${String(x)}`)).toEqual([]);
      }
    }
  });

  it("leave out a whole number whose step is no whole one, as its arrows would step onto numbers it refuses", () => {
    expect(acceptOptions([{ id: "n", label: "N", type: "number", default: 2, step: 0.5, whole: true }])).toEqual([]);
    expect(acceptOptions([{ id: "n", label: "N", type: "number", default: 2, step: 2, whole: true }])).toEqual([{ id: "n", label: "N", type: "number", default: 2, step: 2, whole: true }]);
  });
});

describe("the option a card opened to ask focuses", () => {
  const ASKS: Option[] = [
    { id: "mode", label: "Mode", type: "choice", choices: [{ value: "a", label: "A" }], default: "a" },
    { id: "count", label: "Count", type: "number", default: 3 },
    { id: "window", label: "Within", type: "number", default: Number.NaN, min: 0 },
    { id: "other", label: "Other", type: "number", default: Number.NaN },
  ];
  it("is the first number shown that holds no value - none where each holds one", () => {
    expect(firstUnset(ASKS, {})).toBe("window");
    expect(firstUnset(ASKS, { window: 2.5 })).toBe("other");
    expect(firstUnset(ASKS, { window: 2.5, other: 1 })).toBeUndefined();
    expect(firstUnset(ASKS.slice(0, 2), {})).toBeUndefined();
  });
});
