import * as THREE from "three";

/**
 * Meno's own shaders - three.js's materials with Meno's GLSL put into them
 * (lines on the balls, a stick bending, the line round a molecule) - each
 * known by a name. Where one fails to compile, it says so in Meno's log
 * (console.error is logged: lib/log), with its name and the graphics
 * card's own words for what was wrong - nothing of the document - and from
 * then on is drawn as its plain three.js material, without what Meno puts
 * in: a molecule loses a line or a shade, never its atoms.
 */

/** The names of those that failed to compile, this run. */
const failed = new Set<string>();
/** The materials of each name, to compile again plain once it fails - each till it is disposed of. */
const users = new Map<string, Set<THREE.Material>>();

/** The line a shader of Meno's begins with, naming it: what an error is told by. */
const TAG = "// meno-shader: ";

type Shader = THREE.WebGLProgramParametersWithUniforms;

/**
 * `material` with Meno's GLSL put in by `inject` - known as `name`, and
 * compiled once for each `key` (a material's own variants) - or, once
 * `name` has failed to compile, as it is.
 */
export function menoShader<M extends THREE.Material>(material: M, name: string, inject: (shader: Shader, renderer: THREE.WebGLRenderer) => void, key: () => string = () => ""): M {
  material.onBeforeCompile = (shader, renderer) => {
    if (failed.has(name)) return;
    shader.vertexShader = `${TAG}${name}\n${shader.vertexShader}`;
    shader.fragmentShader = `${TAG}${name}\n${shader.fragmentShader}`;
    inject(shader, renderer);
  };
  material.customProgramCacheKey = () => (failed.has(name) ? `${name}:plain` : `${name}:${key()}`);
  let of = users.get(name);
  if (!of) users.set(name, (of = new Set()));
  of.add(material);
  material.addEventListener("dispose", () => of.delete(material));
  return material;
}

/** Whether Meno's shader `name` has failed to compile, this run: drawn plain since. */
export function shaderFailed(name: string): boolean {
  return failed.has(name);
}

/** Meno's shader `name` failed: its materials compiled again, plain. */
export function failShader(name: string): void {
  if (failed.has(name)) return;
  failed.add(name);
  for (const m of users.get(name) ?? []) m.needsUpdate = true;
}

/** The name a shader's source gives itself, where it is one of Meno's. */
export function shaderName(source: string): string | null {
  const at = source.indexOf(TAG);
  if (at < 0) return null;
  return /^[\w:-]+/.exec(source.slice(at + TAG.length))?.[0] ?? null;
}

/** A renderer that says in Meno's log what shader of its failed to compile, and why - and draws one of Meno's, failing, plain. */
export function watchShaderErrors(renderer: THREE.WebGLRenderer): void {
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    const name = shaderName(gl.getShaderSource(vertex) ?? "") ?? shaderName(gl.getShaderSource(fragment) ?? "");
    const why = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join("\n");
    console.error(`A 3D shader did not compile${name ? ` (Meno's ${name}, drawn plain from now on)` : ""}: ${why}`);
    if (name) failShader(name);
  };
}
