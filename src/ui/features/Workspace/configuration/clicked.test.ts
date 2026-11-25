import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Atom, Bond, Model } from "../store/types";
import { cipMarksOf } from "../chem/cipMarks";
import { watchConfiguration } from "./watch";

// A stated configuration as the chemist changes it by hand - its R or S, and the notes said of it (docs/EDITOR-2D.md, *When an edit
// changes a configuration*): through a click on a bond, which turns it while the press holds the view (a gesture), as on the page.
// Every descriptor here is derived by hand by the CIP rules (IUPAC 2013, P-92.1.4: CH2OH > C2H5 > CH3 > H), then asked of Meno.

const at = (id: number, x: number, y: number, el = "C", shown = false): Atom => ({ id, x, y, r: 0.9, el, ...(shown ? { stereoShown: true as const } : {}) });
const bond = (id: number, a: number, b: number, extra: Partial<Bond> = {}): Bond => ({ id, a, b, order: 1, ...extra });

/** A chain of 32 carbons, ids 1 to 32 (bonds 1001 on): a large molecule put on the page first, so that its atoms come first in the page's list. */
function chain(): Model {
  const atoms = Array.from({ length: 32 }, (_, i) => at(i + 1, -10 + i * 1.299, 8 + (i % 2 ? 0.75 : 0)));
  const bonds = atoms.slice(1).map((a, i) => bond(1001 + i, i + 1, a.id));
  return { atoms, bonds };
}

/**
 * (S)-2-methylbutan-1-ol, its methyl on a wedge narrow at C2, drawn as the y axis points up: O 101, C1 102, C2 103 (R or S asked for),
 * C3 104, C4 105, the methyl 106; the wedge is bond 205. Its atoms listed O first, so that a name by the place in the page's list could
 * not come out as C2 by chance.
 */
function methylbutanol(): Model {
  return {
    atoms: [at(101, 2.598, 0, "O"), at(102, 1.299, 0.75), at(103, 0, 0, "C", true), at(104, -1.299, 0.75), at(105, -2.598, 0), at(106, 0, -1.5)],
    bonds: [bond(201, 101, 102), bond(202, 102, 103), bond(203, 103, 104), bond(204, 104, 105), bond(205, 103, 106, { stereo: "up", narrow: 103 })],
  };
}

function page(...parts: Model[]) {
  const model: Model = { atoms: parts.flatMap((p) => p.atoms), bonds: parts.flatMap((p) => p.bonds) };
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model, nextId: 5000 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const stop = watchConfiguration(store, doc);
  // (drawn by hand, as on the page: its last edit - here a nudge of every atom - has kept what it states on its atoms, as every edit does)
  doc.edit("move atoms", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => ({ ...a, x: a.x + 0.001 })) } }));
  /** The notes said since the last look, and let go. */
  const said = async () => {
    await vi.runAllTimersAsync();
    const out = store.getState().configurationNotes.map((n) => n.text);
    store.setState({ configurationNotes: [] });
    return out;
  };
  /** A click on a bond, as the page makes it: the press holds the view, the click's turn is made, the hold is let go - one task. */
  const click = async (id: number) => {
    store.getState().beginPanHold(1);
    store.getState().bondClicked(id, 1);
    store.getState().endPanHold(1);
    return said();
  };
  /** The R or S the page shows at an atom: Meno's CIP on the drawing as it is, what it keeps included (chem/identityOf). */
  const keeps = (id: number) => doc.getState().model.atoms.find((a) => a.id === id)?.config != null;
  const label = (id: number) => cipMarksOf(doc.getState().model).centres.get(id) ?? null;
  const kind = (id: number) => {
    const b = doc.getState().model.bonds.find((x) => x.id === id)!;
    return `${b.stereo ?? "none"}@${b.narrow ?? "-"}`;
  };
  return { doc, store, stop, said, click, label, kind, keeps };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a wedge clicked through its round: the label and the notes follow the drawing (G1-G5)", () => {
  it("states S, R, nothing, nothing, R, nothing, S - each at once, and no note: each change is the chemist's own turn of the wedge", async () => {
    const p = page(chain(), methylbutanol());
    expect(await p.said()).toEqual([]);
    expect([p.keeps(103), p.label(103)]).toEqual([true, "S"]);
    // (hashed, narrow at C2: H toward the viewer, the sense seen reversed - R; the label shows it, no note)
    expect(await p.click(205)).toEqual([]);
    expect([p.kind(205), p.label(103)]).toEqual(["down@103", "R"]);
    // (plain: nothing stated - the label goes, no note: the chemist made it plain)
    expect(await p.click(205)).toEqual([]);
    expect([p.kind(205), p.label(103)]).toEqual(["none@106", null]);
    // (a wedge narrow at the methyl states nothing of C2: nothing said - nothing stated was there to change)
    expect(await p.click(205)).toEqual([]);
    expect([p.kind(205), p.label(103)]).toEqual(["up@106", null]);
    // (a hashed wedge narrow at the methyl is read as stating C2, as the reader reads it (docs/EDITOR-2D.md): new, nothing said)
    expect(await p.click(205)).toEqual([]);
    expect([p.kind(205), p.label(103)]).toEqual(["down@106", "R"]);
    expect(await p.click(205)).toEqual([]);
    expect([p.kind(205), p.label(103)]).toEqual(["none@103", null]);
    expect(await p.click(205)).toEqual([]);
    expect([p.kind(205), p.label(103)]).toEqual(["up@103", "S"]);
    p.stop();
  });

  it("says nothing more of a configuration once said: an edit that changes nothing stated says nothing (report: notes where nothing changed)", async () => {
    const p = page(methylbutanol());
    await p.click(205);
    expect(await p.click(205)).toEqual([]);
    expect(await p.click(205)).toEqual([]);
    // (the ethyl's CH3 deleted - C2 no longer a centre at all: nothing said)
    p.doc.edit("delete", (d) => ({ ...d, model: { ...d.model, bonds: d.model.bonds.filter((b) => b.id !== 204) } }));
    expect(await p.said()).toEqual([]);
    p.stop();
  });

  it("gives bond and label back together on undo and redo (G13)", async () => {
    const p = page(methylbutanol());
    await p.click(205);
    await p.click(205);
    p.doc.undo();
    expect([p.kind(205), p.label(103)]).toEqual(["down@103", "R"]);
    p.doc.undo();
    expect([p.kind(205), p.label(103)]).toEqual(["up@103", "S"]);
    p.doc.redo();
    expect([p.kind(205), p.label(103)]).toEqual(["down@103", "R"]);
    p.doc.redo();
    expect([p.kind(205), p.label(103)]).toEqual(["none@106", null]);
    expect(await p.said()).toEqual([]);
    p.stop();
  });
});

describe("no note where no stated configuration changes (G7, G8)", () => {
  const edits: [string, (m: Model) => Model][] = [
    ["a methyl added", (m) => ({ atoms: [...m.atoms, at(107, -1.299, 2.25)], bonds: [...m.bonds, bond(206, 104, 107)] })],
    ["an element changed", (m) => ({ ...m, atoms: m.atoms.map((a) => (a.id === 101 ? { ...a, el: "N" } : a)) })],
    ["an atom moved", (m) => ({ ...m, atoms: m.atoms.map((a) => (a.id === 105 ? { ...a, x: a.x - 0.4, y: a.y + 0.3 } : a)) })],
    ["a bond deleted", (m) => ({ atoms: m.atoms.filter((a) => a.id !== 105), bonds: m.bonds.filter((b) => b.id !== 204) })],
  ];
  for (const [what, edit] of edits) {
    it(`says nothing on a molecule that states nothing: ${what}`, async () => {
      const plain = methylbutanol();
      plain.bonds = plain.bonds.map((b) => (b.id === 205 ? bond(205, 103, 106) : b));
      const p = page(plain);
      p.doc.edit(what, (d) => ({ ...d, model: { ...d.model, ...edit(d.model) } }));
      expect(await p.said()).toEqual([]);
      p.stop();
    });
  }
  it("says nothing on an edit far from the one stated centre, its label as it was", async () => {
    const p = page(methylbutanol());
    for (const [what, edit] of edits.slice(0, 3)) {
      p.doc.edit(what, (d) => ({ ...d, model: { ...d.model, ...edit(d.model) } }));
      expect(await p.said()).toEqual([]);
      expect(p.label(103)).toBe("S");
    }
    p.stop();
  });
});

describe("known answers after a wedge clicked (G9, G10)", () => {
  /** (2R,3R)-2,3-dihydroxybutanedioic acid, both OH on wedges: C2 1, C3 2; the wedges 31 (at C2) and 32 (at C3). */
  function tartaric(): Model {
    return {
      atoms: [at(1, 0, 0, "C", true), at(2, 1.299, 0.75, "C", true), at(3, -1.299, 0.75), at(4, -1.299, 2.25, "O"), at(5, -2.598, 0, "O"), at(6, 2.598, 0), at(7, 2.598, -1.5, "O"), at(8, 3.897, 0.75, "O"), at(9, 0, -1.5, "O"), at(10, 1.299, 2.25, "O")],
      bonds: [bond(21, 1, 2), bond(22, 1, 3), bond(23, 3, 4, { order: 2 }), bond(24, 3, 5), bond(25, 2, 6), bond(26, 6, 7, { order: 2 }), bond(27, 6, 8), bond(31, 1, 9, { stereo: "up", narrow: 1 }), bond(32, 2, 10, { stereo: "up", narrow: 2 })],
    };
  }
  it("tartaric acid: (2R,3R) drawn; one wedge clicked to hashed gives the meso form, (2S,3R), and no note", async () => {
    const p = page(tartaric());
    expect([p.label(1), p.label(2)]).toEqual(["R", "R"]);
    expect(await p.click(31)).toEqual([]);
    expect([p.label(1), p.label(2)]).toEqual(["S", "R"]);
    p.stop();
  });

  /** 1,2-dimethylcyclohexane, both methyls on wedges (cis): ring C1 1 (top), C2 2; methyls 7 (at C1), 8 (at C2) on bonds 17, 18. */
  function dimethylcyclohexane(): Model {
    const ring = Array.from({ length: 6 }, (_, k) => at(k + 1, 1.5 * Math.cos(((90 - 60 * k) * Math.PI) / 180), 1.5 * Math.sin(((90 - 60 * k) * Math.PI) / 180), "C", k < 2));
    return {
      atoms: [...ring, at(7, 0, 3), at(8, 2.598, 1.5)],
      bonds: [...ring.map((a, k) => bond(11 + k, a.id, ring[(k + 1) % 6].id)), bond(17, 1, 7, { stereo: "up", narrow: 1 }), bond(18, 2, 8, { stereo: "up", narrow: 2 })],
    };
  }
  it("1,2-dimethylcyclohexane: cis (1R,2S); one wedge clicked to hashed gives trans, (1S,2S), and no note", async () => {
    const p = page(dimethylcyclohexane());
    expect([p.label(1), p.label(2)]).toEqual(["R", "S"]);
    expect(await p.click(17)).toEqual([]);
    expect([p.label(1), p.label(2)]).toEqual(["S", "S"]);
    p.stop();
  });
});

describe("atoms named by their own molecule's numbering (G6)", () => {
  it("names C2 of 2-methylbutan-1-ol C2 with a 32-atom molecule before it on the page, and by its map number where a map shows one", async () => {
    // (the chain C1-C4 mirrored left to right about C2, the wedge left as it is: C2 inverted by atoms moved, not by a turn of its wedge
    //  by hand - said. A click on the wedge, the chemist's own turn of it, says nothing and names nothing)
    const across = (q: ReturnType<typeof page>) =>
      q.doc.edit("move atoms", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => ([101, 102, 104, 105].includes(a.id) ? { ...a, x: -a.x } : a)) } }));
    const p = page(chain(), methylbutanol());
    across(p);
    expect(await p.said()).toEqual(["C2: S, now R"]);
    p.stop();
    const mapped = methylbutanol();
    mapped.atoms = mapped.atoms.map((a, i) => ({ ...a, map: 11 + i }));
    const q = page(chain(), mapped);
    across(q);
    expect(await q.said()).toEqual(["C13: S, now R"]);
    q.stop();
  });
});
