import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { widenedMaterial } from "../components/instances";
import { failShader, menoShader, shaderFailed, shaderName } from "./menoShader";
import { occludedMaterial } from "./occlusionMaterial";
import { outlineMaterial } from "./outlineMaterial";
import { withStickBend } from "./stickBend";

/**
 * GLSL ES 3.00's keywords and words kept back for the future (its
 * specification, section 3.8) that a name of Meno's might well be - not to
 * be declared: a shader declaring one does not compile, and draws nothing.
 */
const RESERVED = [
  "attribute", "varying", "coherent", "volatile", "restrict", "readonly", "writeonly", "resource", "atomic_uint", "noperspective",
  "patch", "sample", "subroutine", "common", "partition", "active", "asm", "class", "union", "enum", "typedef", "template", "this",
  "goto", "inline", "noinline", "public", "static", "extern", "external", "interface", "long", "short", "double", "half", "fixed",
  "unsigned", "superp", "input", "output", "filter", "sizeof", "cast", "namespace", "using", "packed", "row_major", "precise",
  "in", "out", "inout", "uniform", "layout", "centroid", "flat", "smooth", "invariant", "lowp", "mediump", "highp", "precision",
  "struct", "switch", "case", "default", "break", "continue", "do", "for", "while", "if", "else", "return", "discard", "true", "false",
];

/** Every name a shader declares: its variables, its functions' arguments and the functions themselves. */
function declared(source: string): string[] {
  const types = "(?:float|int|uint|bool|void|[iu]?vec[234]|mat[234](?:x[234])?|sampler2D)";
  const names: string[] = [];
  for (const m of source.matchAll(new RegExp(`\\b${types}\\s+([A-Za-z_]\\w*)`, "g"))) names.push(m[1]);
  return names;
}

/** Whether a shader's brackets close as they open. */
function balanced(source: string): boolean {
  const open = { "(": ")", "{": "}", "[": "]" } as Record<string, string>;
  const stack: string[] = [];
  for (const c of source.replace(/\/\/.*$/gm, "")) {
    if (open[c]) stack.push(open[c]);
    else if (c === ")" || c === "}" || c === "]") if (stack.pop() !== c) return false;
  }
  return stack.length === 0;
}

/** A material's shader as three.js would hand it to Meno, and as Meno makes it. */
function made(material: THREE.Material, lib: "standard" | "basic") {
  const shader = { vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  return shader;
}

const VARIANTS: [string, () => THREE.Material, "standard" | "basic"][] = [
  ["the balls' (lines on them)", () => { const m = new THREE.MeshStandardMaterial(); occludedMaterial(m, "atoms"); return m; }, "standard"],
  ["the sticks'", () => { const m = new THREE.MeshStandardMaterial(); occludedMaterial(m, "bonds"); return m; }, "standard"],
  ["the sticks' that bend", () => { const m = new THREE.MeshStandardMaterial(); occludedMaterial(m, "bonds", { bend: true }); return m; }, "standard"],
  ["the line round the balls", () => outlineMaterial().material, "basic"],
  ["the line round the sticks (bent)", () => outlineMaterial(true).material, "basic"],
  ["a bent stick's highlight", () => menoShader(new THREE.MeshBasicMaterial(), "bent-hull-test", (s) => withStickBend(s)), "basic"],
  ["a widened line", () => widenedMaterial("xy", {}).material, "basic"],
];

describe("Meno's own shaders", () => {
  for (const [what, make, lib] of VARIANTS) {
    it(`${what}: say their name, declare no word GLSL keeps back, and close every bracket`, () => {
      const plain = THREE.ShaderLib[lib];
      const s = made(make(), lib);
      for (const [mine, theirs] of [
        [s.vertexShader, plain.vertexShader],
        [s.fragmentShader, plain.fragmentShader],
      ]) {
        expect(shaderName(mine)).not.toBeNull();
        const bad = declared(mine).filter((n) => RESERVED.includes(n));
        expect([what, bad]).toEqual([what, []]);
        expect(balanced(mine)).toBe(true);
        expect(mine).not.toBe(theirs);
      }
    });
  }

  it("put in what they say, where three.js's own has room for it", () => {
    const bent = made(VARIANTS[2][1](), "standard");
    expect(bent.vertexShader).toContain("stickSwept( position, objectNormal");
    expect(bent.vertexShader).toContain("stickSwept( position, normal");
    // (straight sticks never pay for the bending: none of it in theirs)
    expect(made(VARIANTS[1][1](), "standard").vertexShader).not.toContain("stickSwept");
    expect(made(VARIANTS[3][1](), "basic").vertexShader).not.toContain("stickSwept");
    const balls = made(VARIANTS[0][1](), "standard");
    expect(balls.fragmentShader).toContain("ballLineLeast");
    const line = made(VARIANTS[4][1](), "basic");
    expect(line.vertexShader).toContain("stickSwept( transformed, normal");
  });

  it("once one fails to compile, draw its materials plain - nothing of Meno's put in, compiled again", () => {
    const m = menoShader(new THREE.MeshBasicMaterial(), "failing-test", (s) => {
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nfloat half;");
    });
    // (what the check above finds in it)
    expect(declared(made(m, "basic").vertexShader).filter((n) => RESERVED.includes(n))).toEqual(["half"]);
    expect(m.customProgramCacheKey()).toBe("failing-test:");
    const version = m.version;
    failShader("failing-test");
    expect(shaderFailed("failing-test")).toBe(true);
    expect(m.version).toBeGreaterThan(version);
    expect(m.customProgramCacheKey()).toBe("failing-test:plain");
    const s = made(m, "basic");
    expect(s.vertexShader).toBe(THREE.ShaderLib.basic.vertexShader);
    expect(shaderName("void main() {}")).toBeNull();
  });
});
