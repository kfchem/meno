import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cornerRight } from "../pageCorner";
import NetworkToasts, { CornerBox } from "./NetworkToasts";
import { taskLook } from "./taskLook";
import type { NetConnection, NetTask } from "../../lib/net/network";

// Vitest runs in Node: the notices' container is drawn to a string, and
// where it is placed read from its style. (Drawn so, a store is read as it
// was made: the container with a panel beside it is drawn from its own part.)

const right = (html: string) => /bottom-3[^"]*"[^>]*style="right:([\d.]+)px"/.exec(html)?.[1];

describe("the notices in the corner", () => {
  it("sit in the window's corner, as ever, with no panel at its right side", () => {
    expect(right(renderToString(<NetworkToasts onOpen={() => {}} />))).toBe("12");
    expect(right(renderToString(<CornerBox right={cornerRight(0)} />))).toBe("12");
  });

  it("sit left of a panel standing at the window's right side, by the same distance", () => {
    expect(right(renderToString(<CornerBox right={cornerRight(360)} />))).toBe("372");
    expect(right(renderToString(<CornerBox right={cornerRight(512.5, 1280)} />))).toBe("524.5");
  });
});

describe("a task's card", () => {
  const task = (t: Partial<NetTask>): NetTask => ({ id: "t", purpose: "lookup:p@h", label: "Looking names up", started: 1, ...t });
  const conn = (c: Partial<NetConnection>): NetConnection => ({ id: 1, taskId: "t", host: "names.example.org", port: 443, started: 1, sent: 5, received: 5, outcome: "done", ...c });

  it("ends a task the chemist stopped as a finished one does, saying what stopped it, its cut connection no refusal", () => {
    const cut = conn({ outcome: "blocked", reason: "Meno is offline", stopped: "offline" });
    const offline = taskLook(task({ ended: 2, outcome: "done", reason: "stopped: Meno is offline", stopped: "offline" }), [cut]);
    expect([offline.failed, offline.stopped, offline.refused.length, offline.hosts]).toEqual([false, "stopped: Meno is offline", 0, ["names.example.org"]]);
    const withdrawn = taskLook(task({ ended: 2, outcome: "done", stopped: "withdrawn" }), [conn({ outcome: "blocked", reason: "not allowed to use the network", stopped: "withdrawn" })]);
    expect([withdrawn.failed, withdrawn.stopped, withdrawn.refused.length]).toEqual([false, "stopped: no longer allowed", 0]);
  });

  it("keeps a refusal the chemist did not make, and a failure, as they are", () => {
    const host = taskLook(task({ ended: 2, outcome: "failed", reason: "not a host its consent named" }), [conn({ outcome: "blocked", reason: "not a host its consent named" })]);
    expect([host.failed, host.stopped, host.refused.length]).toEqual([true, null, 1]);
    const done = taskLook(task({ ended: 2, outcome: "done" }), [conn({})]);
    expect([done.failed, done.stopped, done.running]).toEqual([false, null, false]);
    expect(taskLook(task({}), []).running).toBe(true);
  });
});
