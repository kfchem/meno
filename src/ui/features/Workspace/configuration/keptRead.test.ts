import { afterEach, describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { identity } from "../../../../lib/chem/identity";
import { identityOfDrawn } from "../chem/identityOf";
import { cleanUp } from "../chem/cleanUp";
import { forFlatReaders } from "../chem/drawing";
import { layoutJob } from "../chem/engineLayout";
import { createWorkspaceDocument } from "../document";
import { chairDrawing, seenPlaces } from "../projections/chair";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { readingOf } from "./changes";
import { keptFrom, marksOnly, withKept } from "./kept";
import { watchConfiguration } from "./watch";

// The readers of a drawing's configuration take what it keeps (docs/EDITOR-2D.md, *The configuration kept*): identity, Clean-up's
// layout and the writers for flat readers (3D, the files) - shown on drawings whose kept configuration differs from their marks on
// purpose, where reading the marks would give the other answer; and what a chemist's own change states kept at once, so that a reader
// asked straight after it never takes the configuration from before it.

afterEach(() => vi.useRealTimers());

/** Butan-2-ol drawn flat, its C-O bond (12) a wedge `stereo` narrow at C2 (id 1): "up" is (R). */
function butanol(stereo: "up" | "down" = "up"): Model {
  const p = (deg: number, r = L) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const at = (id: number, q: { x: number; y: number }, el = "C") => ({ id, ...q, r: 0.9, el });
  const c3 = p(330);
  return {
    atoms: [at(1, p(0, 0)), at(2, p(210)), at(3, c3), at(4, p(90), "O"), at(5, { x: c3.x + L * Math.cos(Math.PI / 6), y: c3.y + L * Math.sin(Math.PI / 6) })],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 1, b: 3, order: 1 },
      { id: 12, a: 1, b: 4, order: 1, stereo, narrow: 1 },
      { id: 13, a: 3, b: 5, order: 1 },
    ],
  };
}

/** `m` keeping what `as` states - the same atoms - whatever its own marks say. */
function keeping(m: Model, as: Model): Model {
  return withKept(m, new Set(m.atoms.map((a) => a.id)), keptFrom(as, readingOf(as)));
}

describe("the readers of a drawing's configuration take what it keeps", () => {
  // ((R)-butan-2-ol's marks, keeping (S): read from what is kept, (S); from the marks, (R))
  const r = butanol("up");
  const s = butanol("down");
  const rKeepingS = keeping(r, s);

  it("identity and R and S: the configuration kept, not the marks'", () => {
    expect(identityOfDrawn(rKeepingS).text).toBe(identityOfDrawn(s).text);
    expect(identityOfDrawn(marksOnly(rKeepingS)).text).toBe(identityOfDrawn(r).text);
    expect(identityOfDrawn(s).text).not.toBe(identityOfDrawn(r).text);
  });

  it("Clean-up's layout: the configuration it is given to lay out is the one kept", () => {
    expect(identity(layoutJob(rKeepingS).input).text).toBe(identity(layoutJob(s).input).text);
    expect(identity(layoutJob(marksOnly(rKeepingS)).input).text).toBe(identity(layoutJob(r).input).text);
  });

  it("3D and the files: a perspective drawing's centres written as wedges from what it keeps", () => {
    // (a chair from the tool with an axial OH on atom 0 and an equatorial methyl on atom 1: two centres, stated by the depth)
    const d = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });
    const atoms = [...d.atoms];
    const bonds = [...d.bonds];
    ([[0, "axial", "O"], [1, "equatorial", "C"]] as const).forEach(([k, kind, el], i) => {
      const place = seenPlaces(d, k).find((p) => p.free.kind === kind)!;
      atoms.push({ id: 50 + i, el, r: 0.9, x: place.place.x, y: place.place.y });
      bonds.push({ id: 200 + i, a: d.ring[k], b: 50 + i, order: 1 });
    });
    const chair: Model = { atoms, bonds };
    // (the same chair keeping its mirror image's configuration: the picture mirrored left to right, its atoms the same)
    const mirror: Model = { ...chair, atoms: chair.atoms.map((a) => ({ ...a, x: -a.x })) };
    const chairKeepingMirror = keeping(chair, mirror);
    // (as a reader that knows only wedges takes it - a MOL file: the wedges written, the drawing's depth not read)
    const written = (m: Model) => {
      const w = forFlatReaders(m) as Model;
      return identityOfDrawn(marksOnly({ ...w, atoms: w.atoms.map(({ z: _z, ...a }) => a) })).text;
    };
    expect(written(chairKeepingMirror)).toBe(identityOfDrawn(chairKeepingMirror).text);
    expect(written(chairKeepingMirror)).not.toBe(written(marksOnly(chairKeepingMirror)));
  });
});

describe("what a chemist's own change states, kept at once", () => {
  it("is read by identity and laid out by Clean-up straight after the change, before the page is idle: a wedge turned by hand", async () => {
    vi.useFakeTimers();
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model: butanol("up"), nextId: 100 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const stop = watchConfiguration(store, doc);
    // (kept first: a change the watch has had its look at)
    store.getState().moveAtoms([{ id: 5, x: 2.6 * L, y: 0 }], "drag-1");
    await vi.runAllTimersAsync();
    expect(identityOfDrawn(doc.getState().model).text).toBe(identityOfDrawn(butanol("up")).text);
    // (the wedge turned to a hash by hand - no timer let run: the page has not been idle since)
    doc.edit("change bond", (d) => ({ ...d, model: { ...d.model, bonds: d.model.bonds.map((b) => (b.id === 12 ? { ...b, stereo: "down" as const } : b)) } }));
    const now = doc.getState().model;
    expect(identityOfDrawn(now).text).toBe(identityOfDrawn(butanol("down")).text);
    expect(identityOfDrawn(now).text).toBe(identityOfDrawn(marksOnly(now)).text);
    expect(identity(layoutJob(now).input).text).toBe(identity(layoutJob(butanol("down")).input).text);
    // (and Clean-up, at once, lays it out - it does not refuse it as a structure whose kept configuration its marks no longer say)
    vi.useRealTimers();
    await cleanUp(store);
    expect(identityOfDrawn(marksOnly(store.getState().model)).text).toBe(identityOfDrawn(butanol("down")).text);
    stop();
  });
});
