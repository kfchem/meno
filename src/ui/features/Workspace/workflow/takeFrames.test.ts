import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import type { Molecule3D } from "../store/types";
import { factor } from "../../../../lib/units";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import { kindInfo } from "./kinds";
import { addSet, addStep, connect } from "./model";
import { runStep, type RunWith } from "./run";
import { keptNames, takeFrames } from "./takeFrames";

const KCAL = factor("kcal/mol", "Eh");
/** A path of five images - water's hydrogen moved along x - their energies (kcal/mol above the first) rising to a top at the third and down past where it began: a step's path, its last frame its entry. */
function path(above: (number | null)[] = [0, 5, 12, 3, -2], title = "path a"): Molecule3D {
  const geo = (k: number) => [0, 0, 0, 0.96 + 0.1 * k, 0, 0, -0.24, 0.93, 0];
  const first = geo(0);
  return {
    id: 7,
    at: { x: 0, y: 0 },
    title,
    atoms: ["O", "H", "H"].map((el, i) => ({ el, x: first[3 * i], y: first[3 * i + 1], z: first[3 * i + 2] })),
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    frames: above.slice(1).map((_, k) => geo(k + 1)),
    energies: above.map((e) => (e == null ? Number.NaN : -76.4 + e * KCAL)),
    path: true,
  };
}
const ok = (o: ReturnType<typeof takeFrames>) => {
  if (!o.ok) throw new Error(o.said);
  return o;
};
const frames = (o: ReturnType<typeof ok>) => o.kept.map((e) => e.frame);

describe("Take frames", () => {
  it("takes the highest in energy - a path's top, its third image - with its energy, and the molecule and frame it came from", () => {
    const o = ok(takeFrames([path()], "highest"));
    expect(frames(o)).toEqual([2]);
    expect(o.kept[0]).toMatchObject({ from: 7, frame: 2, energy: -76.4 + 12 * KCAL });
    expect(o.kept[0].xyz[3]).toBeCloseTo(1.16);
    expect(o.said).toBe("1 frame of 1 molecule: the highest in energy");
  });

  it("takes the first, the last, the entry frame - a path's last - or the highest and those either side", () => {
    expect(frames(ok(takeFrames([path()], "first")))).toEqual([0]);
    expect(frames(ok(takeFrames([path()], "last")))).toEqual([4]);
    expect(frames(ok(takeFrames([path()], "entry")))).toEqual([4]);
    expect(frames(ok(takeFrames([path()], "around", 1)))).toEqual([1, 2, 3]);
    // (as far as there are frames: two either side of the top reach both ends)
    expect(frames(ok(takeFrames([path()], "around", 2)))).toEqual([0, 1, 2, 3, 4]);
    // (each frame taken a molecule of its own)
    expect(ok(takeFrames([path()], "around", 1)).kept.map((e) => e.compound)).toEqual([0, 1, 2]);
  });

  it("keeps from its molecule only what Keep from its molecule names - a name Tag gave it, as it is - never a value worked out for it, and a frame's own where it holds one, said once", () => {
    const value = (v: string | number, unit: Property["unit"] = "none"): Property => ({ value: v, unit, status: "computed" });
    // (a reaction path's molecule, its entry frame the point it started from - the third - holding its tags and what its
    //  frequencies gave; its first frame holding a species of its own)
    const irc: Molecule3D = {
      ...path([0, 5, 12, 3, -2], "irc a"),
      path: undefined,
      entryFrames: [2],
      properties: [
        { species: value("species-1") },
        {},
        { path: value("path-1"), species: value("species-2"), "thermo.free-energy": value(-76.38, "Eh"), imaginary: value(1) },
        {},
        {},
      ],
    };
    // (the first and the last, keeping its path and species: the first keeps its own species, the last takes its molecule's)
    const o = ok(takeFrames([irc], "first", 1, ["path", "species"]));
    expect(o.kept[0].properties).toEqual({ path: value("path-1"), species: value("species-1") });
    const last = ok(takeFrames([irc], "last", 1, ["path", "species"]));
    expect(last.kept[0].properties).toEqual({ path: value("path-1"), species: value("species-2") });
    // (its free energy and imaginary count - what was worked out for the point it started from - reach no frame: not named)
    for (const k of [o, last]) {
      expect(k.kept[0].properties).not.toHaveProperty("thermo.free-energy");
      expect(k.kept[0].properties).not.toHaveProperty("imaginary");
    }
    // (said: what it keeps, and that a frame kept its own - once)
    expect(o.said).toBe("1 frame of 1 molecule: the first, keeping its molecule's path and species · 1 frame kept its own species");
    expect(last.said).toBe("1 frame of 1 molecule: the last, keeping its molecule's path and species");
    // (named, as asked, the free energy is kept as it is)
    expect(ok(takeFrames([irc], "last", 1, ["thermo.free-energy"])).kept[0].properties).toEqual({ "thermo.free-energy": value(-76.38, "Eh") });
    // (none named - as before - nothing of its molecule: the first frame its own alone, the last none)
    expect(ok(takeFrames([irc], "first")).kept[0].properties).toEqual({ species: value("species-1") });
    expect(ok(takeFrames([irc], "last")).kept[0]).not.toHaveProperty("properties");
    // (a name no molecule holds: said, as one some do not are)
    expect(ok(takeFrames([irc], "last", 1, ["path", "pc"])).said).toBe("1 frame of 1 molecule: the last, keeping its molecule's path and pc · pc not on any molecule");
    // (a molecule that does not hold a name another does: said, never passed over - as typed, never made small)
    const other: Molecule3D = { ...irc, id: 8, title: "irc b", properties: [{}, {}, { species: value("species-3") }, {}, {}] as Record<string, Property>[] };
    expect(ok(takeFrames([irc, other], "last", 1, ["Path", "path"])).said).toBe("2 frames of 2 molecules: the last, keeping its molecule's Path and path · Path not on any molecule · path not on 1 molecule");
    // (its entry frame taken, holding its molecule's own: no "kept its own" said)
    expect(ok(takeFrames([irc], "entry", 1, ["path", "species"])).said).toBe("1 frame of 1 molecule: each one's entry frame, keeping its molecule's path and species");
    // (a molecule of several entry frames - each an entry of its own - has none of its own to keep)
    const several = { ...irc, entryFrames: [2, 4] };
    expect(ok(takeFrames([several], "last", 1, ["path"])).kept[0]).not.toHaveProperty("properties");
  });

  it("names on its card what it keeps from each frame's molecule, one name to a line, each once", () => {
    expect(keptNames(" path \n\nspecies\npath\n")).toEqual(["path", "species"]);
    expect(kindInfo("take-frames").how!({ which: "last", either: 1, keep: "path\nspecies" })).toBe("the last, keeping its molecule's path and species");
    expect(kindInfo("take-frames").how!({ which: "last", either: 1, keep: "path\nspecies\npc" })).toBe("the last, keeping its molecule's path, species and pc");
    expect(kindInfo("take-frames").how!({ which: "last", either: 1, keep: "" })).toBe("the last");
  });

  it("refuses the highest where a frame has no energy, naming the molecule - never the highest of those that have one", () => {
    expect(takeFrames([path(), path([0, 5, null, 3, -2], "path b")], "highest")).toEqual({ ok: false, said: "Not every frame of path b has an energy: the highest cannot be told" });
    expect(takeFrames([path([0, 5, null, 3, -2])], "around", 1)).toMatchObject({ ok: false });
    // (the first, the last, the entry frame need none)
    expect(frames(ok(takeFrames([path([0, 5, null, 3, -2])], "first")))).toEqual([0]);
    // (fewer energies than frames: not every frame has one)
    const short = { ...path(), energies: path().energies!.slice(0, 3) };
    expect(takeFrames([short], "highest")).toEqual({ ok: false, said: "Not every frame of path a has an energy: the highest cannot be told" });
    expect(takeFrames([path()], "around", 0)).toEqual({ ok: false, said: "Either side must be a whole number of frames, 1 or more" });
    expect(takeFrames([path()], "around", 1.5)).toEqual({ ok: false, said: "Either side must be a whole number of frames, 1 or more" });
  });

  it("takes the first of frames equally high - and says which were, never choosing silently", () => {
    const o = ok(takeFrames([path([0, 5, 2, 5, 1])], "highest"));
    expect(frames(o)).toEqual([1]);
    expect(o.said).toBe("1 frame of 1 molecule: the highest in energy · frames 2 and 4 of path a are equally high: the first is taken");
    // (around the first of them; each molecule with a tie named)
    const two = ok(takeFrames([path([5, 0, 5, 0, 5]), path(undefined, "path b")], "around", 1));
    expect(frames(two)).toEqual([0, 1, 1, 2, 3]);
    expect(two.said).toBe("5 frames of 2 molecules: the highest in energy and 1 frame either side · frames 1, 3 and 5 of path a are equally high: the first is taken");
    // (the first, the last, the entry frame are not chosen by energy: no word of it)
    expect(ok(takeFrames([path([0, 5, 2, 5, 1])], "first")).said).toBe("1 frame of 1 molecule: the first");
  });

  it("runs on a set wired into it, on the page", () => {
    let doc = addMolecule3d(emptyWorkspaceDocument(), path());
    const set = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    const step = doc.nextWorkflowId!;
    doc = connect(addStep(doc, "take-frames", 20, 0, { which: "around" }), { set }, step);
    const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
    const ran = runStep(doc, step, W).steps!.find((s) => s.id === step)!.ran;
    expect([ran?.ok, ran?.said]).toEqual([true, "3 frames of 1 molecule: the highest in energy and 1 frame either side"]);
    expect(kindInfo("take-frames").how?.({ which: "last" })).toBe("the last");
  });

  it("keeps on the page what its card names from each frame's molecule, and nothing else of it", () => {
    const tagged = { value: "path-1", unit: "none", status: "computed" } as const;
    const g = { value: -76.38, unit: "Eh", status: "computed" } as const;
    // (a path, its last frame its entry, holding a tag and a free energy)
    let doc = addMolecule3d(emptyWorkspaceDocument(), { ...path(), properties: [{}, {}, {}, {}, { path: tagged, "thermo.free-energy": g }] });
    const set = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    const step = doc.nextWorkflowId!;
    doc = connect(addStep(doc, "take-frames", 20, 0, { which: "first", keep: "path" }), { set }, step);
    const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
    const after = runStep(doc, step, W);
    expect(after.steps!.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "1 frame of 1 molecule: the first, keeping its molecule's path" });
    const made = after.molecules3d![after.molecules3d!.length - 1];
    expect(made.properties).toEqual([{ path: tagged }]);
  });
});
