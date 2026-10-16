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

describe("the settings file", () => {
  it("reads back what it wrote", () => {
    const settings = {
      drawingStyle: { preset: "own-00000000-0000-4000-8000-000000000001", changes: { ends: "round" as const }, own: { name: "Group style", style: { ...STYLE_PRESETS[2].style, bondLengthPt: 12 } } },
      ownDrawingStyles: [{ id: "own-00000000-0000-4000-8000-000000000001", name: "Group style", style: { ...STYLE_PRESETS[2].style, bondLengthPt: 12 } }],
      style3d: { primary: "glossy", secondary: "space", looks: { glossy: { bondRadius: 0.15 } }, shared: { keyLight: 2 }, own: [{ id: "own-00000000-0000-4000-8000-000000000001", name: "Lab figures", look: { ...BALL_AND_STICK, ballScale: 0.16, colours: { O: "#ff2020" } } }] },
      network: { offline: true, granted: ["python-env:console"] },
      chemistry: { valenceWarnings: false },
      updates: { asked: true },
      options: { "write:sdf": { version: "V3000", frames: "all" }, export: { kind: "sdf" } },
      abbreviations: [{ label: "Mmt", name: "4-methoxytrityl", smiles: "*C(c1ccccc1)(c1ccccc1)c1ccc(OC)cc1", also: ["MMTr"] }],
      files: { read: { orca: "cclib" }, also: { orca: ["pyscf"] } },
      plugins: { removed: ["rdkit"], roles: { smiles: "rdkit" }, programs: { "orca:orca": "/Applications/orca_6_1_0/orca" }, guided: ["getting-started"] },
      pictures: { dpi: 1200 as const },
      pointer: { wheelUp: "out" as const },
      labels: { smart: false },
      words: { smart: false },
      calculations: { atOnce: 2, cores: 4 },
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
    // a file from before readers were chosen: none chosen; one from before Files, its readers chosen as they were;
    // a choice that is not an id, left out
    expect(acceptAppSettings({}).files).toEqual({ read: {}, also: {} });
    // which way the wheel zooms: in, upwards, unless the file says out
    expect(acceptAppSettings({ pointer: { wheelUp: "sideways" } }).pointer).toEqual({ wheelUp: "in" });
    // jobs at once and cores for each: whole numbers, at least one, within reason
    expect(acceptAppSettings({ calculations: { atOnce: 0, cores: 2.5 } }).calculations).toEqual({});
    expect(acceptAppSettings({ calculations: { atOnce: 65, cores: "8" } }).calculations).toEqual({});
    expect(acceptAppSettings({ calculations: { atOnce: 3, cores: 16 } }).calculations).toEqual({ atOnce: 3, cores: 16 });
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
    // the plugins taken away, the roles chosen - roles Meno defines - and the guides shown: ids only
    const plugins = { removed: ["rdkit", "rdkit", "Not An Id", 3], roles: { smiles: "rdkit", checks: 4, "no-such-role": "rdkit" }, guided: ["getting-started", "getting-started", 5] };
    expect(acceptAppSettings({ plugins }).plugins).toEqual({
      removed: ["rdkit"],
      roles: { smiles: "rdkit" },
      programs: {},
      guided: ["getting-started"],
    });
    expect(acceptAppSettings({}).plugins).toEqual({ removed: [], roles: {}, programs: {}, guided: [] });
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
    expect(acceptAppSettings({ updates: { asked: "yes" } }).updates).toEqual({ asked: false });
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
