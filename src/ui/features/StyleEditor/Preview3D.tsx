import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Role3D, Style3D } from "../../../lib/chem/style3d";
import { setCursor } from "../../theme/cursors";
import KeyLight3D from "../Workspace/components/KeyLight3D";
import Molecule3DView from "../Workspace/components/Molecule3DView";
import { watchShaderErrors } from "../Workspace/utils/menoShader";
import { solidOf } from "../Workspace/utils/molecule3d";
import { SAMPLE_3D, SAMPLE_TURN } from "./sample3d";
import { markTurning } from "./sampleTurn";

// --- Preview -------------------------------------------------------------------

/** A turn left to itself stops below this speed, in radians a second. */
const STILL = 0.02;
/** The screen's upright, as a turn's axis. */
const UPRIGHT = new THREE.Vector3(0, 1, 0);
/** How fast a card's sample turns by itself, about the screen's upright, in radians a second: a turn in about half a minute, calm. */
const IDLE = 0.2;
/** How gently it takes up its own turn again once let go - by hand, or its coast ended - in seconds (eased, never a jump). */
const IDLE_TAU = 0.8;
/**
 * How often its own turn is drawn, a second: at this speed under a pixel a frame either way, at half the cost of every
 * frame the screen has (a turn by hand, and its coast, drawn at every one).
 */
const IDLE_FPS = 30;

// (one clock for every sample turning on its own: each steps in the same moment, and all are drawn in one frame)
const turning = new Set<(d: number) => void>();
let clock: number | null = null;
function onClock(step: (d: number) => void): () => void {
  turning.add(step);
  if (clock == null) {
    let was = performance.now();
    clock = window.setInterval(() => {
      const now = performance.now();
      const d = Math.min((now - was) / 1000, 1 / 20);
      was = now;
      for (const f of turning) f(d);
    }, 1000 / IDLE_FPS);
  }
  return () => {
    turning.delete(step);
    if (turning.size || clock == null) return;
    window.clearInterval(clock);
    clock = null;
  };
}
/** How far, in pixels, a press goes before it turns the sample: short of it, it is a click, which picks it (`onTap`). */
const TURN_PX = 4;

/** The preview's field of view, in degrees, and how gently its camera goes to another look's distance, in seconds. */
const FOV = 30;
const FRAMING_TAU = 0.12;

/**
 * The sample molecule drawn live in a style, as a molecule on the canvas is
 * - turned by a drag, at the speed and with the coasting the style sets -
 * and double-clicked, to go over to the other look. A click - a press that
 * goes nowhere - is a click (`onTap`): a turn begins only once a press
 * has really moved. `turnOn` "molecule": only a press on the molecule's
 * atoms or bonds turns it - marked so (sampleTurn) - and any other press is
 * left to what holds it: a style's card, moved by a drag (the maintainer,
 * 2026-10-28); the pointer the turning one only over the molecule.
 */
export default function Preview3D({
  style,
  look,
  onDouble,
  onTap,
  turnOn = "anywhere",
  idle = false,
}: {
  style: Style3D;
  look: Role3D;
  onDouble?: () => void;
  onTap?: () => void;
  turnOn?: "anywhere" | "molecule";
  /** It turns by itself, slowly, all the time it is seen - but while turned by hand, taking it up again eased after (a style's card). */
  idle?: boolean;
}) {
  // (far enough back for a molecule twice the size of its space-filling self)
  const far = useMemo(() => solidOf(SAMPLE_3D, style).reach.secondary * 16, [style]);
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0, far / 2], fov: FOV, near: 0.1, far }}
      onDoubleClick={onDouble}
      // (its size as laid out, not as a card gliding into place scales it for a moment: else it kept the moment's)
      resize={{ offsetSize: true }}
      onCreated={({ gl }) => watchShaderErrors(gl)}
    >
      <ambientLight intensity={style.ambientLight} />
      <KeyLight3D intensity={style.keyLight} shadows={style.shadows} />
      <Framing style={style} look={look} />
      <Turnable style={style} look={look} onTap={onTap} turnOn={turnOn} idle={idle} />
    </Canvas>
  );
}

/**
 * The camera, as far off as the sample needs in its look to fit however it
 * is turned - going there, not jumping, when the look changes.
 */
function Framing({ style, look }: { style: Style3D; look: Role3D }) {
  const { camera, invalidate } = useThree();
  const solid = useMemo(() => solidOf(SAMPLE_3D, style), [style]);
  const placed = useRef(false);
  useEffect(() => invalidate(), [look, invalidate]);
  useFrame((_, dt) => {
    // (it stands as high as it reaches; seen from that far again, and as much once more to fit)
    const reach = solid.reach[look];
    const to = reach + (reach * 1.15) / Math.tan(((FOV / 2) * Math.PI) / 180);
    const z = camera.position.z;
    const next = placed.current ? to + (z - to) * Math.exp(-Math.min(dt, 1 / 30) / FRAMING_TAU) : to;
    placed.current = true;
    camera.position.set(0, 0, Math.abs(next - to) < 1e-3 ? to : next);
    camera.lookAt(0, 0, reach);
    if (camera.position.z !== to) invalidate();
  });
  return null;
}

/** The sample, turned by a drag as a molecule on the canvas is - at the speed, and with the coasting, the style sets. */
function Turnable({ style, look, onTap, turnOn, idle }: { style: Style3D; look: Role3D; onTap?: () => void; turnOn: "anywhere" | "molecule"; idle: boolean }) {
  // (how it is turned: read by the view as each frame is drawn - a turn, by hand or its own, draws the frame alone)
  const turn = useRef(new THREE.Quaternion(...SAMPLE_TURN));
  const { gl, invalidate, camera, scene, raycaster } = useThree();
  const spin = useRef<{ axis: THREE.Vector3; speed: number } | null>(null);
  const styleRef = useRef(style);
  styleRef.current = style;
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  // (turned by hand now, and how much of its own turn it has taken up again: 0 while held or coasting, eased to 1 after)
  const held = useRef(false);
  const own = useRef(1);
  // (seen: on the screen, and the window in front - drawn not a frame more while it is not)
  const seen = useRef(true);

  const turnBy = useCallback(
    (axis: THREE.Vector3, angle: number) => {
      turn.current.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
      invalidate();
    },
    [invalidate],
  );

  useEffect(() => {
    const dom = gl.domElement;
    // (`moved`: gone far enough from where it was pressed to be a turn, not a click)
    let drag: { x: number; y: number; t: number; recent: { t: number; angle: number; dt: number }[]; axis: THREE.Vector3; from: { x: number; y: number }; moved: boolean } | null = null;
    // (whether the pointer at `e` is on the molecule: its atoms or bonds, as the canvas would hit them)
    const onMolecule = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      return raycaster.intersectObjects(scene.children, true).length > 0;
    };
    const anywhere = turnOn === "anywhere";
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // (on a card: a press off the molecule is the card's - moved by a drag, picked by a click)
      if (!anywhere && !onMolecule(e)) return;
      markTurning(e);
      held.current = true;
      own.current = 0;
      dom.setPointerCapture(e.pointerId);
      spin.current = null;
      drag = { x: e.clientX, y: e.clientY, t: e.timeStamp, recent: [], axis: new THREE.Vector3(0, 1, 0), from: { x: e.clientX, y: e.clientY }, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      // (the turning pointer only where a press would turn it)
      if (!drag && !anywhere) setCursor(dom, onMolecule(e) ? "turn" : null);
      if (!drag) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.from.x, e.clientY - drag.from.y) < TURN_PX) return;
        drag.moved = true;
        setCursor(dom, "turning");
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const len = Math.hypot(dx, dy);
      if (!len) return;
      const angle = (styleRef.current.turnPerHalfWidth * len) / Math.max(dom.clientWidth / 2, 1);
      // (a drag to the right turns the near side right; down turns it down)
      const axis = new THREE.Vector3(dy, dx, 0).normalize();
      turnBy(axis, angle);
      drag.recent = [...drag.recent, { t: e.timeStamp, angle, dt: e.timeStamp - drag.t }].filter((r) => e.timeStamp - r.t <= 64);
      drag = { ...drag, x: e.clientX, y: e.clientY, t: e.timeStamp, axis };
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      held.current = false;
      if (!drag.moved) {
        // (a click: what it is in is picked)
        drag = null;
        if (e.type === "pointerup") tapRef.current?.();
        return;
      }
      const took = drag.recent.reduce((a, r) => a + r.dt, 0);
      const speed = drag.recent.reduce((a, r) => a + r.angle, 0) / (Math.max(took, 16) / 1000);
      if (e.timeStamp - drag.t < 80 && speed > STILL) spin.current = { axis: drag.axis, speed };
      drag = null;
      setCursor(dom, anywhere || onMolecule(e) ? "turn" : null);
      invalidate();
    };
    if (anywhere) setCursor(dom, "turn");
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
    };
  }, [gl, invalidate, camera, scene, raycaster, turnOn, turnBy]);

  // seen or not: on the screen (an IntersectionObserver) and in a window in front; seen again, drawn again
  useEffect(() => {
    if (!idle) return;
    const dom = gl.domElement;
    let onScreen = true;
    const now = () => {
      const was = seen.current;
      seen.current = onScreen && document.visibilityState === "visible";
      if (seen.current && !was) invalidate();
    };
    const watch = new IntersectionObserver((es) => {
      onScreen = es.some((x) => x.isIntersecting);
      now();
    });
    watch.observe(dom);
    document.addEventListener("visibilitychange", now);
    return () => {
      watch.disconnect();
      document.removeEventListener("visibilitychange", now);
    };
  }, [idle, gl, invalidate]);

  // its own turn, slow and calm, about the screen's upright: none while it is turned by hand or coasting, taken up again
  // eased after. Stepped by a clock of its own, not each frame: a step drawn asks for a frame, and the screen's every
  // frame would be drawn again
  useEffect(() => {
    if (!idle) return;
    return onClock((d) => {
      if (!seen.current) return;
      if (held.current || spin.current) {
        own.current = 0;
        return;
      }
      own.current = 1 - (1 - own.current) * Math.exp(-d / IDLE_TAU);
      turnBy(UPRIGHT, IDLE * own.current * d);
    });
  }, [idle, turnBy]);

  // let go while turning, it turns on, slowing as the style says
  useFrame((_, dt) => {
    const s = spin.current;
    if (!s) return;
    turnBy(s.axis, s.speed * dt);
    s.speed *= Math.pow(1 - styleRef.current.turnDamping, dt * 60);
    if (s.speed < STILL) spin.current = null;
    invalidate();
  });

  return (
    <Molecule3DView
      m={SAMPLE_3D}
      style={style}
      look={look}
      frame={0}
      turn={SAMPLE_TURN}
      turning={turn}
      lit={0}
      selected={false}
      chosen={NONE}
      chosenBonds={NONE}
      holding={null}
      following={false}
      framesOpen={false}
      onFrame={() => {}}
      hoveredMeasure={null}
      // (a sample, with no R and S on it)
      stereoShown={null}
      stereoFont={NO_STEREO_FONT}
    />
  );
}

const NO_STEREO_FONT = { size: 0, units: "px" as const, family: "", parentheses: false, gap: 0 };
const NONE: number[] = [];
