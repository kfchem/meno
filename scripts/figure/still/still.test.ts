/**
 * The still-picture script's answers, each worked out by hand in its test's
 * comment from coordinates typed here: an invented small structure, nothing
 * from a file.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { principalTurn } from "../../../src/ui/features/Workspace/utils/align3d";
import { browserOptions, browserPlaces, endedOnSignal, foundBrowser, NO_BROWSER } from "./browser";
import { drawnFigures } from "./draw";
import { readManifest, stillInput, turnByAtoms } from "./still";

const turned = (places: number[], turn: ReturnType<typeof turnByAtoms>, i: number) =>
  new THREE.Vector3(places[3 * i], places[3 * i + 1], places[3 * i + 2]).applyQuaternion(new THREE.Quaternion(...turn));
const xyz = (rows: string[]) => `${rows.length}\ncomment\n${rows.join("\n")}\n`;

describe("the view by atoms", () => {
  it("three atoms: their plane faces the eye, the first two left to right", () => {
    // A (1,1,1), B (1,3,1), C (1,1,4): A to B is along the file's y, C is 3 off it along z.
    // x' = A to B = (0,1,0); n = x' cross (C - A) = (0,1,0) cross (0,0,3) = (3,0,0), so n = (1,0,0);
    // y' = n cross x' = (1,0,0) cross (0,1,0) = (0,0,1). A point v goes to (v.x', v.y', v.n):
    // A -> (1,1,1), B -> (3,1,1), C -> (1,4,1): one depth (1), B 2 to the right of A at A's height (1).
    const places = [1, 1, 1, 1, 3, 1, 1, 1, 4];
    const turn = turnByAtoms(places, [0, 1, 2]);
    const [a, b, c] = [0, 1, 2].map((i) => turned(places, turn, i));
    expect([a.z, b.z, c.z]).toEqual([expect.closeTo(1, 6), expect.closeTo(1, 6), expect.closeTo(1, 6)]);
    expect(b.x - a.x).toBeCloseTo(2, 6);
    expect(b.y - a.y).toBeCloseTo(0, 6);
    expect(c.y - a.y).toBeCloseTo(3, 6);
  });

  it("three atoms, aslant: still one depth, the pair level and its length kept", () => {
    // A (0,0,0), B (1,1,0), C (0,1,1): |AB| = sqrt 2; AB.AC = 1, |AC| = sqrt 2, so C is at 60 degrees from AB:
    // C's height over AB is sqrt 2 * sin 60 = sqrt 6 / 2; all three in the plane, so depth 0 for each.
    const places = [0, 0, 0, 1, 1, 0, 0, 1, 1];
    const turn = turnByAtoms(places, [0, 1, 2]);
    const [a, b, c] = [0, 1, 2].map((i) => turned(places, turn, i));
    expect(b.x - a.x).toBeCloseTo(Math.SQRT2, 6);
    expect(b.y - a.y).toBeCloseTo(0, 6);
    expect(Math.abs(a.z) + Math.abs(b.z) + Math.abs(c.z)).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(Math.sqrt(6) / 2, 6);
  });

  it("two atoms: the pair lies left to right, the rest spread up and down", () => {
    // A (0,0,0), B (0,0,2) along the file's z; D (5,0,1), E (-5,0,1) spread along the file's x, across the pair.
    // x' = (0,0,1): A -> 0, B -> 2, so B is 2 right of A at one height.
    // The spread across it is all along file x (variance 50 against 0 along y), so y' = (1,0,0) and z' = x' cross y' = (0,1,0):
    // D -> (1, 5, 0) and E -> (1, -5, 0): D above, E below by 5, in the screen's plane (depth 0).
    const places = [0, 0, 0, 0, 0, 2, 5, 0, 1, -5, 0, 1];
    const turn = turnByAtoms(places, [0, 1]);
    const [a, b, d, e] = [0, 1, 2, 3].map((i) => turned(places, turn, i));
    expect(b.x - a.x).toBeCloseTo(2, 6);
    expect(b.y - a.y).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(5, 6);
    expect(e.y).toBeCloseTo(-5, 6);
    expect(d.z).toBeCloseTo(0, 6);
    expect(e.z).toBeCloseTo(0, 6);
  });
});


describe("a figure made ready for Meno's picture", () => {
  const two = xyz(["O 0 0 0", "O 2 0 0"]);

  it("a distance asked for is Meno's own measurement of that pair; a pair asked to lose its stick has none", () => {
    // Two carbons 1.5 angstroms apart are bonded by distance: one bond, atoms 0 and 1, until asked to leave it out.
    const cc = xyz(["C 0 0 0", "C 1.5 0 0"]);
    const bonded = stillInput({ name: "b", xyz: "", distances: [[1, 2]] }, cc).molecule;
    expect(bonded.bonds.map((b) => [b.a1, b.a2].sort())).toEqual([[0, 1]]);
    expect(bonded.measures).toEqual([{ id: 1, atoms: [0, 1] }]);
    const lost = stillInput({ name: "b", xyz: "", distances: [[1, 2]], noStick: [[2, 1]] }, cc).molecule;
    expect(lost.bonds).toHaveLength(0);
    expect(lost.measures).toEqual([{ id: 1, atoms: [0, 1] }]);
  });

  it("the view is the molecule's turn; none, Meno's own first view of the file: its principal axes", () => {
    const three = xyz(["O 0 0 0", "N 0 2 0", "C 0 0 3"]);
    expect(stillInput({ name: "v", xyz: "", view: [1, 2, 3] }, three).molecule.turn).toEqual(turnByAtoms([0, 0, 0, 0, 2, 0, 0, 0, 3], [0, 1, 2]));
    // Two oxygens 4 apart along the file's z, a nitrogen 0.5 off their middle along y: the longest spread is along z,
    // which Meno lays across the screen (x) - not along the file's x, as the file's own axes would show it.
    const places = [0, 0, 0, 0, 0, 4, 0, 0.5, 2];
    const opened = stillInput({ name: "v", xyz: "" }, xyz(["O 0 0 0", "O 0 0 4", "N 0 0.5 2"])).molecule.turn!;
    expect(opened).toEqual(principalTurn(places));
    const [a, b] = [0, 1].map((i) => turned(places, opened, i));
    expect(Math.abs(b.x - a.x)).toBeCloseTo(4, 6);
    expect(b.y - a.y).toBeCloseTo(0, 6);
    expect(b.z - a.z).toBeCloseTo(0, 6);
  });

  it("the second frame is the one drawn where asked", () => {
    // Frame 1 has the pair 2 apart, frame 2 has them 3 apart.
    const frames = "2\nf1\nO 0 0 0\nO 2 0 0\n2\nf2\nO 0 0 0\nO 3 0 0\n";
    expect(stillInput({ name: "m", xyz: "", frame: 2 }, frames).molecule.atoms[1].x).toBe(3);
    expect(stillInput({ name: "m", xyz: "" }, frames).molecule.atoms[1].x).toBe(2);
  });

  it("a new workspace's styles in 3D, but for hydrogens on carbon left out where asked; Settings' resolution where none is given", () => {
    const one = stillInput({ name: "s", xyz: "" }, two);
    expect(one.docStyle3d).toBeUndefined();
    expect(one.dpi).toBe(600);
    const hidden = stillInput({ name: "s", xyz: "", hydrogens: false, dpi: 1200 }, two);
    expect(hidden.docStyle3d).toBeDefined();
    expect(hidden.dpi).toBe(1200);
  });

  it("an atom number out of range names the figure and the number", () => {
    expect(() => stillInput({ name: "ts1", xyz: "", distances: [[1, 7]] }, two)).toThrow(/figure "ts1".*atom number 7/);
    expect(() => stillInput({ name: "ts2", xyz: "", view: [0, 1] }, two)).toThrow(/figure "ts2".*atom number 0/);
    expect(() => stillInput({ name: "ts3", xyz: "", noStick: [[1, 3]] }, two)).toThrow(/figure "ts3".*atom number 3/);
  });

  it("a frame the file lacks names the figure and the number", () => {
    expect(() => stillInput({ name: "f", xyz: "", frame: 2 }, two)).toThrow(/figure "f".*frame 2/);
  });
});

describe("the manifest", () => {
  /** A manifest of `figures` in a folder of its own, beside one XYZ file (in/a.xyz): its path. */
  function manifest(figures: unknown[], extra: object = {}): string {
    const dir = mkdtempSync(join(tmpdir(), "still-"));
    mkdirSync(join(dir, "in"));
    writeFileSync(join(dir, "in", "a.xyz"), xyz(["O 0 0 0", "O 2 0 0"]));
    writeFileSync(join(dir, "m.json"), JSON.stringify({ out: "pics", figures, ...extra }));
    return join(dir, "m.json");
  }

  it("its paths are relative to it", () => {
    const path = manifest([{ name: "a", xyz: "in/a.xyz", distances: [[1, 2]] }]);
    const read = readManifest(path);
    expect(read.out).toBe(join(path, "..", "pics"));
    expect(read.figures[0].molecule.measures).toEqual([{ id: 1, atoms: [0, 1] }]);
  });

  it("a missing file names the figure", () => {
    expect(() => readManifest(manifest([{ name: "gone", xyz: "in/none.xyz" }]))).toThrow(/figure "gone".*in\/none\.xyz/);
  });

  it("an unknown key is refused by name, the figure named", () => {
    expect(() => readManifest(manifest([{ name: "k", xyz: "in/a.xyz", colour: "red" }]))).toThrow(/figure "k": unknown key "colour"/);
    expect(() => readManifest(manifest([], { size: 3 }))).toThrow(/the manifest: unknown key "size"/);
  });

  it("a margin or a frame of its own is refused with the reason: Meno's picture is framed as a copied picture is", () => {
    expect(() => readManifest(manifest([{ name: "m", xyz: "in/a.xyz", margin: 0.1 }]))).toThrow(/figure "m": margin is not taken: .*copied picture/);
    expect(() => readManifest(manifest([{ name: "b", xyz: "in/a.xyz", box: [0, 0, 1, 1] }]))).toThrow(/figure "b": box is not taken: .*copied picture/);
  });

  it("a resolution Meno does not make a picture at is refused, the ones it does said", () => {
    expect(() => readManifest(manifest([{ name: "d", xyz: "in/a.xyz", dpi: 72 }]))).toThrow(/figure "d": dpi: give 300, 600, 1200/);
  });

  it("a name with a folder in it, or two figures of one name, are refused", () => {
    expect(() => readManifest(manifest([{ name: "../x", xyz: "in/a.xyz" }]))).toThrow(/name: give a file name/);
    expect(() => readManifest(manifest([{ name: "a", xyz: "in/a.xyz" }, { name: "a", xyz: "in/a.xyz" }]))).toThrow(/figure "a": two figures have this name/);
  });
});

describe("the page draws nothing of its own", () => {
  const entry = readFileSync(new URL("./page/entry.ts", import.meta.url), "utf8");

  it("it calls Meno's own picture path: laid out, drawn by WebGL as the canvas draws, the values written over it", () => {
    for (const call of ["laidOut(", "solidsDrawnInSteps(", "onlySolids(", "solidsPng("]) expect(entry).toContain(call);
    expect(entry).toMatch(/from "\.\.\/\.\.\/\.\.\/\.\.\/src\/ui\/features\/Workspace\/picture"/);
    expect(entry).toMatch(/from "\.\.\/\.\.\/\.\.\/\.\.\/src\/ui\/features\/Workspace\/render3d"/);
  });

  it("no scene, renderer, SVG or flat canvas of its own", () => {
    expect(entry).not.toMatch(/from "three"|WebGLRenderer|createSVG|<svg|getContext\("2d"\)|\.arc\(|\.fillRect\(/);
  });
});

describe("the browser", () => {
  const nowhere = () => false;

  it("the one the environment variable names first; one it names that is not there is an error", () => {
    expect(foundBrowser({ STILL_BROWSER: "/x/chrome" }, "linux", (p) => p === "/x/chrome")).toBe("/x/chrome");
    expect(() => foundBrowser({ STILL_BROWSER: "/x/none" }, "linux", nowhere)).toThrow(/STILL_BROWSER names \/x\/none/);
  });

  it("else the usual places: an app on macOS, a program's folder on Windows, a name on the PATH on Linux", () => {
    expect(foundBrowser({}, "darwin", (p) => p === "/Applications/Chromium.app/Contents/MacOS/Chromium")).toBe("/Applications/Chromium.app/Contents/MacOS/Chromium");
    const win = browserPlaces("win32", { PROGRAMFILES: "C:\\Program Files" }).paths;
    expect(win.some((p) => p.endsWith(join("Google", "Chrome", "Application", "chrome.exe")))).toBe(true);
    expect(foundBrowser({ PATH: "/opt/bin:/usr/bin" }, "linux", (p) => p === "/usr/bin/chromium")).toBe("/usr/bin/chromium");
  });

  it("software drawing unless STILL_GL is gpu; any other value refused", () => {
    expect(browserOptions({})).toEqual(expect.arrayContaining(["--headless", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]));
    const gpu = browserOptions({ STILL_GL: "gpu" });
    expect(gpu).toContain("--headless");
    expect(gpu.some((o) => /swiftshader/.test(o))).toBe(false);
    expect(() => browserOptions({ STILL_GL: "fast" })).toThrow(/STILL_GL is "fast": give gpu or software/);
  });

  it("an interrupt ends the browser by its process id, deletes its profile, and exits with the signal's status", async () => {
    // (a stand-in for the browser: a Node process that waits for ever)
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    await new Promise((done) => child.once("spawn", done));
    const profile = mkdtempSync(join(tmpdir(), "still-profile-"));
    writeFileSync(join(profile, "kept"), "x");
    const codes: number[] = [];
    await endedOnSignal("SIGINT", child, profile, (code) => codes.push(code));
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(existsSync(profile)).toBe(false);
    expect(codes).toEqual([130]);
    const other = mkdtempSync(join(tmpdir(), "still-profile-"));
    await endedOnSignal("SIGTERM", child, other, (code) => codes.push(code));
    expect(codes).toEqual([130, 143]);
  });

  it("none found: none, and what to set is said", () => {
    expect(foundBrowser({ PATH: "/usr/bin" }, "linux", nowhere)).toBeNull();
    expect(NO_BROWSER).toMatch(/set STILL_BROWSER/);
  });
});

/** A PNG's size, its resolution (pHYs, dots to the inch), and its pixels, RGBA (8 bits, no interlace: as a canvas writes them). */
function pngPixels(png: Uint8Array) {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = v.getUint32(16), height = v.getUint32(20);
  const idat: Uint8Array[] = [];
  let dpi = 0;
  for (let at = 8; at < png.length; ) {
    const n = v.getUint32(at);
    const kind = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (kind === "IDAT") idat.push(png.subarray(at + 8, at + 8 + n));
    if (kind === "pHYs") dpi = Math.round(v.getUint32(at + 8) * 0.0254);
    at += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const row = 4 * width;
  const px = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (row + 1)];
    for (let x = 0; x < row; x++) {
      const r = raw[y * (row + 1) + 1 + x];
      const a = x >= 4 ? px[y * row + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * row + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * row + x - 4] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * row + x] = (r + [0, a, b, (a + b) >> 1, paeth][f]) & 0xff;
    }
  }
  return { width, height, dpi, px };
}

/** The browser on this machine; none found in the usual places (a skip), or one named that is not there (a failure). */
const { browser, wrong } = (() => {
  try {
    return { browser: foundBrowser(), wrong: null };
  } catch (e) {
    return { browser: null, wrong: e instanceof Error ? e : new Error(String(e)) };
  }
})();

describe("Meno's own picture, drawn in a browser", () => {
  // (where none is found in the usual places - CI has none - skipped, and why said; a browser named that is not there fails)
  it.skipIf(!browser && !wrong)(browser || wrong ? "two oxygens 2 angstroms apart, measured: drawn at 300 and 600 dpi" : `skipped: ${NO_BROWSER}`, async () => {
    if (wrong) throw wrong;
    // O (0,0,0), O (2,0,0), seen as read: the two balls side by side on one row, the dashed line between them.
    const f = { name: "o2", xyz: "", distances: [[1, 2]] as [number, number][] };
    const [low, high] = await drawnFigures([stillInput({ ...f, dpi: 300 }, xyz(["O 0 0 0", "O 2 0 0"])), stillInput({ ...f, name: "o2b", dpi: 600 }, xyz(["O 0 0 0", "O 2 0 0"]))], browser!);
    const a = pngPixels(low.png), b = pngPixels(high.png);
    expect([a.dpi, b.dpi]).toEqual([300, 600]);
    // (twice the resolution, twice the pixels either way, to a pixel)
    expect(Math.abs(b.width - 2 * a.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.height - 2 * a.height)).toBeLessThanOrEqual(2);
    // (the corners clear, as a copied picture's are round the molecule)
    expect(b.px[3]).toBe(0);
    // (oxygen's red, shaded: lit balls are drawn in more than one shade of it; and the measurement's blue)
    const reds = new Set<number>();
    let blue = 0;
    for (let i = 0; i < b.px.length; i += 4) {
      const [r, g, bl, al] = [b.px[i], b.px[i + 1], b.px[i + 2], b.px[i + 3]];
      if (al === 255 && r > 120 && g < 80 && bl < 80) reds.add((r << 16) | (g << 8) | bl);
      if (al === 255 && bl > 200 && r < 80) blue++;
    }
    expect(reds.size).toBeGreaterThan(50);
    expect(blue).toBeGreaterThan(100);
  });
});
