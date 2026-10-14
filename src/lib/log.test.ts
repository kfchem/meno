import { describe, expect, it } from "vitest";
import { logSender, logText, MOST_A_MINUTE, type Level } from "./log";

describe("a line of the page's for Meno's log (lib/log)", () => {
  it("says what went wrong: an error's name, message and stack, words and numbers as they are", () => {
    const e = new TypeError("x is undefined");
    e.stack = "draw@app.js:10:4\nrender@app.js:20:8";
    expect(logText(["Meno: the canvas stopped working.", e, 3, null])).toBe(
      "Meno: the canvas stopped working. TypeError: x is undefined\ndraw@app.js:10:4\nrender@app.js:20:8 3 null",
    );
    // (a stack that begins with the error's name and message: not said twice)
    const v = new RangeError("too far");
    v.stack = "RangeError: too far\n    at f (app.js:1:1)";
    expect(logText([v])).toBe("RangeError: too far\nat f (app.js:1:1)");
  });

  it("never what a document holds: of anything else only what it is", () => {
    const molecule = { atoms: [{ el: "C", x: 1, y: 2 }], name: "secret" };
    expect(logText(["the structure is copied without its pictures", molecule, new Map([["a", 1]]), [1, 2], () => 0])).toBe(
      "the structure is copied without its pictures [Object] [Map] [Array] [Function]",
    );
    expect(logText([Object.create(null)])).toBe("[Object]");
    expect(logText(["x".repeat(5000)])).toHaveLength(1001);
  });

  it("sends at most a hundred lines a minute, and says how many it left out", () => {
    const got: [Level, string][] = [];
    let t = 0;
    const send = logSender((level, text) => got.push([level, text]), () => t);
    for (let i = 0; i < MOST_A_MINUTE + 5; i++) send("error", [`e${i}`]);
    expect(got).toHaveLength(MOST_A_MINUTE);
    t = 60_000;
    send("warn", ["later"]);
    expect(got[got.length - 1]).toEqual(["warn", "(5 lines left out)\nlater"]);
    send("warn", ["again"]);
    expect(got[got.length - 1]).toEqual(["warn", "again"]);
  });
});
