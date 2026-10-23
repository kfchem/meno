import { describe, expect, it, vi } from "vitest";
import { sha256Hex } from "./binary/sha256";
import { isJobKey, jobKey, KEY_AT_ONCE, reusable, type Keyed } from "./jobKeys";

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
  it("is the same for the same job, its files in any order - and another for any byte, argument or version changed", async () => {
    const key = await jobKey(XTB);
    expect(isJobKey(key)).toBe(true);
    expect(await jobKey({ ...XTB, files: [...XTB.files].reverse() })).toBe(key);
    const others: Keyed[] = [
      { ...XTB, files: [{ ...XTB.files[0], text: XTB.files[0].text.replace("0.59", "0.58") }, XTB.files[1]] },
      { ...XTB, args: ["input.xyz", "--opt", "tight"] },
      { ...XTB, programVersion: "6.7.2" },
      { ...XTB, pluginVersion: "0.1.4" },
      // (a program installed separately, replaced - though it says the same version)
      { ...XTB, stamps: ["/opt/xtb/bin/xtb\n1000\n2"] },
      { ...XTB, plugin: "crest" },
      { ...XTB, stdin: "input.xyz" },
      { ...XTB, then: [{ program: "orca_2mkl", args: ["input"] }] },
      { ...XTB, files: [...XTB.files, { name: "extra", text: "" }] },
    ];
    for (const o of others) expect(await jobKey(o)).not.toBe(key);
    // (a file's name and its text are not run together: a name ending as the next begins is another job)
    expect(await jobKey({ ...XTB, files: [{ name: "ab", text: "c" }] })).not.toBe(await jobKey({ ...XTB, files: [{ name: "a", text: "bc" }] }));
    // (SHA-256 as FIPS 180-4 has it: the same as Meno's own, worked out at once)
    expect(key).toBe(sha256Hex(new TextEncoder().encode(JSON.stringify([2, "xtb", "0.1.3", "xtb", "6.7.1", [], XTB.args, null, [], XTB.files.map((f) => [f.name, f.text])]))));
    // (a large input - hashed off Meno's way - keyed the same as it would be at once)
    const large = { ...XTB, files: [{ name: "wavefunction.molden", text: "0.123456789 ".repeat(KEY_AT_ONCE / 4) }] };
    expect(await jobKey(large)).toBe(sha256Hex(new TextEncoder().encode(JSON.stringify([2, "xtb", "0.1.3", "xtb", "6.7.1", [], XTB.args, null, [], large.files.map((f) => [f.name, f.text])]))));
    // (and where the browser has none of its own: Meno's, the same key - a step never stopped for want of it)
    vi.stubGlobal("crypto", {});
    try {
      expect(await jobKey(large)).toBe(await (async () => sha256Hex(new TextEncoder().encode(JSON.stringify([2, "xtb", "0.1.3", "xtb", "6.7.1", [], XTB.args, null, [], large.files.map((f) => [f.name, f.text])]))))());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("finds a job the workspace ran to the end under a key - in a step's last run or one it keeps - read, and only while its runner says it is done", () => {
    const steps = [
      { ran: { jobs: ["a-1111aaaa", "b-2222bbbb"], keys: ["k1", "k2"], gave: ["g1", "g2"] } },
      { ran: { jobs: ["c-3333cccc"], keys: ["k3"], gave: ["g3"] }, runs: [{ jobs: ["d-4444dddd"], keys: ["k4"], gave: ["g4"] }] },
      { ran: { jobs: ["e-5555eeee"] } },
      // (never read - what it gave not known: nothing to check it by)
      { ran: { jobs: ["f-6666ffff", "g-7777aaaa"], keys: ["k6", "k7"], gave: [null, "g7"] } },
      { ran: { jobs: ["h-8888bbbb"], keys: ["k8"] } },
    ];
    const states: Record<string, string> = { "a-1111aaaa": "done", "b-2222bbbb": "failed", "c-3333cccc": "done", "d-4444dddd": "done", "f-6666ffff": "done", "g-7777aaaa": "done", "h-8888bbbb": "done" };
    const stateOf = (id: string) => states[id];
    expect(reusable(steps, "k1", stateOf)).toEqual({ id: "a-1111aaaa", gave: "g1" });
    expect(reusable(steps, "k4", stateOf)).toEqual({ id: "d-4444dddd", gave: "g4" });
    expect(reusable(steps, "k7", stateOf)).toEqual({ id: "g-7777aaaa", gave: "g7" });
    // (failed, or its folder cleared since - its runner knows it no more: run again)
    expect(reusable(steps, "k2", stateOf)).toBeNull();
    expect(reusable(steps, "k3", (id) => (id === "c-3333cccc" ? undefined : stateOf(id)))).toBeNull();
    expect(reusable(steps, "k9", stateOf)).toBeNull();
    expect(reusable(steps, "k6", stateOf)).toBeNull();
    expect(reusable(steps, "k8", stateOf)).toBeNull();
  });
});
