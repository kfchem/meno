import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Clock } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clockSource, patchAll, patched, PATCHES } from "./patch-three-react.mjs";

/** Each file the script changes, made up around the texts it changes in it, as each package's own file has them. */
const files = PATCHES.flatMap((patch) =>
  Object.entries(patch.files).map(([file, edits]) => ({ patch, file, text: ["// made-up head", ...edits.map(([was], k) => `${was}\n// made-up line ${k}`), ""].join("\n") })),
);

describe("scripts/patch-three-react.mjs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("changes each file once: changed again, it is as it was after the first time", () => {
    for (const { patch, file, text } of files) {
      const once = patched(text, patch, file);
      expect(once.changed, file).toBe(true);
      expect(once.text).toContain(patch.sign);
      for (const [was] of patch.files[file]) expect(once.text, file).not.toContain(was);
      expect(once.text).toContain("// made-up line 0");
      expect(patched(once.text, patch, file)).toEqual({ text: once.text, changed: false });
    }
  });

  it("says so where the package's text is not as it knows it", () => {
    const { patch, file, text } = files.find((x) => x.file === "web/Html.js");
    const upstream = text.replace("if (target) target.removeChild(el);", "if (target && el.parentNode) target.removeChild(el);");
    expect(() => patched(upstream, patch, file)).toThrow(/@react-three\/drei web\/Html\.js is not as 10\.7\.9's/);
    // (twice over is not as known either: which of them is meant is not known)
    const doubled = text.replace("const currentRoot = root.current = ReactDOM.createRoot(el);", "const currentRoot = root.current = ReactDOM.createRoot(el);\nconst currentRoot = root.current = ReactDOM.createRoot(el);");
    expect(() => patched(doubled, patch, file)).toThrow(/look at it again/);
  });

  it("changes a copy of the packages, once, and stops at a version it does not know", () => {
    const dir = mkdtempSync(join(tmpdir(), "meno-patch-"));
    try {
      for (const { patch, file, text } of files) {
        mkdirSync(dirname(join(dir, patch.pkg, file)), { recursive: true });
        writeFileSync(join(dir, patch.pkg, "package.json"), JSON.stringify({ version: patch.version }));
        writeFileSync(join(dir, patch.pkg, file), text);
      }
      expect(patchAll(dir)).toBe(true);
      for (const { patch, file } of files) expect(readFileSync(join(dir, patch.pkg, file), "utf8")).toContain(patch.sign);
      expect(patchAll(dir)).toBe(false);
      // (a text not as known in the second package: the first package's file, not yet changed, is left as it is, and so is the cache)
      const html = join(dir, "@react-three/drei", "web/Html.js");
      const fiber = files.find((x) => x.patch.pkg === "@react-three/fiber");
      writeFileSync(html, files.find((x) => x.file === "web/Html.js").text);
      writeFileSync(join(dir, fiber.patch.pkg, fiber.file), "// made-up: not as known");
      mkdirSync(join(dir, ".vite"));
      expect(() => patchAll(dir)).toThrow(/@react-three\/fiber dist\/events-9ce18a08\.esm\.js is not as 9\.8\.1's/);
      expect(readFileSync(html, "utf8")).toBe(files.find((x) => x.file === "web/Html.js").text);
      expect(existsSync(join(dir, ".vite"))).toBe(true);
      writeFileSync(join(dir, "@react-three/fiber", "package.json"), JSON.stringify({ version: "9.9.0" }));
      expect(() => patchAll(dir)).toThrow(/@react-three\/fiber is 9\.9\.0, not 9\.8\.1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("makes a clock that reads as three's Clock does, reading for reading, and says nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ours = new Function(`return { ${clockSource("")} };`)().clock;
    const theirs = new Clock();
    warn.mockClear();
    // (made-up times of the page, in milliseconds, each read once by each clock)
    const times = [1000, 1016.5, 1033, 1100, 1100, 2000.25, 2500, 2600];
    const read = (c) => {
      const out = [];
      let k = 0;
      vi.spyOn(performance, "now").mockImplementation(() => times[k++]);
      out.push(c.getDelta(), c.getDelta(), c.getElapsedTime(), c.getDelta());
      c.stop();
      out.push(c.getDelta(), c.elapsedTime, c.running, c.autoStart);
      c.start();
      out.push(c.getDelta(), c.elapsedTime, c.oldTime, c.startTime);
      vi.restoreAllMocks();
      return out;
    };
    const mine = read(ours);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mine).toEqual(read(theirs));
    expect(warn).not.toHaveBeenCalled();
  });
});
