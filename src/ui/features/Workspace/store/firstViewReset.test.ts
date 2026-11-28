/**
 * A molecule a step gave: first seen, and given back by *Reset turn*, by one rule (utils/firstTurn) - one tied to a drawing as
 * its drawing lies, any other along its principal axes in the frame it is first shown at.
 */
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import { firstSeen } from "../workflow/run";
import { principalTurn } from "../utils/align3d";
import { firstFrame, firstTurn } from "../utils/firstTurn";
import type { Molecule3D, Turn3D } from "./types";

// Invented geometries: a bent three-atom molecule, on one line at the start of a path and bent at its end, in the x-z plane.
const ANGLE = (104.5 * Math.PI) / 180;
const onLine = [0, 0, 0, 0.96, 0, 0, -0.96, 0, 0];
const bent = [0, 0, 0, 0.96, 0, 0, 0.96 * Math.cos(ANGLE), 0, 0.96 * Math.sin(ANGLE)];
const tilted = [0, 0, 0, 0, 0.96, 0, 0, 0.96 * Math.cos(ANGLE), 0.96 * Math.sin(ANGLE)];
const atomsOf = (xyz: number[]) => [0, 1, 2].map((i) => ({ el: i ? "H" : "O", x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] }));
const bonds = [
  { a1: 0, a2: 1, order: 1 },
  { a1: 0, a2: 2, order: 1 },
];

/** A page holding `m`, turned as a run first turns it (`firstSeen`), as stepRuns does. */
function landed(m: Omit<Molecule3D, "id" | "at">) {
  const doc = createWorkspaceDocument();
  doc.edit("add", (d) => addMolecule3d(d, { ...m, at: { x: 0, y: 0 } } as never));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const id = st().molecules3d[0].id;
  const first = firstSeen(st().molecules3d[0]);
  if (first) st().setTurn3d(id, first);
  return { st, id, first };
}

const byHand: Turn3D = [0, Math.sin(0.4), 0, Math.cos(0.4)];

describe("a step's molecule, first seen and reset by one rule", () => {
  it("is an optimisation's path seen at its end, and Reset turn gives that view back - pressed fresh, it changes nothing", () => {
    const { st, id, first } = landed({ atoms: atomsOf(onLine), bonds, frames: [tilted, bent], path: true } as never);
    expect(first).toEqual(principalTurn(bent));
    st().resetTurn3d(id);
    expect(st().turns3d[id]).toEqual(first);
    st().setTurn3d(id, byHand);
    st().resetTurn3d(id);
    expect(st().turns3d[id]).toEqual(first);
  });

  it("is a conformer set's one turn, from its first frame - the lowest - and Reset turn gives the set's first view back", () => {
    const { st, id, first } = landed({ atoms: atomsOf(bent), bonds, frames: [tilted, onLine], energies: [0, 1, 2] } as never);
    expect(first).toEqual(principalTurn(bent));
    // (another conformer shown: the set's one turn, no jump)
    st().setFrame3d(id, 2);
    expect(st().turns3d[id]).toEqual(first);
    st().setTurn3d(id, byHand);
    st().resetTurn3d(id);
    expect(st().turns3d[id]).toEqual(first);
  });

  it("is one of a single entry among its frames seen at that entry, and reset to it", () => {
    const { st, id, first } = landed({ atoms: atomsOf(onLine), bonds, frames: [bent], entryFrames: [1] } as never);
    expect(first).toEqual(principalTurn(bent));
    st().setTurn3d(id, byHand);
    st().resetTurn3d(id);
    expect(st().turns3d[id]).toEqual(first);
  });

  it("leaves one tied to a drawing as its drawing lies: not turned first, and reset to no turn", () => {
    const { st, id, first } = landed({ atoms: atomsOf(bent), bonds, drawnFrom: [1, 2, 3] } as never);
    expect(first).toBeUndefined();
    expect(st().turns3d[id]).toBeUndefined();
    st().setTurn3d(id, byHand);
    st().resetTurn3d(id);
    expect(st().turns3d[id]).toBeUndefined();
  });

  it("is first shown, each kind, at the one frame decided in one place - and first seen along it", () => {
    const frames = [tilted, bent];
    // (a calculation's output a file gives at its last geometry - an optimisation, a scan, a path along a reaction alike)
    expect(firstFrame({ frames, frame: 2 })).toBe(2);
    expect(firstTurn({ atoms: atomsOf(onLine), frames, frame: 2 } as never)).toEqual(principalTurn(bent));
    // (a step's optimisation path: at its end)
    expect(firstFrame({ frames, path: true })).toBe(2);
    // (a single entry among its frames: at it)
    expect(firstFrame({ frames, entryFrames: [1] })).toBe(1);
    // (a conformer set, a film of several geometries naming no frame, a single geometry: at the first)
    expect(firstFrame({ frames })).toBe(0);
    expect(firstFrame({ frames, entryFrames: [0, 1, 2] })).toBe(0);
    expect(firstFrame({})).toBe(0);
  });
});
