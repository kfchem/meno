import { beforeEach, describe, expect, it, vi } from "vitest";

/** A job's backend, as the test has it: its states in turn, and its log growing. */
const backend = { states: [] as string[], log: "", asked: [] as { cmd: string; args: unknown }[] };

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: { from?: number }) => {
    backend.asked.push({ cmd, args });
    if (cmd === "job_state") {
      const state = backend.states.length > 1 ? backend.states.shift()! : backend.states[0];
      // (the program says a little more each time it is looked at)
      backend.log += `${state}\n`;
      return { id: "j", plugin: "xtb", program: "xtb", state, created: 1 };
    }
    if (cmd === "job_log") {
      // (four bytes at most at once: a long log comes in pieces)
      const from = args.from ?? 0;
      const text = backend.log.slice(from, from + 4);
      return { text, next: from + text.length };
    }
    return undefined;
  },
}));

import { finished, followJob, keptText, liveJobsOf, runningOf, startJob, stopJobsAndWait, type Job } from "./jobs";

describe("jobs", () => {
  beforeEach(() => {
    backend.states = [];
    backend.log = "";
    backend.asked = [];
  });

  it("says which states are over", () => {
    expect(["waiting", "running"].map((s) => finished(s as never))).toEqual([false, false]);
    expect(["done", "failed", "stopped", "gone"].every((s) => finished(s as never))).toBe(true);
  });

  it("runs one at once, sharing the computer's cores among those at once, unless Settings says otherwise", () => {
    expect(runningOf({}, 8)).toEqual({ slots: 1, cores: 8 });
    expect(runningOf({ atOnce: 3 }, 8)).toEqual({ slots: 3, cores: 2 });
    expect(runningOf({ atOnce: 16 }, 8)).toEqual({ slots: 16, cores: 1 });
    expect(runningOf({ atOnce: 2, cores: 6 }, 8)).toEqual({ slots: 2, cores: 6 });
    // never more than the computer has
    expect(runningOf({ cores: 32 }, 8)).toEqual({ slots: 1, cores: 8 });
  });

  it("asks for a job as the backend takes it", async () => {
    await startJob({ plugin: "xtb", program: "xtb", args: ["in.xyz"], files: [{ name: "in.xyz", text: "1\n\nH 0 0 0\n" }], slots: 1, cores: 4 });
    expect(backend.asked[0]).toEqual({
      cmd: "job_start",
      args: { payload: { plugin: "xtb", program: "xtb", args: ["in.xyz"], files: [{ name: "in.xyz", text: "1\n\nH 0 0 0\n" }], slots: 1, cores: 4 } },
    });
  });

  it("follows a job's log and state until it has finished and everything it said is read", async () => {
    backend.states = ["waiting", "running", "running", "done"];
    const said: string[] = [];
    const states: string[] = [];
    const { done } = followJob("j", { log: (t) => said.push(t), state: (j) => states.push(j.state) }, 0);
    expect((await done).state).toBe("done");
    expect(said.join("")).toBe("waiting\nrunning\nrunning\ndone\n");
    // each state once, as it changed
    expect(states).toEqual(["waiting", "running", "done"]);
  });

  it("stops following when asked", async () => {
    backend.states = ["running"];
    const following = followJob("j", {}, 0);
    following.stop();
    expect((await following.done).state).toBe("running");
  });
});

describe("a plugin's jobs, as it is taken away", () => {
  const job = (id: string, plugin: string, state: Job["state"]): Job => ({ id, plugin, program: "p", state, created: 1 });

  it("knows those that wait or run, of that plugin alone", async () => {
    const list = async () => [job("a", "xtb", "running"), job("b", "xtb", "waiting"), job("c", "xtb", "done"), job("d", "orca", "running")];
    expect((await liveJobsOf("xtb", list)).map((j) => j.id)).toEqual(["a", "b"]);
  });

  it("stops them, and waits until each has ended - or a while at most", async () => {
    const asked: string[] = [];
    let looks = 0;
    const look = async (id: string) => job(id, "xtb", id === "a" && ++looks < 3 ? "running" : "stopped");
    const pauses: number[] = [];
    await stopJobsAndWait(["a", "b"], { stop: async (id) => void asked.push(id), look, pause: async (ms) => void pauses.push(ms) });
    expect(asked).toEqual(["a", "b"]);
    // (a looked at until it stopped; b ended at once)
    expect(looks).toBe(3);
    expect(pauses).toEqual([250, 250]);
    // (one that never ends: waited for no longer than said; one whose stop or look fails, taken as ended)
    let waited = 0;
    await stopJobsAndWait(["x"], { stop: async () => {}, look: async (id) => job(id, "xtb", "running"), pause: async () => void waited++, most: 1000 });
    expect(waited).toBe(4);
    await stopJobsAndWait(["y"], { stop: () => Promise.reject(new Error("no")), look: () => Promise.reject(new Error("gone")), pause: async () => {} });
  });
});

describe("the finished jobs' files, as Settings says them", () => {
  it("says how many, and how much they hold where that is known", () => {
    expect(keptText(0, 0)).toBe("None");
    expect(keptText(1, 4_200_000)).toBe("1 job, 4 MB");
    expect(keptText(2, 1000)).toBe("2 jobs, 1 MB");
    expect(keptText(12, 1_430_000_000)).toBe("12 jobs, 1.4 GB");
    expect(keptText(3, null)).toBe("3 jobs");
  });
});
