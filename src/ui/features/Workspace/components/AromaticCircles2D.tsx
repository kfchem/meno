import * as THREE from "three";
import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect } from "react";
import { useEditor } from "../store";
import {
  circlePoints,
  ringCircles,
  type LayoutOptions,
} from "../../../../lib/chem/layout2d";
import CapJoinLine from "./CapJoinLine";
import { editorLayoutOptions } from "../layoutOptions";
import { useDrawingStyle } from "../useDrawingStyle";
import { useDrawnLayout } from "./drawnLayoutContext";
import { TAU, follow } from "../../../theme/motion";

export default function AromaticCircles2D() {
  const { camera, invalidate } = useThree();
  const style = useDrawingStyle();
  const { toggleAromatic, toggleRing, aromaticEnabled, aromaticRings } =
    useEditor();
  // the rings' circles come with the rest of the drawing
  const { atoms, bonds, opts, layout, zoom } = useDrawnLayout();
  const [now, setNow] = useState(0);
  // each circle as last laid out, with how far it is in view; the preview's
  // last place, with how far it is in view
  const circleSeen = useRef(new Map<string, { level: number; c: any }>());
  const circleOn = useRef(new Set<string>());
  const previewSeen = useRef<{ level: number; on: boolean; last: { x: number; y: number; inner: number; outer: number } | null }>({
    level: 0,
    on: false,
    last: null,
  });
  const [, setFrame] = useState(0);
  useFrame((_, dt) => {
    // `now` only drives the hover ring's expand animation (~780 ms). Updating
    // it on every frame re-rendered this component continuously, which would
    // defeat on-demand rendering.
    if (hoverStart != null && performance.now() - hoverStart < 780) {
      setNow(performance.now());
      invalidate();
    }
    const d = Math.min(dt, 1 / 20);
    let moving = false;
    for (const [k, e] of circleSeen.current) {
      const to = circleOn.current.has(k) ? 1 : 0;
      if (e.level !== to) {
        const n = follow(e.level, to, d, TAU.quick);
        e.level = Math.abs(n - to) < 0.01 ? to : n;
        moving = true;
      }
      if (e.level === 0 && to === 0) circleSeen.current.delete(k);
    }
    const p = previewSeen.current;
    const pTo = p.on ? 1 : 0;
    if (p.level !== pTo) {
      const n = follow(p.level, pTo, d, TAU.quick);
      p.level = Math.abs(n - pTo) < 0.01 ? pTo : n;
      moving = true;
    }
    if (moving) {
      setFrame((f) => f + 1);
      invalidate();
    }
  });

  // hover-preview ring after 500ms over ring center; enabled state is stored per-ring in store
  const [hoverCenter, setHoverCenter] = useState<{
    x: number;
    y: number;
    r: number;
  } | null>(null);
  const [hoverStart, setHoverStart] = useState<number | null>(null);

  // Every ring's circle, as it would be drawn turned on, to discover ring
  // centers even when enabled=false: the circles alone, not the drawing
  // laid out again with them, and the same at any zoom - worked out when
  // the pointer looks for one, for the drawing as it stands then, rather
  // than at every frame the drawing moves (a drag, a glide)
  const prevOpts: LayoutOptions = useMemo(
    () =>
      editorLayoutOptions(style, { aromaticCircle: true }),
    [style]
  );
  const drawing = useRef({ atoms, bonds, prevOpts });
  drawing.current = { atoms, bonds, prevOpts };
  const ringsFound = useRef<{
    of: typeof drawing.current;
    centers: Array<{ x: number; y: number; r: number; key?: string }>;
  } | null>(null);
  // Detect approximate ring centers to use as hover targets
  const previewCenters = () => {
    const now = drawing.current;
    const was = ringsFound.current;
    if (was && was.of.atoms === now.atoms && was.of.bonds === now.bonds && was.of.prevOpts === now.prevOpts) {
      return was.centers;
    }
    const cs: Array<{ x: number; y: number; r: number; key?: string }> = [];
    for (const c of ringCircles(now.atoms, now.bonds, now.prevOpts).circles)
      if (c) cs.push({ x: c.c.x, y: c.c.y, r: c.r, key: c.key });
    ringsFound.current = { of: now, centers: cs };
    return cs;
  };

  const { gl } = useThree();

  // keep latest hover state in refs to avoid stale closures in DOM handlers
  const hoverCenterRef = useRef<typeof hoverCenter>(null);
  const hoverStartRef = useRef<number | null>(null);
  const pendingToggleRef = useRef(false);
  useEffect(() => {
    hoverCenterRef.current = hoverCenter;
  }, [hoverCenter]);
  useEffect(() => {
    hoverStartRef.current = hoverStart;
  }, [hoverStart]);

  // DOM event listeners on the canvas element; no raycast needed
  React.useEffect(() => {
    const el = gl.domElement as HTMLElement;
    if (!el) return;
    // a ring's circle within 40 px of the pointer, the nearest
    const circleAt = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const cw = el.clientWidth || 1;
      const ch = el.clientHeight || 1;
      let found: { x: number; y: number; r: number; key?: string } | null = null;
      let minD = Infinity;
      for (const c of previewCenters()) {
        const v = new THREE.Vector3(c.x, c.y, 0).project(camera as THREE.Camera);
        const d = Math.hypot(cx - ((v.x + 1) / 2) * cw, cy - ((-v.y + 1) / 2) * ch);
        if (d < 40 && d < minD) {
          found = { x: c.x, y: c.y, r: c.r, key: c.key };
          minD = d;
        }
      }
      return found;
    };
    const dwelt = () => {
      const hs = hoverStartRef.current;
      return hs != null && performance.now() - hs >= 500;
    };
    const onMove = (e: PointerEvent) => {
      const found = circleAt(e);
      if (found) {
        // (the hover as it is now, not as it was when these were set up:
        // a move over the same circle does not start its wait again)
        const was = hoverCenterRef.current;
        const changed = !was || Math.hypot(was.x - found.x, was.y - found.y) > 1e-6;
        if (changed) setHoverStart(performance.now());
        setHoverCenter(found);
      } else {
        setHoverCenter(null);
        setHoverStart(null);
      }
    };
    const onClick = (e: MouseEvent) => {
      // recompute hit at click time
      const found = circleAt(e);
      if ((pendingToggleRef.current && found) || (found && dwelt())) {
        if (found?.key) toggleRing(found.key);
        else toggleAromatic();
        pendingToggleRef.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onPointerDownCapture = (e: PointerEvent) => {
      if (circleAt(e) && dwelt()) {
        pendingToggleRef.current = true; // mark for click to handle once
        e.stopPropagation();
        e.preventDefault();
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("click", onClick);
    // capture to precede React handlers that might consume click for other tools
    el.addEventListener("pointerdown", onPointerDownCapture, {
      capture: true,
    } as any);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerdown", onPointerDownCapture, {
        capture: true,
      } as any);
    };
  }, [gl, camera, toggleRing, toggleAromatic]);

  // Each circle comes into view as it is turned on - opening out a little
  // as it fades in - and goes out of it as it is turned off; the preview of
  // one fades in and out the same way (TAU.quick).
  const circlesNow = ((layout as any).circles ?? []) as any[];
  {
    const now = new Set<string>();
    circlesNow.forEach((c, i) => {
      const k = c.key ?? `circle-${i}`;
      now.add(k);
      const e = circleSeen.current.get(k) ?? { level: 0, c };
      e.c = c;
      circleSeen.current.set(k, e);
    });
    circleOn.current = now;
  }
  const preview = (() => {
    if (!hoverCenter || hoverStart == null) return null;
    const dt = now - hoverStart; // ms since hover
    if (dt < 500) return null;
    const t = Math.min(1, (dt - 500) / 220);
    const ease = 1 - Math.pow(1 - t, 3);
    const targetR = hoverCenter.r * 0.5; // match layout default scaling
    const thicknessWorld = Math.max(prevOpts.lineWidthPx / Math.max(zoom, 1e-6), targetR * 0.06);
    const outer = Math.max(thicknessWorld * 1.2, targetR * (0.7 + 0.3 * ease));
    const inner = Math.max(0, outer - thicknessWorld);
    // (none for a ring whose circle is already on)
    const alreadyOn = (hoverCenter as any).key ? !!aromaticRings[(hoverCenter as any).key] : aromaticEnabled;
    if (alreadyOn) return null;
    return { x: hoverCenter.x, y: hoverCenter.y, inner, outer };
  })();
  if (preview) previewSeen.current.last = preview;
  previewSeen.current.on = !!preview;
  const lastPreview = previewSeen.current.last;
  return (
    <group>
      {[...circleSeen.current.entries()].map(([k, { level, c }]) => {
        // (an ellipse, for a ring seen in perspective)
        const grow = 0.85 + 0.15 * level;
        const pts: [number, number, number][] = circlePoints(c).map((p) => [
          c.c.x + (p.x - c.c.x) * grow,
          c.c.y + (p.y - c.c.y) * grow,
          0,
        ]);
        const lw =
          opts.units === "world"
            ? opts.lineWidthPx * Math.max(zoom, 1e-6)
            : opts.lineWidthPx;
        return (
          <CapJoinLine
            key={k}
            points={pts}
            color={c.color ?? opts.bondColor ?? "black"}
            lineWidth={lw}
            cap="butt"
            join="miter"
            miterLimit={2}
            depthTest={false}
            depthWrite={false}
            renderOrder={25}
            opacity={level}
          />
        );
      })}
      {/* hover preview ring (gray), opening out as it fades in */}
      {lastPreview && previewSeen.current.level > 0 && (
        <mesh position={[lastPreview.x, lastPreview.y, 0]} renderOrder={24}>
          <ringGeometry args={[lastPreview.inner, lastPreview.outer, 64]} />
          <meshBasicMaterial
            color="#999"
            transparent
            opacity={0.85 * previewSeen.current.level}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
