import { describe, expect, it } from "vitest";
import { RESUME_MS, RESUME_PX, StrokeTaking, type PenEvent } from "./strokeTaking";

const onScreen = (x: number, y: number) => ({ x, y });
const pen = (pointerId: number, clientX: number, timeStamp: number, pressure = 0.5, more: Partial<PenEvent> = {}): PenEvent => ({
  pointerId,
  pointerType: "pen",
  clientX,
  clientY: 100,
  pressure,
  timeStamp,
  ...more,
});
const xs = (t: StrokeTaking) => t.points.filter((_, i) => i % 3 === 0);
const pressures = (t: StrokeTaking) => t.points.filter((_, i) => i % 3 === 2);

describe("a pen's stroke", () => {
  it("goes on through pressure read as naught, a cancel and the pen down again, and ends where the pen was lifted", () => {
    const taking = new StrokeTaking(pen(1, 0, 0, 0.6), onScreen, true);
    // (across, a point each 8 ms; the pressure dipping to naught now and then, as some pens and drivers tell it)
    for (let k = 1; k <= 10; k++) expect(taking.move(pen(1, 5 * k, 8 * k, k % 3 === 0 ? 0 : 0.6))).toBe(true);
    // the system takes the pointer back (a gesture of its own), and the pen comes down again at once, near, as another pointer
    expect(taking.cancel(pen(1, 50, 84))).toBe(true);
    expect(taking.move(pen(1, 55, 90))).toBe(false);
    expect(taking.resumes(pen(2, 52, 84 + RESUME_MS / 2, 0.7))).toBe(true);
    for (let k = 1; k <= 10; k++) expect(taking.move(pen(2, 52 + 5 * k, 200 + 8 * k, 0.7, { getCoalescedEvents: () => [pen(2, 50 + 5 * k, 196 + 8 * k, 0), pen(2, 52 + 5 * k, 200 + 8 * k, 0.7)] }))).toBe(true);
    // (a move that tells of no points it gathered: itself)
    expect(taking.move(pen(2, 106, 284, 0.7, { getCoalescedEvents: () => [] }))).toBe(true);
    expect(taking.up(pen(1, 106, 290))).toBe(false);
    expect(taking.up(pen(2, 106, 290))).toBe(true);

    const x = xs(taking);
    expect(x[0]).toBe(0);
    // (on to where the pen was lifted, not short of it by the smoothing's lag)
    expect(x[x.length - 1]).toBe(106);
    expect(x.every((v, i) => i === 0 || v >= x[i - 1])).toBe(true);
    expect(Math.max(...x.slice(0, 11))).toBeGreaterThan(40);
    expect(pressures(taking).every((p) => p > 0)).toBe(true);
    expect(pressures(taking)[pressures(taking).length - 1]).toBe(0.7);
  });

  it("is not gone on with by a press too late, too far, or of another kind: it waits for none", () => {
    const cut = () => {
      const t = new StrokeTaking(pen(1, 0, 0), onScreen, true);
      t.move(pen(1, 40, 50));
      t.cancel(pen(1, 40, 60));
      return t;
    };
    expect(cut().resumes(pen(2, 40, 60 + RESUME_MS + 1))).toBe(false);
    expect(cut().resumes(pen(2, 40 + RESUME_PX + 1, 70))).toBe(false);
    expect(cut().resumes({ ...pen(2, 40, 70), pointerType: "mouse" })).toBe(false);
    // (nor one never taken back)
    const going = new StrokeTaking(pen(1, 0, 0), onScreen, true);
    expect(going.resumes(pen(2, 0, 10))).toBe(false);
  });

  it("written with the mouse, is even, and ends where the button came up", () => {
    const taking = new StrokeTaking({ ...pen(1, 0, 0, 0.5), pointerType: "mouse" }, onScreen, false);
    for (let k = 1; k <= 20; k++) taking.move({ ...pen(1, 15 * k, 8 * k, 0), pointerType: "mouse" });
    taking.up({ ...pen(1, 300, 170, 0), pointerType: "mouse" });
    expect(pressures(taking).every((p) => p === 0.5)).toBe(true);
    expect(xs(taking)[xs(taking).length - 1]).toBe(300);
  });
});
