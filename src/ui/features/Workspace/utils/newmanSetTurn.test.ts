import { afterEach, describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { ECLIPSED_OFFSET_DEG as OFF } from "../../../../lib/chem/perception/projection/solids";
import { createWorkspaceDocument } from "../document";
import { newmanDrawing, newmansIn } from "../projections/newman";
import { connectStoreToDocument, createEditorStore } from "../store";
import { centredAt } from "./copyPaste";
import { newmanTurnGesture } from "./newmanTurn";

// A Newman set turned by a drag (docs/EDITOR-2D.md, *The Newman projection*): the dragged atom's three groups turn together to the nearest of
// its six places; the other atom's groups lie at their own set's places - offset by the eclipsed offset (12 degrees, on the back atom) only where
// the two sets are the same, and on the very places where they are staggered. Angles in degrees, counter-clockwise from the page's right, y up.
// The answers, by hand: the front's places are 90, 210, 330 (set A) and 30, 150, 270 (set B); the back's the same, each 12 more where the
// front holds that set. Front 90/210 and back 270/30 (A and B, staggered): the 210 group dropped at 347 rests at 330 (17 off, against 43 to 30),
// the front turned rigidly by 120 - 210/330 - still A, so the back stays B, staggered, at 270/30 exactly; the 90 group dropped at 347 rests at 330
// too, the front turned by -120 - 330/90. Dropped at 270 (B): the front turned by 60 -
// 150/270 - the back's set now the front's, so it lies at 282/42. A back group at 270 dropped at 330, the front on A: the back's nearest place
// is A's 330 + 12 = 342 (12 off, against 60 to 270 or 30), the back turned by 72 - 342/102, eclipsed - and the front, whose set is unchanged, untouched.

type Listener = (e: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
const fire = (type: string, e: object) => {
  for (const f of [...(listeners.get(type) ?? [])]) f(e);
};
const was = (globalThis as { window?: unknown }).window;
afterEach(() => {
  listeners.clear();
  (globalThis as { window?: unknown }).window = was;
});

const same = (p: number, q: number) => Math.abs((((p - q) % 360) + 540) % 360 - 180) < 1e-6;

/** The tool's Newman pair put down, two groups on each atom by the double-click's own calls: front 90, 210; back 270, 30. */
function drawing() {
  (globalThis as { window?: unknown }).window = {
    addEventListener: (t: string, f: Listener) => void (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f),
    removeEventListener: (t: string, f: Listener) => void listeners.get(t)?.delete(f),
  };
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  st().pasteModel(centredAt(newmanDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 }), { x: 0, y: 0 }));
  const pair = newmansIn(st().model)[0];
  const c = pair.at;
  const out = (id: number) => {
    const got = st().bondOut(id, c);
    expect(got).not.toBeNull();
    return got!;
  };
  const front = [out(pair.front), out(pair.front)];
  const back = [out(pair.back), out(pair.back)];
  const angle = (id: number) => {
    const a = st().model.atoms.find((x) => x.id === id)!;
    return (Math.atan2(a.y - c.y, a.x - c.x) * 180) / Math.PI;
  };
  const at = (ids: number[], want: number[]) => {
    expect(ids.map((id, i) => same(angle(id), want[i]))).toEqual(want.map(() => true));
  };
  at(front, [90, 210]);
  at(back, [270, 30]);
  /** A group pressed and dragged round the circle through the pointer angles `path`, let go at the last; what each frame shows is checked against `rest`. */
  const drag = (group: number, path: number[], check?: () => void) => {
    newmanTurnGesture(store, (x, y) => ({ x, y }), group, () => undefined);
    const p = (deg: number) => ({ clientX: c.x + L * Math.cos((deg * Math.PI) / 180), clientY: c.y + L * Math.sin((deg * Math.PI) / 180) });
    for (const deg of path) {
      fire("pointermove", p(deg));
      check?.();
    }
    fire("pointerup", p(path[path.length - 1]));
  };
  return { doc, st, front, back, at, drag };
}

describe("a Newman set turned by a drag", () => {
  it("front 90/210, the 210 group taken straight to 347: the front at 210/330, the back exactly at 270/30", () => {
    const { front, back, at, drag } = drawing();
    drag(front[1], [347]);
    at(front, [210, 330]);
    at(back, [270, 30]);
  });

  it("front 90/210, the 90 group taken round to 347: the front at 330/90, the back exactly at 270/30", () => {
    const { front, back, at, drag } = drawing();
    drag(front[0], [60, 30, 0, 347]);
    at(front, [330, 90]);
    at(back, [270, 30]);
  });

  it("the same, the pointer going round by 240, 270, 300, 330, 347: the same end, whatever the path", () => {
    const { front, back, at, drag } = drawing();
    drag(front[1], [240, 270, 300, 330, 347]);
    at(front, [210, 330]);
    at(back, [270, 30]);
  });

  it("shows in each frame of the drag what it would rest at there: at 260 the back offset, at 310 and 347 on its own places", () => {
    const { front, back, at, drag } = drawing();
    // (260: nearest place 270, B - 10 off, against 50 to 210 - the front turned by 60; 310: 330, A - 20 off, against 40 to 270)
    const want = [
      { front: [150, 270], back: [270 + OFF, 30 + OFF] },
      { front: [210, 330], back: [270, 30] },
      { front: [210, 330], back: [270, 30] },
    ];
    let k = 0;
    drag(front[1], [260, 310, 347], () => {
      at(front, want[k].front);
      at(back, want[k].back);
      k++;
    });
    expect(k).toBe(3);
    at(front, [210, 330]);
    at(back, [270, 30]);
  });

  it("dropped at 270 the front's set is the back's: the back offset to 282/42; on to 330, the back exactly at 270/30 again", () => {
    const { front, back, at, drag } = drawing();
    drag(front[1], [240, 270]);
    at(front, [150, 270]);
    at(back, [270 + OFF, 30 + OFF]);
    drag(front[1], [300, 330]);
    at(front, [210, 330]);
    at(back, [270, 30]);
  });

  it("a back group at 270 dropped at 330, the front at 90/210: the back at 342/102, eclipsed; taken back to 270, at 270/30; the front never moved", () => {
    const { front, back, at, drag } = drawing();
    const frontStays = () => at(front, [90, 210]);
    drag(back[0], [300, 330], frontStays);
    at(back, [330 + OFF, 90 + OFF]);
    drag(back[0], [300, 270], frontStays);
    at(back, [270, 30]);
  });

  it("one undo after the turn gives the drawing as it was before the drag", () => {
    const { doc, st, drag, front } = drawing();
    const before = st().model.atoms.map((a) => [a.id, a.x, a.y]);
    drag(front[1], [240, 270, 300, 330, 347]);
    expect(st().model.atoms.map((a) => [a.id, a.x, a.y])).not.toEqual(before);
    doc.undo();
    const now = st().model.atoms.map((a) => [a.id, a.x, a.y] as [number, number, number]);
    expect(now.map((a) => a[0])).toEqual(before.map((a) => a[0]));
    now.forEach((a, i) => {
      expect(a[1]).toBeCloseTo(before[i][1] as number, 9);
      expect(a[2]).toBeCloseTo(before[i][2] as number, 9);
    });
  });
});
