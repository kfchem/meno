import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { bondRadiusOf, type Role3D, type Style3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import { bondLines, withCentres, WORLD_PER_ANGSTROM, type Solid } from "../utils/molecule3d";
import { OCCLUSION_TERMS, type Occlusion } from "../utils/occlusion3d";
import { OCCLUSION_DIRECT as DIRECT, occludedMaterial } from "../utils/occlusionMaterial";
import { askOcclusion, occlusionKnown, packLines } from "../utils/occlusions";
import { casterOf, castersOn } from "../utils/shadows3d";
import { largeOn } from "../utils/largeDrawing";
import { screenShadersOn, shadeWith } from "../utils/screenShade";
import { FRAME_ORDER } from "../utils/page";

/** How quickly the shade goes over to another - a frame's, a look's, or one just worked out - in seconds. */
const SHADE_TAU = 0.08;
/** A bond as thin as nothing - a look drawing none - is shaded as one this thick would be, in ångströms. */
const LEAST_BOND = 0.05;

type Uniforms = ReturnType<typeof occludedMaterial>;
const taught = new WeakMap<THREE.Material, Uniforms>();
/** The material taught to shade by occlusion, once. */
function uniformsOf(material: THREE.MeshStandardMaterial, kind: "atoms" | "bonds"): Uniforms {
  let u = taught.get(material);
  if (!u) taught.set(material, (u = occludedMaterial(material, kind)));
  return u;
}

/** A material for the sticks that bend (utils/stickBend), drawn apart: taught as `like`'s twin, sharing its uniforms - so that it shades, fades and colours as they do. */
export function teachBent(material: THREE.MeshStandardMaterial, like: THREE.MeshStandardMaterial): void {
  if (!taught.has(material)) taught.set(material, occludedMaterial(material, "bonds", { bend: true, like: uniformsOf(like, "bonds") }));
}

/** What fades a molecule's atoms or bonds with depth (utils/occlusionMaterial `withFade`): the material's own, taught once. */
export function fadeOf(material: THREE.MeshStandardMaterial, kind: "atoms" | "bonds") {
  return uniformsOf(material, kind).fade;
}

/** What draws the lines on a molecule's balls (utils/occlusionMaterial): the atoms' material's own. */
export function ballLinesOf(material: THREE.MeshStandardMaterial) {
  return uniformsOf(material, "atoms").lines;
}

/** What draws the numbers on a molecule's balls (utils/occlusionMaterial, ../utils/atomNumbers): the atoms' material's own. */
export function ballNumbersOf(material: THREE.MeshStandardMaterial) {
  return uniformsOf(material, "atoms").numbers;
}

/** How far a molecule's sticks are coloured by their atoms (utils/occlusionMaterial): the bonds' material's own. */
export function byAtomOf(material: THREE.MeshStandardMaterial) {
  return uniformsOf(material, "bonds").byAtom;
}

/** Open all round: the terms of an atom nothing shades. */
function openTerms(n: number): Float32Array {
  const t = new Float32Array(OCCLUSION_TERMS * n);
  for (let i = 0; i < n; i++) t[OCCLUSION_TERMS * i] = 1;
  return t;
}

/**
 * Each look's bond lines for a frame's `places`, packed as the occlusion
 * worker takes them (seven numbers a line): what the sticks' shade is
 * worked out for, a line for each stick drawn - with its sticks to ring
 * centres, once, where `m` is given as drawn already (withCentres).
 */
export function shadedLines(m: Molecule3D, places: Float32Array, style: Style3D): { primary: Float32Array; secondary: Float32Array } {
  const drawn = m.centres?.length ? { ...m, bonds: withCentres(m, m.bonds) } : m;
  const of = (look: Role3D) => packLines(bondLines(drawn, places, Math.max(bondRadiusOf(style[look]), LEAST_BOND) * WORLD_PER_ANGSTROM));
  return { primary: of("primary"), secondary: of("secondary") };
}

/**
 * A molecule in 3D shaded as it stands (docs/WORKSPACE.md, *Depth*): its
 * hollows darker - the occlusion of the frame shown, in each of its two
 * looks, worked out off the main thread and gone over to as it comes, as
 * the frame or the look changes - and casting the key light's shadow, by
 * coarse balls and sticks that stand where its own do (utils/shadows3d).
 * Its atoms and bonds take shadows.
 */
export function useShading3d(o: {
  turned: RefObject<THREE.Group>;
  atoms: RefObject<THREE.InstancedMesh>;
  bonds: RefObject<THREE.InstancedMesh | null>;
  /** Its chains' ribbons, where it has any: shaded on the screen with it (never per atom). */
  ribbon?: RefObject<THREE.Mesh | null>;
  atomsMat: RefObject<THREE.MeshStandardMaterial>;
  bondsMat: RefObject<THREE.MeshStandardMaterial | null>;
  /** The molecule as drawn: its bonds those it draws. */
  m: Molecule3D;
  solid: Solid;
  /** The frame shown, by its index in `solid`. */
  frame: number;
  style: Style3D;
  /** How far over to the secondary look it is drawn. */
  fill: RefObject<number>;
  /** The sticks of the lines that curve in to a lone atom, drawn apart (utils/stickBend), and which lines they are: shaded as theirs. */
  bent?: { geometry: THREE.BufferGeometry | null; lines: readonly number[] | null };
}) {
  const { m, solid, frame, style, fill } = o;
  const { gl, invalidate } = useThree();
  const n = m.atoms.length;
  const places = solid.frames[frame];
  // each look's bond lines, as the frame has them: what their shade is worked out for
  const lines = useMemo(() => shadedLines(m, places, style), [m, places, style]);
  // what is worked out for each look - none yet, where it is being worked out
  const got = useRef<{ for: unknown; primary?: Occlusion; secondary?: Occlusion }>({ for: null });
  useEffect(() => {
    const now = { for: lines } as typeof got.current;
    got.current = now;
    for (const look of ["primary", "secondary"] as const) {
      const radii = solid.radii[look];
      const known = occlusionKnown(places, radii, lines[look]);
      if (known) now[look] = known;
      else
        void askOcclusion(places, radii, lines[look]).then((occ) => {
          if (got.current !== now) return;
          now[look] = occ;
          invalidate();
        });
    }
    invalidate();
  }, [places, solid, lines, invalidate]);

  // the shade as drawn, on its way to what it is to be
  // (and what its terms last arrived at - each look's worked out, and how far over: gone over again only once that changes)
  const shown = useRef<{ atoms: Float32Array; bonds: Float32Array; strength: number; screen: number; arrived: unknown[] | null }>({
    atoms: openTerms(n),
    bonds: new Float32Array(0),
    strength: 0,
    screen: 0,
    arrived: null,
  });
  // its balls, sticks and ribbon drawn into the screen's shade, as deep as it is shaded there
  const screened = useRef(new WeakSet<THREE.Object3D>());
  const screenWeight = useRef(() => shown.current.screen);
  useEffect(() => {
    const set = screenShadersOn(gl);
    const w = screenWeight.current;
    set.add(w);
    return () => void set.delete(w);
  }, [gl]);
  const attrs = useRef<{ a: THREE.InstancedBufferAttribute; b: THREE.InstancedBufferAttribute; c: THREE.InstancedBufferAttribute; ends: THREE.InstancedBufferAttribute | null } | null>(
    null,
  );

  // what casts its shadow, beside its balls and sticks
  const casters = useRef<{ balls: THREE.InstancedMesh | null; sticks: THREE.InstancedMesh | null }>({ balls: null, sticks: null });
  useEffect(() => {
    const set = castersOn(gl);
    const c = casters.current;
    return () => {
      for (const k of ["balls", "sticks"] as const) {
        const caster = c[k];
        if (!caster) continue;
        caster.removeFromParent();
        set.delete(caster);
        c[k] = null;
      }
    };
  }, [gl]);

  useFrame((_, dt) => {
    const atoms = o.atoms.current;
    const atomsMat = o.atomsMat.current;
    if (!atoms || !atomsMat) return;
    const bonds = o.bonds.current;
    const bondsMat = o.bondsMat.current;
    const f = fill.current ?? 0;
    const k = 1 - Math.exp(-Math.min(dt, 1 / 30) / SHADE_TAU);
    let moving = false;

    // the casters: made where there are none, or none for these balls and sticks
    const c = casters.current;
    const set = castersOn(gl);
    for (const [kind, drawn] of [
      ["balls", atoms],
      ["sticks", bonds],
    ] as const) {
      const was = c[kind];
      if (was && (!drawn || was.instanceMatrix !== drawn.instanceMatrix)) {
        was.removeFromParent();
        set.delete(was);
        c[kind] = null;
      }
      if (drawn && !c[kind] && o.turned.current) {
        const made = casterOf(drawn, kind);
        o.turned.current.add(made);
        set.add(made);
        c[kind] = made;
      }
      const caster = c[kind];
      if (caster && drawn) caster.visible = drawn.visible;
    }

    // how deep the hollows' shade is, per atom and on the screen: each
    // look's, as far over as it is - on the screen only where the canvas is
    // not drawn lighter (a very large drawing), per atom there instead
    const lighter = largeOn(gl).lighter;
    const by = (look: Role3D) => {
      const l = style[look];
      const screen = l.occlusionBy === "screen" && !lighter;
      return { atoms: l.occlusionBy === "atoms" || (l.occlusionBy === "screen" && lighter) ? l.occlusion : 0, screen: screen ? l.occlusion : 0 };
    };
    const P = by("primary");
    const S = by("secondary");
    const strengthTo = P.atoms + (S.atoms - P.atoms) * f;
    const screenTo = P.screen + (S.screen - P.screen) * f;
    const s = shown.current;
    if (s.strength !== strengthTo) {
      s.strength = Math.abs(strengthTo - s.strength) < 0.003 ? strengthTo : s.strength + (strengthTo - s.strength) * k;
      moving = true;
    }
    if (s.screen !== screenTo) {
      s.screen = Math.abs(screenTo - s.screen) < 0.003 ? screenTo : s.screen + (screenTo - s.screen) * k;
      moving = true;
    }
    for (const mesh of [atoms, bonds, o.ribbon?.current]) {
      if (mesh && !screened.current.has(mesh)) {
        shadeWith(mesh, screenWeight.current);
        screened.current.add(mesh);
      }
    }
    const au = uniformsOf(atomsMat, "atoms");
    au.strength.value = s.strength;
    au.direct.value = DIRECT;
    if (bondsMat) {
      const bu = uniformsOf(bondsMat, "bonds");
      bu.strength.value = s.strength;
      bu.direct.value = DIRECT;
    }

    // the terms: each look's, as far over as it is - open where not yet worked out
    const g = got.current;
    const p = g.primary ?? g.secondary;
    const q = g.secondary ?? g.primary;
    const lineCount = lines.primary.length / 7;
    if (s.atoms.length !== OCCLUSION_TERMS * n) s.atoms = openTerms(n);
    if (s.bonds.length !== 2 * lineCount) s.bonds = new Float32Array(2 * lineCount).fill(1);
    let changed = false;
    const towards = (shownTerms: Float32Array, a: Float32Array | undefined, b: Float32Array | undefined, open: (i: number) => number) => {
      for (let i = 0; i < shownTerms.length; i++) {
        const to = a && b ? a[i] + (b[i] - a[i]) * f : open(i);
        const d = to - shownTerms[i];
        if (d === 0) continue;
        shownTerms[i] = Math.abs(d) < 0.002 ? to : shownTerms[i] + d * k;
        changed = true;
      }
    };
    // (where they have arrived and are going nowhere else, not gone over again: a still molecule of
    // a hundred thousand atoms spent 8 ms of every frame of the view moving on nine terms each)
    const aim = [p, q, f, s.atoms, s.bonds];
    if (!s.arrived || aim.some((x, i) => x !== s.arrived![i])) {
      towards(s.atoms, p?.atoms, q?.atoms, (i) => (i % OCCLUSION_TERMS === 0 ? 1 : 0));
      towards(s.bonds, p?.bonds, q?.bonds, () => 1);
      s.arrived = changed ? null : aim;
    }
    if (changed) moving = true;

    // given to its balls and sticks, as attributes their material reads
    let at = attrs.current;
    const geometry = atoms.geometry;
    if (!at || at.a.count !== n || geometry.getAttribute("occlusionA") !== at.a) {
      at = {
        a: new THREE.InstancedBufferAttribute(new Float32Array(4 * n), 4),
        b: new THREE.InstancedBufferAttribute(new Float32Array(4 * n), 4),
        c: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
        ends: null,
      };
      geometry.setAttribute("occlusionA", at.a);
      geometry.setAttribute("occlusionB", at.b);
      geometry.setAttribute("occlusionC", at.c);
      attrs.current = at;
      changed = true;
    }
    if (bonds && (!at.ends || at.ends.count !== lineCount || bonds.geometry.getAttribute("occlusionEnds") !== at.ends)) {
      at.ends = new THREE.InstancedBufferAttribute(new Float32Array(2 * lineCount), 2);
      bonds.geometry.setAttribute("occlusionEnds", at.ends);
      changed = true;
    }
    if (changed) {
      const A = at.a.array as Float32Array;
      const B = at.b.array as Float32Array;
      const C = at.c.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const t = OCCLUSION_TERMS * i;
        for (let j = 0; j < 4; j++) {
          A[4 * i + j] = s.atoms[t + j];
          B[4 * i + j] = s.atoms[t + 4 + j];
        }
        C[i] = s.atoms[t + 8];
      }
      at.a.needsUpdate = at.b.needsUpdate = at.c.needsUpdate = true;
      if (at.ends && at.ends.count === lineCount) {
        (at.ends.array as Float32Array).set(s.bonds);
        at.ends.needsUpdate = true;
      }
    }
    // (the lines drawn apart: each its own two numbers)
    const bent = o.bent;
    if (bent?.geometry && bent.lines && s.bonds.length >= 2 * lineCount) {
      const has = bent.geometry.getAttribute("occlusionEnds") as THREE.InstancedBufferAttribute | undefined;
      if (changed || !has || has.count !== bent.lines.length) {
        const ends = has && has.count === bent.lines.length ? has : new THREE.InstancedBufferAttribute(new Float32Array(2 * bent.lines.length), 2);
        const e = ends.array as Float32Array;
        bent.lines.forEach((k, j) => {
          e[2 * j] = s.bonds[2 * k];
          e[2 * j + 1] = s.bonds[2 * k + 1];
        });
        if (ends !== has) bent.geometry.setAttribute("occlusionEnds", ends);
        ends.needsUpdate = true;
      }
    }
    if (moving) invalidate();
  }, FRAME_ORDER.molecules);
}
