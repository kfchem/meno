import * as THREE from "three";
import type { EditorStore } from "../store";
import type { Turn3D } from "../store/types";

/**
 * *Turn once* (docs/WORKSPACE.md, *Turn once*): the one motion Meno's own
 * canvas makes of itself. A molecule in 3D turns once round about the
 * screen's up, through its centre, gathering speed and losing it again, and
 * comes to rest exactly as it was turned before; several turn together,
 * each about its own. It is the view's, as any turn of a molecule is: no
 * undo step, nothing unsaved. A press, or a turn the chemist gives one of
 * them, stops it gently and leaves it to them.
 */

/** How long a turn once round takes, in ms (2026-10-16: as a film's turn is proposed). */
export const TURN_ONCE_MS = 4000;
/** How long a turn stopped takes to come to rest, in ms. */
export const STOP_MS = 400;

/**
 * How far round a turn once has come, in radians, at `t` - the share of
 * its time gone, 0 to 1: from 0 to 2π along the quintic smootherstep
 * 6t⁵ - 15t⁴ + 10t³, so that it starts and stops with neither speed nor
 * acceleration - no jolt at either end.
 */
export function turnOnceAngle(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return 2 * Math.PI * u * u * u * (u * (6 * u - 15) + 10);
}

/** How fast a turn once goes at `t`: `turnOnceAngle`'s rate, in radians for the whole of its time. */
export function turnOnceRate(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return 2 * Math.PI * 30 * u * u * (1 - u) * (1 - u);
}

/**
 * How far a turn stopped goes on, at `u` - the share of `STOP_MS` gone -
 * for a speed of 1 over the whole of it: its speed falls from what it was
 * to nothing along 1 - smoothstep, neither jumping as it begins to slow
 * nor as it comes to rest; half as far as at that speed throughout.
 */
export function stoppingAngle(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x - x * x * x + (x * x * x * x) / 2;
}

/**
 * A molecule turning once: when it began, how it was turned then (none,
 * as its file has it), and what it last turned it to - another turn there
 * is the chemist's; stopped, when, how fast it was turning then (radians a
 * second) and how far it has gone on since.
 */
type Once = {
  start: number;
  from: Turn3D | undefined;
  written: Turn3D | undefined;
  stopping: { at: number; speed: number; gone: number } | null;
};

const going = new WeakMap<EditorStore, Map<number, Once>>();
const onesOf = (store: EditorStore) => {
  let ones = going.get(store);
  if (!ones) going.set(store, (ones = new Map()));
  return ones;
};

/** The molecules `ids` set turning once round, from where each is turned now, at `now` (ms, performance.now's). */
export function startTurnOnce(store: EditorStore, ids: number[], now = performance.now()): void {
  const st = store.getState();
  const ones = onesOf(store);
  for (const id of ids) {
    if (!st.molecules3d.some((m) => m.id === id)) continue;
    const from = st.turns3d[id];
    // (written afresh, as it is, so that the canvas draws again and the turn goes on frame by frame)
    const written: Turn3D = from ? [...from] : [0, 0, 0, 1];
    ones.set(id, { start: now, from, written, stopping: null });
    st.setTurn3d(id, written);
  }
}

/** Every molecule turning once stopped gently, at `now`: each slows to rest from the speed it had over `STOP_MS`, and is left to the chemist. */
export function stopTurnsOnce(store: EditorStore, now = performance.now()): void {
  for (const o of onesOf(store).values()) stop(o, now);
}

/** Every molecule turning once let go at once, where it is: what else turns them takes them over (the talk, turning them back as they were). */
export function dropTurnsOnce(store: EditorStore): void {
  onesOf(store).clear();
}

/** Whether any molecule is turning once, or still coming to rest. */
export function turningOnce(store: EditorStore): boolean {
  return onesOf(store).size > 0;
}

/** The turns `turns` with each molecule turning once as it was turned before it began - where it comes back to. */
export function turnsBeforeOnce(store: EditorStore, turns: Record<number, Turn3D>): Record<number, Turn3D> {
  const ones = onesOf(store);
  if (!ones.size) return turns;
  const out = { ...turns };
  for (const [id, o] of ones) {
    if (o.stopping != null) continue;
    if (o.from) out[id] = o.from;
    else delete out[id];
  }
  return out;
}

function stop(o: Once, now: number) {
  if (o.stopping != null) return;
  o.stopping = { at: now, speed: turnOnceRate((now - o.start) / TURN_ONCE_MS) / (TURN_ONCE_MS / 1000), gone: 0 };
}

/**
 * Each molecule turning once turned on to `now` (ms), about `up` - the
 * screen's up, on the page: stopped where another turn was given it since;
 * back exactly as it was turned before, once round; one stopped slowing to
 * rest.
 */
export function stepTurnsOnce(store: EditorStore, now: number, up: THREE.Vector3): void {
  const ones = onesOf(store);
  if (!ones.size) return;
  const st = store.getState();
  const turn = new THREE.Quaternion();
  for (const [id, o] of ones) {
    if (!st.molecules3d.some((m) => m.id === id)) {
      ones.delete(id);
      continue;
    }
    const now3d = st.turns3d[id];
    // (turned by the chemist meanwhile - a drag, an undo, *Reset orientation*: it stops, and is theirs)
    if (now3d !== o.written) stop(o, now);
    let q: THREE.Quaternion;
    if (o.stopping == null) {
      const t = (now - o.start) / TURN_ONCE_MS;
      if (t >= 1) {
        ones.delete(id);
        if (o.from) st.setTurn3d(id, o.from);
        else st.resetTurn3d(id);
        continue;
      }
      q = new THREE.Quaternion().setFromAxisAngle(up, turnOnceAngle(t)).multiply(o.from ? turn.set(...o.from) : turn.identity());
    } else {
      // (on from wherever it is now - the chemist's turn, where they gave one - by as far as the slowing goes this frame)
      const s = o.stopping;
      const u = (now - s.at) / STOP_MS;
      const gone = s.speed * (STOP_MS / 1000) * stoppingAngle(u);
      q = now3d ? new THREE.Quaternion(...now3d) : new THREE.Quaternion();
      q.premultiply(turn.setFromAxisAngle(up, gone - s.gone));
      s.gone = gone;
      if (u >= 1) ones.delete(id);
    }
    q.normalize();
    const next: Turn3D = [q.x, q.y, q.z, q.w];
    o.written = next;
    st.setTurn3d(id, next);
  }
}
