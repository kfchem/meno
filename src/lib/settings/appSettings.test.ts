import { describe, expect, it } from "vitest";
import {
  acceptAppSettings,
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  settingsFileText,
  useAppSettings,
} from "./appSettings";
import { BALL_AND_STICK } from "../chem/style3d";
import { STYLE_PRESETS } from "../chem/style";

describe("how finely the canvas is drawn, as the settings file holds it", () => {
  it("is as the screen shows things, by default: from a file from before there was a choice, or one that does not read", () => {
    expect(acceptAppSettings({}).canvas).toEqual({ resolution: "display" });
    expect(acceptAppSettings({ canvas: { resolution: 3 } }).canvas).toEqual({ resolution: "display" });
    expect(acceptAppSettings({ canvas: "fine" }).canvas).toEqual({ resolution: "display" });
  });

  it("keeps a choice saved, whichever it is - twice, the default before, included", () => {
    expect(acceptAppSettings({ canvas: { resolution: 2 } }).canvas).toEqual({ resolution: 2 });
    expect(acceptAppSettings({ canvas: { resolution: "display" } }).canvas).toEqual({ resolution: "display" });
    expect(acceptAppSettings({ canvas: { resolution: 1 } }).canvas).toEqual({ resolution: 1 });
  });
});

describe("the settings file", () => {
  it("reads back what it wrote", () => {
    const settings = {
      drawingStyle: { preset: "own-00000000-0000-4000-8000-000000000001", changes: { ends: "round" as const }, own: { name: "Group style", style: { ...STYLE_PRESETS[2].style, bondLengthPt: 12 } } },
      ownDrawingStyles: [{ id: "own-00000000-0000-4000-8000-000000000001", name: "Group style", style: { ...STYLE_PRESETS[2].style, bondLengthPt: 12 } }],
      style3d: { primary: "glossy", secondary: "space", looks: { glossy: { bondRadius: 0.15 } }, shared: { keyLight: 2 }, own: [{ id: "own-00000000-0000-4000-8000-000000000001", name: "Lab figures", look: { ...BALL_AND_STICK, ballScale: 0.16, colours: { O: "#ff2020" } } }] },
      network: { offline: true, granted: ["python-env:console"] },
      chemistry: { valenceWarnings: false },
      updates: { asked: true, notice: false },
      options: { "write:sdf": { version: "V3000", frames: "all" }, export: { kind: "sdf" } },
      abbreviations: [{ label: "Mmt", name: "4-methoxytrityl", smiles: "*C(c1ccccc1)(c1ccccc1)c1ccc(OC)cc1", also: ["MMTr"] }],
      files: { read: { orca: "cclib" }, also: { orca: ["pyscf"] } },
      plugins: { removed: ["rdkit"], roles: { smiles: "rdkit" }, programs: { "orca:orca": "/Applications/orca_6_1_0/orca" } },
      pictures: { dpi: 1200 as const },
      pointer: { wheelUp: "out" as const },
      canvas: { resolution: "display" as const },
      labels: { smart: false },
      words: { smart: false },
      calculations: { cores: 4, coresAll: 8, memoryAll: 12288 },
      procedures: [{ id: "p-1", name: "Optimise, then energies", saved: 1, flow: { sets: [{ id: 1, x0: 0, y0: -4, x1: 4, y1: 0 }], steps: [{ id: 2, kind: "optimise", x: 6, y: 0 }], wires: [{ id: 3, from: { set: 1 }, to: 2 }] } }],
      colours: { use: "set-1", sets: [{ id: "set-1", name: "Talk slides", colours: ["#cd4560", "#317689", "#2a9d8f"] }] },
    };
    const text = settingsFileText(settings);
    expect(JSON.parse(text).format).toBe(1);
    expect(acceptAppSettings(JSON.parse(text))).toEqual(settings);
  });

  it("falls back to the defaults for what it cannot read", () => {
    expect(acceptAppSettings(null)).toBe(DEFAULT_APP_SETTINGS);
    expect(acceptAppSettings({ drawingStyle: 5 })).toEqual(DEFAULT_APP_SETTINGS);
    // offline only when it says so; a purpose only when it is one
    expect(
      acceptAppSettings({
        network: { offline: "yes", granted: ["python-env:console", "x y", 3, "python-env:console"] },
      }).network,
    ).toEqual({ offline: false, granted: ["python-env:console"] });
    // a file from before there were chemistry settings, or a setting mangled
    expect(
      acceptAppSettings({ chemistry: { valenceWarnings: "on", stereoLabels: true } }).chemistry,
    ).toEqual({ valenceWarnings: true });
    // the 3D energy window: a number from 0 to the widest taken, else the default (unset)
    expect(acceptAppSettings({ chemistry: { valenceWarnings: true, window3d: 45 } }).chemistry).toEqual({ valenceWarnings: true, window3d: 45 });
    for (const window3d of [-1, "30", 1e9, Number.NaN, null])
      expect(acceptAppSettings({ chemistry: { valenceWarnings: true, window3d } }).chemistry).toEqual({ valenceWarnings: true });
    // how many conformers the page tries: a number of the chemist's own, 1 to 5000 - else as many as the molecule needs (unset)
    expect(acceptAppSettings({ chemistry: { valenceWarnings: true, sought3d: "fixed", count3d: 40 } }).chemistry).toEqual({ valenceWarnings: true, sought3d: "fixed", count3d: 40 });
    for (const [sought3d, count3d] of [["needed", 0], ["fixed?", 5001], [true, 2.5], [null, "40"]])
      expect(acceptAppSettings({ chemistry: { valenceWarnings: true, sought3d, count3d } }).chemistry).toEqual({ valenceWarnings: true });
    // a file from before readers were chosen: none chosen; one from before Files, its readers chosen as they were;
    // a choice that is not an id, left out
    expect(acceptAppSettings({}).files).toEqual({ read: {}, also: {} });
    // which way the wheel zooms: in, upwards, unless the file says out
    expect(acceptAppSettings({ pointer: { wheelUp: "sideways" } }).pointer).toEqual({ wheelUp: "in" });
    // how long a long press is: shorter or longer as the file says, else normal (none kept)
    expect(acceptAppSettings({ pointer: { wheelUp: "in", longPress: "longer" } }).pointer).toEqual({ wheelUp: "in", longPress: "longer" });
    expect(acceptAppSettings({ pointer: { wheelUp: "in", longPress: 900 } }).pointer).toEqual({ wheelUp: "in" });
    // cores for each, and the cores and memory jobs may use: whole numbers, at least one, within reason
    expect(acceptAppSettings({ calculations: { cores: 2.5, coresAll: 0, memoryAll: -1 } }).calculations).toEqual({});
    expect(acceptAppSettings({ calculations: { cores: "8", coresAll: 1025 } }).calculations).toEqual({});
    expect(acceptAppSettings({ calculations: { cores: 16, coresAll: 32, memoryAll: 24576 } }).calculations).toEqual({ cores: 16, coresAll: 32, memoryAll: 24576 });
    expect(acceptAppSettings({ calculations: { largeWorkspaceMB: 0 } }).calculations).toEqual({});
    expect(acceptAppSettings({ calculations: { largeWorkspaceMB: 1024 } }).calculations).toEqual({ largeWorkspaceMB: 1024 });
    // (past the most a workspace's file may come to at all: not taken)
    expect(acceptAppSettings({ calculations: { largeWorkspaceMB: 2048 } }).calculations).toEqual({});
    expect(acceptAppSettings({ calcReaders: { chosen: { orca: "cclib", gaussian: 3, "x y": "cclib" } } }).files).toEqual({ read: { orca: "cclib" }, also: {} });
    expect(
      acceptAppSettings({ calcReaders: { chosen: { orca: "cclib" } }, files: { read: { orca: "pyscf" }, also: { orca: ["cclib", "cclib", 4], xtb: [] } } }).files,
    ).toEqual({ read: { orca: "pyscf" }, also: { orca: ["cclib"] } });
    // a file from before molecules in 3D had a look of their own: Meno's
    expect(acceptAppSettings({ drawingStyle: { preset: "rsc", changes: {} } }).style3d).toEqual(DEFAULT_APP_SETTINGS.style3d);
    // the options remembered: by a role, each value a string, a number or a switch; whether it fits is asked when drawn
    expect(acceptAppSettings({}).options).toEqual({});
    // labels and words written as they are meant, unless the file says not
    expect([acceptAppSettings({}).labels, acceptAppSettings({}).words]).toEqual([{ smart: true }, { smart: true }]);
    expect(acceptAppSettings({ words: { smart: "no" } }).words).toEqual({ smart: true });
    expect(
      acceptAppSettings({ options: { "write:mol": { version: "V3000", scale: 2, x: null, "a b": 1 }, "Bad Role": { a: 1 }, export: "sdf" } }).options,
    ).toEqual({ "write:mol": { version: "V3000", scale: 2 } });
    // the plugins taken away and the roles chosen - roles Meno defines: ids only; what no longer is kept (guides shown, before they were shown only when asked) dropped
    const plugins = { removed: ["rdkit", "rdkit", "Not An Id", 3], roles: { smiles: "rdkit", checks: 4, "no-such-role": "rdkit" }, guided: ["getting-started"] };
    expect(acceptAppSettings({ plugins }).plugins).toEqual({
      removed: ["rdkit"],
      roles: { smiles: "rdkit" },
      programs: {},
    });
    expect(acceptAppSettings({}).plugins).toEqual({ removed: [], roles: {}, programs: {} });
    // the programs installed separately located: by plugin and program, each a full path
    const programs = { "orca:orca": "/opt/orca/orca", "gaussian:g16": "C:\\G16W\\g16.exe", "orca:../x": "/x", "Bad:p": "/x", "orca:x": "orca", "orca:y": 3 };
    expect(acceptAppSettings({ plugins: { programs } }).plugins.programs).toEqual({ "orca:orca": "/opt/orca/orca", "gaussian:g16": "C:\\G16W\\g16.exe" });
    // (on a share on the network, as Windows names one - kept for the app to look at; a share without a name, or a path from nowhere, not)
    const shared = { "gaussian:g16": "\\\\fileserver\\apps\\g16w\\g16.exe", "orca:orca": "\\\\?\\UNC\\fileserver\\orca\\orca.exe", "xtb:xtb": "\\\\", "crest:crest": "apps\\crest.exe" };
    expect(acceptAppSettings({ plugins: { programs: shared } }).plugins.programs).toEqual({
      "gaussian:g16": "\\\\fileserver\\apps\\g16w\\g16.exe",
      "orca:orca": "\\\\?\\UNC\\fileserver\\orca\\orca.exe",
    });
    // the procedures saved: each with an id, a name and steps - the rest read as they are used
    const procedures = [
      { id: "p-1", name: " Optimise ", saved: 5, flow: { steps: [{}], sets: "x" } },
      { id: "p-1", name: "Again", flow: { steps: [{}] } },
      { id: "Bad Id", name: "x", flow: { steps: [{}] } },
      { id: "p-2", name: "No steps", flow: { steps: [] } },
    ];
    expect(acceptAppSettings({ procedures }).procedures).toEqual([{ id: "p-1", name: "Optimise", saved: 5, flow: { sets: [], steps: [{}], wires: [] } }]);
    expect(acceptAppSettings({}).procedures).toEqual([]);
    // copied pictures: at a resolution offered, or else 600 dpi - a file from before there was a choice too
    expect(acceptAppSettings({}).pictures).toEqual({ dpi: 600 });
    expect(acceptAppSettings({ pictures: { dpi: 300 } }).pictures).toEqual({ dpi: 300 });
    expect(acceptAppSettings({ pictures: { dpi: 450 } }).pictures).toEqual({ dpi: 600 });
    // a file from before Meno updated itself: not asked yet
    expect(acceptAppSettings({ updates: { asked: "yes" } }).updates).toEqual({ asked: false, notice: true });
    // the user's abbreviations: those with a label and a structure that reads
    expect(
      acceptAppSettings({
        abbreviations: [
          { label: "Mmt", smiles: "*C" },
          { label: "two words", smiles: "*C" },
          { label: "Xx", smiles: "C" },
          { label: "Yy", smiles: "*C?" },
          "Zz",
        ],
      }).abbreviations,
    ).toEqual([{ label: "Mmt", smiles: "*C", name: "" }]);
  });

  it("loads the defaults where there is no file, and says it has loaded", async () => {
    await loadAppSettings();
    expect(useAppSettings.getState()).toMatchObject({
      ...DEFAULT_APP_SETTINGS,
      loaded: true,
      error: null,
    });
  });
});

describe("the settings file holds only what the user changed (the maintainer, 2026-10-21)", () => {
  const read = (text: string) => acceptAppSettings(JSON.parse(text));
  const variants: [string, Record<string, unknown>][] = [
    ["another drawing style", { drawingStyle: { preset: STYLE_PRESETS[1].id, changes: {} } }],
    ["a change of the drawing style", { drawingStyle: { preset: STYLE_PRESETS[0].id, changes: { bondLengthPt: 21 } } }],
    ["the 3D looks the other way round", { style3d: { ...DEFAULT_APP_SETTINGS.style3d, primary: "space", secondary: "balls" } }],
    ["offline", { network: { offline: true, granted: [] } }],
    ["a network grant", { network: { offline: false, granted: ["updates"] } }],
    ["valence warnings off", { chemistry: { valenceWarnings: false } }],
    ["asked about updates", { updates: { asked: true } }],
    ["a plugin's role", { plugins: { ...DEFAULT_APP_SETTINGS.plugins, roles: { conformers: "some-plugin" } } }],
    ["a plugin removed", { plugins: { ...DEFAULT_APP_SETTINGS.plugins, removed: ["some-plugin"] } }],
    ["the wheel zooming out", { pointer: { wheelUp: "out" } }],
    ["once", { canvas: { resolution: 1 } }],
    ["labels as typed", { labels: { smart: false } }],
    ["words as typed", { words: { smart: false } }],
    ["cores jobs may use", { calculations: { coresAll: 2 } }],
    ["memory jobs may use", { calculations: { memoryAll: 4096 } }],
    ["a larger workspace before a save says so", { calculations: { largeWorkspaceMB: 800 } }],
    ["pictures at another resolution", { pictures: { dpi: 300 } }],
  ];

  it("writes nothing but its format where nothing was changed", () => {
    expect(JSON.parse(settingsFileText(DEFAULT_APP_SETTINGS))).toEqual({ format: 1 });
    // (the update notice: on unless turned off, and kept only when it was)
    expect(DEFAULT_APP_SETTINGS.updates.notice).toBe(true);
    expect(acceptAppSettings({ updates: { asked: true } }).updates).toEqual({ asked: true, notice: true });
    expect(JSON.parse(settingsFileText({ ...DEFAULT_APP_SETTINGS, updates: { asked: false, notice: false } }))).toEqual({ format: 1, updates: { notice: false } });
  });

  it("writes only what was changed, and reads back as it was - each setting alike", () => {
    for (const [what, change] of variants) {
      const settings = acceptAppSettings({ ...change });
      // (a change the settings take: else the test would prove nothing)
      expect(settings, what).not.toEqual(DEFAULT_APP_SETTINGS);
      const text = settingsFileText(settings);
      expect(Object.keys(JSON.parse(text)), what).toEqual(["format", Object.keys(change)[0]]);
      expect(read(text), what).toEqual(settings);
    }
    // (within a setting, only what changed: a plugin's role, not the other parts of the plugins' settings)
    expect(JSON.parse(settingsFileText(acceptAppSettings({ plugins: { ...DEFAULT_APP_SETTINGS.plugins, roles: { conformers: "some-plugin" } } }))).plugins).toEqual({ roles: { conformers: "some-plugin" } });
    // (but a drawing style chosen whole: its preset and its changes are read only together)
    expect(JSON.parse(settingsFileText(acceptAppSettings({ drawingStyle: { preset: STYLE_PRESETS[0].id, changes: { bondLengthPt: 21 } } }))).drawingStyle).toEqual({ preset: STYLE_PRESETS[0].id, changes: { bondLengthPt: 21 } });
  });

  it("reads a file that holds every setting - as Meno wrote them before - and writes back only what differs from the defaults now", () => {
    const old = JSON.parse(JSON.stringify({ format: 1, ...DEFAULT_APP_SETTINGS, pointer: { wheelUp: "out" } }));
    const settings = read(JSON.stringify(old));
    expect(JSON.parse(settingsFileText(settings))).toEqual({ format: 1, pointer: { wheelUp: "out" } });
  });
});
