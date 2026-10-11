import { describe, expect, it } from "vitest";
import { workerQueue } from "./queue";

describe("a worker's queue", () => {
  it("has the worker started afresh only when the question it was on is not answered in time", () => {
    let held = 0;
    const q = workerQueue(() => held++);
    q.sent(1);
    q.sent(2);
    q.sent(3);
    // (asked after one still in its time - a model loading for the first picture, say: it waits, and stops nothing)
    q.overdue(2);
    expect(held).toBe(0);
    q.settled(1);
    // (the one it is on now, after the first was answered: held)
    q.overdue(3);
    expect(held).toBe(1);
  });

  it("forgets what was answered or let go of", () => {
    let held = 0;
    const q = workerQueue(() => held++);
    q.sent(1);
    q.settled(1);
    q.sent(2);
    q.overdue(2);
    expect(held).toBe(1);
  });
});
