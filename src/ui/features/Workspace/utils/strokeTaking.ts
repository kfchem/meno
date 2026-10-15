/**
 * A stroke as the pointer gives it (components/InkWriting): its points on
 * the page, smoothed as they come (lib/chem/ink `OneEuro`), with how hard
 * the pen pressed at each. Kept whole however the system interrupts it: a
 * pen's pressure read as naught while it still touches is taken as the
 * pressure before it; a stroke the system takes back (`pointercancel`) waits
 * a moment for the pen to come down again, near where it was, and goes on;
 * a move that tells of no points it gathered is taken as itself; and it
 * ends where the pen was lifted, not where the smoothing had come to.
 */
import { OneEuro } from "../../../../lib/chem/ink";

/** A pointer's event, as far as a stroke looks into it. */
export type PenEvent = {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  pressure: number;
  timeStamp: number;
  getCoalescedEvents?: () => PenEvent[];
};

type Pt = { x: number; y: number };

/** How long a stroke the system took back waits for the pen to come down again and go on with it, in ms. */
export const RESUME_MS = 250;
/** How near where it was the pen must come down again to go on with it, on the screen, in pixels. */
export const RESUME_PX = 24;

export class StrokeTaking {
  /** The stroke's points on the page: x, y and the pressure there, one after another. */
  readonly points: number[] = [];
  /** The pointer writing it now: the one that began it, or the one that went on with it. */
  pointerId: number;
  /** When the system took it back (`cancel`), if it did and nothing has gone on with it since. */
  cutAt: number | null = null;
  private readonly fx = new OneEuro();
  private readonly fy = new OneEuro();
  private pressure = 0.5;
  private last: Pt;

  constructor(
    down: PenEvent,
    private readonly toPage: (clientX: number, clientY: number) => Pt,
    readonly pen: boolean,
  ) {
    this.pointerId = down.pointerId;
    this.last = { x: down.clientX, y: down.clientY };
    this.take(down);
  }

  /** A move: each of the points it gathers taken. Whether it was this stroke's. */
  move(e: PenEvent): boolean {
    if (e.pointerId !== this.pointerId || this.cutAt != null) return false;
    // (the points the move gathers - and the move itself where it tells of none: an empty list is no move not made)
    const gathered = e.getCoalescedEvents?.();
    for (const c of gathered?.length ? gathered : [e]) this.take(c);
    return true;
  }

  /** The pen lifted: the stroke taken on to where it last was, the smoothing's lag made up. Whether it was this stroke's. */
  up(e: PenEvent): boolean {
    if (e.pointerId !== this.pointerId || this.cutAt != null) return false;
    const p = this.toPage(this.last.x, this.last.y);
    const n = this.points.length;
    if (p.x !== this.points[n - 3] || p.y !== this.points[n - 2]) this.points.push(p.x, p.y, this.pen ? this.pressure : 0.5);
    return true;
  }

  /** The system took the pointer back (a `pointercancel`): held, for the pen to go on with (`resumes`). Whether it was this stroke's. */
  cancel(e: PenEvent): boolean {
    if (e.pointerId !== this.pointerId || this.cutAt != null) return false;
    this.cutAt = e.timeStamp;
    return true;
  }

  /** Whether a press goes on with this stroke, taken back: the same kind of pointer, soon after and near where it was. If it does, taken on from it. */
  resumes(e: PenEvent): boolean {
    if (this.cutAt == null || (e.pointerType === "pen") !== this.pen) return false;
    if (e.timeStamp - this.cutAt > RESUME_MS || Math.hypot(e.clientX - this.last.x, e.clientY - this.last.y) > RESUME_PX) return false;
    this.cutAt = null;
    this.pointerId = e.pointerId;
    this.take(e);
    return true;
  }

  private take(e: PenEvent): void {
    const t = e.timeStamp / 1000;
    this.last = { x: e.clientX, y: e.clientY };
    // (naught while it touches is no pressure the pen felt - a sensor's dip, or an event that tells none - but the one before)
    if (this.pen && e.pressure > 0) this.pressure = e.pressure;
    const p = this.toPage(this.fx.next(e.clientX, t), this.fy.next(e.clientY, t));
    this.points.push(p.x, p.y, this.pen ? this.pressure : 0.5);
  }
}
