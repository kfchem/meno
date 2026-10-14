import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import { COLORS } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { CHAIN_EASE, DOUBLE_CLICK_MS } from "../constants";
import { cellOf, cellsWithin, type Honeycomb } from "../utils/honeycomb";
import { setLinePoints } from "../utils/linePoints";
import { follow } from "../../../theme/motion";

/** How far about the chain's end the honeycomb is shown, in bonds, and how long it takes to open out and to fold away, in seconds. */
const REACH = 3.4;
const OPEN_S = 0.32 * CHAIN_EASE;
const FOLD_S = 0.2 * CHAIN_EASE;
/** The time constant, in seconds, with which the honeycomb's middle goes to the chain's end each time it steps on: a step is not a jump of it. */
const HEAD_TAU = 0.05 * CHAIN_EASE;
/** How strongly it is shown at its middle: the highlight, this much of it. */
const STRENGTH = 0.32;
/** A guide's width, in pixels on the screen. */
const LINE_PX = 1.2;
const easeOut = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

/**
 * The honeycomb a chain is traced on (utils/chain), while it is: opening
 * out from where the chain starts, lines of the drawing's own lengths and
 * angles, fading with the distance from the chain's end, and folding back
 * into the start once it is done; and the trail the pointer leaves, faintly,
 * so that a loop drawn for a ring can be seen.
 *
 * It also leads a chain traced with the button up (`extend.tracing`): the
 * pointer's moves go to it, a click ends it, and Escape - or the other
 * button - lets it go. Escape lets a bond being drawn go too.
 */
export default function ChainGuide2D() {
  const extend = useEditor((s) => s.extend);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const mesh = useRef<THREE.Mesh>(null!);
  const trailLine = useMemo(() => {
    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
    );
    line.frustumCulled = false;
    line.visible = false;
    return line;
  }, []);
  useEffect(
    () => () => {
      trailLine.geometry.dispose();
      (trailLine.material as THREE.Material).dispose();
    },
    [trailLine],
  );
  const chain = extend.active && extend.stroke?.kind === "chain" ? extend.stroke.chain : undefined;
  // the honeycomb as it was last shown: kept to fold away once the chain is done
  const shown = useRef<{ honeycomb: Honeycomb; head: { x: number; y: number }; open: number } | null>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute([], 4));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // led with the button up: the pointer's moves, a click to end, Escape to let go
  const tracing = extend.active && !!extend.tracing;
  useEffect(() => {
    if (!tracing) return;
    const dom = gl.domElement;
    const toPage = (e: PointerEvent | MouseEvent) => {
      const r = dom.getBoundingClientRect();
      const v = new THREE.Vector3(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), 0);
      const p = pageAt(v.x, v.y, camera);
      return { x: p.x, y: p.y };
    };
    const swallow = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      const p = toPage(e);
      store.getState().updateExtend(p.x, p.y);
      invalidate();
    };
    const onDown = (e: PointerEvent) => {
      swallow(e);
      const st = store.getState();
      if (e.button === 0) {
        const p = toPage(e);
        st.updateExtend(p.x, p.y);
        st.commitExtend();
      } else st.cancelExtend();
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      // (the click, and the menu, that end the press are the chain's too)
      for (const type of ["click", "contextmenu"]) window.addEventListener(type, swallow, { capture: true, once: true });
      window.setTimeout(() => {
        for (const type of ["click", "contextmenu"]) window.removeEventListener(type, swallow, { capture: true });
      }, 400);
      invalidate();
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [tracing, gl, camera, store, invalidate]);

  // Escape lets any stroke go - a chain, dragged or traced, or a bond being drawn
  const strokeUnderWay = extend.active;
  useEffect(() => {
    if (!strokeUnderWay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      store.getState().cancelExtend();
      invalidate();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [strokeUnderWay, store, invalidate]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30);
    const L0 = NOMINAL_BOND_LENGTH;
    let movingHead = false;
    let s = shown.current;
    if (chain) {
      const head = cellOf(chain.honeycomb, chain.walk[chain.walk.length - 1]);
      if (!s || s.honeycomb !== chain.honeycomb) s = { honeycomb: chain.honeycomb, head, open: s?.honeycomb === chain.honeycomb ? s.open : 0 };
      // (each step of the chain moves the light's middle on - going to it, not jumping)
      s.head = { x: follow(s.head.x, head.x, step, HEAD_TAU), y: follow(s.head.y, head.y, step, HEAD_TAU) };
      if (Math.hypot(s.head.x - head.x, s.head.y - head.y) < 1e-3 * L0) s.head = { x: head.x, y: head.y };
      else movingHead = true;
      s.open = Math.min(1, s.open + step / OPEN_S);
    } else if (s) {
      s.open = Math.max(0, s.open - step / FOLD_S);
    }
    shown.current = s && s.open > 0 ? s : null;
    // the trail: where the pointer has been
    const trail = chain ? chain.trail : [];
    if (trail.length > 1) {
      setLinePoints(trailLine.geometry, trail, -0.03);
      trailLine.visible = true;
    } else trailLine.visible = false;
    if (!shown.current) {
      mesh.current.visible = false;
      return;
    }
    const { honeycomb, head, open } = shown.current;
    const L = NOMINAL_BOND_LENGTH;
    // it opens out from where the chain started, and folds back into it
    const centre = chain ? head : honeycomb.origin;
    const reach = REACH * L * easeOut(open);
    const { edges } = cellsWithin(honeycomb, centre, reach + L);
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    const half = (LINE_PX / zoom) / 2;
    const positions: number[] = [];
    const colors: number[] = [];
    const tint = new THREE.Color(COLORS.highlight);
    for (const [a, b] of edges) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // (faint with distance, none past its reach; and from where it opens)
      const far = Math.hypot(mx - centre.x, my - centre.y);
      const fromStart = Math.hypot(mx - honeycomb.origin.x, my - honeycomb.origin.y);
      const alpha =
        STRENGTH * Math.max(0, 1 - far / Math.max(reach, 1e-6)) * Math.min(1, Math.max(0, (reach - fromStart * 0.6) / L + 1));
      if (alpha <= 0.01) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = (-(b.y - a.y) / len) * half;
      const ny = ((b.x - a.x) / len) * half;
      const quad = [
        [a.x + nx, a.y + ny],
        [b.x + nx, b.y + ny],
        [b.x - nx, b.y - ny],
        [a.x + nx, a.y + ny],
        [b.x - nx, b.y - ny],
        [a.x - nx, a.y - ny],
      ];
      for (const [x, y] of quad) {
        positions.push(x, y, -0.035);
        colors.push(tint.r, tint.g, tint.b, alpha);
      }
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    geometry.computeBoundingSphere();
    mesh.current.visible = positions.length > 0;
    if (open < 1 || !chain || movingHead) invalidate();
  });

  return (
    <group>
      <mesh ref={mesh} geometry={geometry} visible={false} frustumCulled={false} renderOrder={-3}>
        <meshBasicMaterial vertexColors transparent side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <primitive object={trailLine} />
    </group>
  );
}
