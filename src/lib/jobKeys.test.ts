import { describe, expect, it } from "vitest";
import { isJobKey, jobKey, reusable, type Keyed } from "./jobKeys";

const XTB: Keyed = {
  plugin: "xtb",
  pluginVersion: "0.1.3",
  program: "xtb",
  programVersion: "6.7.1",
  args: ["input.xyz", "--opt", "normal"],
  files: [
    { name: "input.xyz", text: "3\n\nO 0 0 0\nH 0 0.76 0.59\nH 0 -0.76 0.59\n" },
    { name: "xcontrol", text: "$write\n   json=true\n$end\n" },
  ],
};

describe("a job's key", () => {
  it("is the same for the same job, its files in any order - and another for any byte, argument or version changed", () => {
    const key = jobKey(XTB);
    expect(isJobKey(key)).toBe(true);
    expect(jobKey({ ...XTB, files: [...XTB.files].reverse() })).toBe(key);
    const others: Keyed[] = [
      { ...XTB, files: [{ ...XTB.files[0], text: XTB.files[0].text.replace("0.59", "0.58") }, XTB.files[1]] },
      { ...XTB, args: ["input.xyz", "--opt", "tight"] },
      { ...XTB, programVersion: "6.7.2" },
      { ...XTB, pluginVersion: "0.1.4" },
      { ...XTB, plugin: "crest" },
      { ...XTB, stdin: "input.xyz" },
      { ...XTB, then: [{ program: "orca_2mkl", args: ["input"] }] },
      { ...XTB, files: [...XTB.files, { name: "extra", text: "" }] },
    ];
    for (const o of others) expect(jobKey(o)).not.toBe(key);
    // (a file's name and its text are not run together: a name ending as the next begins is another job)
    expect(jobKey({ ...XTB, files: [{ name: "ab", text: "c" }] })).not.toBe(jobKey({ ...XTB, files: [{ name: "a", text: "bc" }] }));
  });

  it("finds a job the workspace ran to the end under a key - in a step's last run or one it keeps - only while its runner says it is done", () => {
    const steps = [
      { ran: { jobs: ["a-1111aaaa", "b-2222bbbb"], keys: ["k1", "k2"] } },
      { ran: { jobs: ["c-3333cccc"], keys: ["k3"] }, runs: [{ jobs: ["d-4444dddd"], keys: ["k4"] }] },
      { ran: { jobs: ["e-5555eeee"] } },
    ];
    const states: Record<string, string> = { "a-1111aaaa": "done", "b-2222bbbb": "failed", "c-3333cccc": "done", "d-4444dddd": "done" };
    const stateOf = (id: string) => states[id];
    expect(reusable(steps, "k1", stateOf)).toBe("a-1111aaaa");
    expect(reusable(steps, "k4", stateOf)).toBe("d-4444dddd");
    // (failed, or its folder cleared since - its runner knows it no more: run again)
    expect(reusable(steps, "k2", stateOf)).toBeNull();
    expect(reusable(steps, "k3", (id) => (id === "c-3333cccc" ? undefined : stateOf(id)))).toBeNull();
    expect(reusable(steps, "k9", stateOf)).toBeNull();
  });
});
