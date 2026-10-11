import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { setCursor } from "../../theme/cursors";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import clsx from "clsx";
import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import {
  KEY_LIGHT_FROM,
  LOOK_3D_FIELDS,
  LOOK_3D_PRESETS,
  look3dPreset,
  lookOfStyle,
  SCENE_3D,
  SCENE_3D_FIELDS,
  style3dOf,
  withLookSetting,
  withRole,
  withSharedSetting,
  type MoleculeLook,
  type Role3D,
  type Scene3D,
  type Style3D,
  type Style3DChoice,
  type Style3DField,
} from "../../../lib/chem/style3d";
import type { Turn3D } from "../Workspace/store/types";
import Molecule3DView from "../Workspace/components/Molecule3DView";
import { solidOf } from "../Workspace/utils/molecule3d";
import HideHydrogensAsk from "./HideHydrogensAsk";
import { SAMPLE_3D } from "./sample3d";

/**
 * How molecules in 3D look and turn (docs/WORKSPACE.md, *Styles in 3D*): a
 * list of styles, each set as the drawing style is (./StyleEditor), of
 * which one is the primary - every molecule's look to begin with - and one
 * the secondary, a double-click away; and what they all share, the light
 * and the turning. Beside them a molecule drawn in the style being set,
 * which can be turned, to try how turning feels, and double-clicked, to go
 * over to the other look as a molecule on the canvas does.
 */
export default function Style3DEditor({
  choice,
  onChange,
  children,
}: {
  choice: Style3DChoice;
  onChange: (next: Style3DChoice) => void;
  /** More settings, laid out with these: who makes molecules in 3D, say. */
  children?: ReactNode;
}) {
  const style = useMemo(() => style3dOf(choice), [choice]);
  // the style being set - and shown - and the one asking to hide its hydrogens
  const [editing, setEditing] = useState(choice.primary);
  const [asking, setAsking] = useState<string | null>(null);
  const edited = look3dPreset(editing);
  const look = lookOfStyle(choice, editing);
  const changes = choice.looks[editing] ?? {};
  const changed = Object.keys(changes).length;
  const sharedChanged = Object.keys(choice.shared).length;
  // (shown as a molecule on the canvas is: in its role's look, going over to
  // the other's - or, a style with no role, on its own)
  const role: Role3D | null = editing === choice.primary ? "primary" : editing === choice.secondary ? "secondary" : null;
  const shownStyle = useMemo(() => (role ? style : { ...style, primary: look }), [role, style, look]);
  const shownLook: Role3D = role ?? "primary";
  const other: Role3D = shownLook === "primary" ? "secondary" : "primary";
  const setLook = <K extends keyof MoleculeLook>(key: K, value: MoleculeLook[K]) => {
    // (hiding the hydrogens is asked first, every time)
    if (key === "hydrogens" && value === "carbonHidden" && look.hydrogens !== "carbonHidden") setAsking(editing);
    else onChange(withLookSetting(choice, editing, key, value));
  };
  const lookGroups = [...new Set(LOOK_3D_FIELDS.map((f) => f.group))];
  const sharedGroups = [...new Set(SCENE_3D_FIELDS.map((f) => f.group))];
  return (
    <div className="flex gap-8 items-start">
      <div className="min-w-0 flex-1">
        <Styles choice={choice} editing={editing} onEdit={setEditing} onChange={onChange} />
        <div className="mt-6 flex items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold text-gh-black">{edited.name}</h3>
          {changed > 0 && (
            <button
              onClick={() => onChange({ ...choice, looks: Object.fromEntries(Object.entries(choice.looks).filter(([id]) => id !== editing)) })}
              className="h-8 px-3 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base whitespace-nowrap"
              title={`Take all ${changed} changes to ${edited.name} back`}
            >
              Reset {edited.name} ({changed})
            </button>
          )}
        </div>
        {lookGroups.map((group) => (
          <section key={group} className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gh-gray">{group}</h4>
            <div className="mt-2 rounded-lg border border-gh-line divide-y divide-gh-line bg-white">
              {LOOK_3D_FIELDS.filter((f) => f.group === group).map((f) => (
                <Row
                  key={f.key}
                  field={f}
                  value={look[f.key]}
                  changed={f.key in changes}
                  was={{ value: edited.look[f.key], from: edited.name }}
                  onSet={(v) => setLook(f.key, v as never)}
                  warn={f.key === "hydrogens" && look.hydrogens === "carbonHidden"}
                  // (what space-filling has none of: there, but faint)
                  faint={look.atoms === "space" && STICKS_ONLY.has(f.key)}
                />
              ))}
            </div>
          </section>
        ))}
        <div className="mt-8 flex items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold text-gh-black">Every style</h3>
          {sharedChanged > 0 && (
            <button
              onClick={() => onChange({ ...choice, shared: {} })}
              className="h-8 px-3 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base whitespace-nowrap"
              title={`Take all ${sharedChanged} changes back to Meno's`}
            >
              Reset ({sharedChanged})
            </button>
          )}
        </div>
        {sharedGroups.map((group) => (
          <section key={group} className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gh-gray">{group}</h4>
            <div className="mt-2 rounded-lg border border-gh-line divide-y divide-gh-line bg-white">
              {SCENE_3D_FIELDS.filter((f) => f.group === group).map((f) => (
                <Row
                  key={f.key}
                  field={f}
                  value={style[f.key]}
                  changed={f.key in choice.shared}
                  was={{ value: SCENE_3D[f.key], from: "Meno" }}
                  onSet={(v) => onChange(withSharedSetting(choice, f.key, v as Scene3D[typeof f.key]))}
                />
              ))}
            </div>
          </section>
        ))}
        {children}
      </div>
      <div className="w-[26rem] shrink-0 sticky top-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-gh-gray">Preview</div>
        <div className="mt-2 h-80 rounded-lg border border-gh-line bg-white overflow-hidden" aria-label={`A molecule drawn in ${edited.name}`}>
          <Preview style={shownStyle} look={shownLook} onDouble={() => setEditing(choice[other])} />
        </div>
        <p className="mt-1.5 text-[11px] text-gh-gray">Drag the molecule to turn it; double-click it for {look3dPreset(choice[other]).name}.</p>
      </div>
      <AnimatePresence>
        {asking && (
          <HideHydrogensAsk
            onKeep={() => setAsking(null)}
            onHide={() => {
              onChange(withLookSetting(choice, asking, "hydrogens", "carbonHidden"));
              setAsking(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** A style's settings for its balls and sticks, which space-filling draws none of. */
const STICKS_ONLY = new Set<string>(["ballScale", "bondRadius", "bondColor"]);

// --- The styles ----------------------------------------------------------------

/**
 * The list of styles: each with what it looks like, chosen to be set by a
 * click; and which is the primary and which the secondary, each given by a
 * press on its name in the style's card - which sets and shows that style
 * too; given the other's, the two change places.
 */
function Styles({
  choice,
  editing,
  onEdit,
  onChange,
}: {
  choice: Style3DChoice;
  editing: string;
  onEdit: (id: string) => void;
  onChange: (next: Style3DChoice) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2" role="list" aria-label="Styles">
      {LOOK_3D_PRESETS.map((p) => {
        const on = p.id === editing;
        const changed = Object.keys(choice.looks[p.id] ?? {}).length > 0;
        return (
          <div
            key={p.id}
            role="listitem"
            onClick={() => onEdit(p.id)}
            className={clsx(
              "text-left rounded-lg border px-3 pt-2 pb-2.5 cursor-pointer transition-colors",
              on ? "border-accel-base bg-accel-lightbase/40 ring-1 ring-accel-base" : "border-gh-line bg-white hover:bg-gh-base",
            )}
          >
            <button className="block w-full text-left" aria-pressed={on} onClick={() => onEdit(p.id)}>
              <div className="text-sm font-medium text-gh-black">
                {p.name}
                {changed && <span className="ml-1 text-accel-base" title="Changed">•</span>}
              </div>
              <div className="text-[11px] leading-snug text-gh-gray line-clamp-2">{p.description}</div>
            </button>
            <div className="mt-2 flex gap-1" role="group" aria-label={`${p.name}'s role`}>
              {(["primary", "secondary"] as const).map((role) => {
                const is = choice[role] === p.id;
                return (
                  <button
                    key={role}
                    aria-pressed={is}
                    onClick={(e) => {
                      // (and it is the style set and shown)
                      e.stopPropagation();
                      onChange(withRole(choice, role, p.id));
                      onEdit(p.id);
                    }}
                    className={clsx(
                      "h-6 px-2 rounded-full border text-[11px] transition-colors",
                      is ? "border-accel-base bg-accel-base text-white" : "border-gh-line bg-white text-gh-gray hover:text-gh-black hover:bg-gh-base",
                    )}
                  >
                    {role === "primary" ? "Primary" : "Secondary"}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- One setting ---------------------------------------------------------------

function Row({
  field,
  value,
  changed,
  was,
  onSet,
  warn,
  faint,
}: {
  field: Style3DField;
  value: unknown;
  changed: boolean;
  /** What it is unchanged, and whose value that is. */
  was: { value: unknown; from: string };
  onSet: (v: unknown) => void;
  /** Set as it misleads: marked so. */
  warn?: boolean;
  /** Of nothing the style draws: shown faintly. */
  faint?: boolean;
}) {
  return (
    <div
      className={clsx(
        "px-3 py-2.5 relative transition-opacity duration-150 ease-meno",
        warn ? "bg-accel-lightaccent/40" : changed && "bg-accel-lightbase/15",
        faint && "opacity-50",
      )}
    >
      {(changed || warn) && (
        <span aria-hidden className={clsx("absolute left-0 top-2 bottom-2 w-0.5 rounded-full", warn ? "bg-accel-accent" : "bg-accel-base")} />
      )}
      <div className="flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className={clsx("text-sm", warn ? "text-accel-accent font-medium" : "text-gh-black")}>{field.label}</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5">{field.description}</p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
          <Control field={field} value={value} onSet={onSet} />
          <button
            onClick={() => onSet(was.value)}
            disabled={!changed}
            aria-label={`Reset ${field.label}`}
            title={changed ? `Back to ${was.from}'s value` : "Not changed"}
            className="h-6 w-6 rounded-md flex items-center justify-center text-gh-gray hover:bg-gh-base hover:text-gh-black disabled:opacity-0"
          >
            <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Control({ field, value, onSet }: { field: Style3DField; value: unknown; onSet: (v: unknown) => void }) {
  if (field.kind === "choice") {
    return (
      <div className="flex rounded-md border border-gh-line overflow-hidden" role="radiogroup" aria-label={field.label}>
        {field.options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onSet(o.value)}
            className={clsx(
              "h-7 px-2.5 text-xs border-l border-gh-line first:border-l-0",
              value === o.value ? "bg-accel-base text-white" : "bg-white text-gh-black hover:bg-gh-base",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (field.kind === "colour") {
    const hex = String(value);
    return (
      <label className="flex items-center gap-1.5">
        <input
          type="color"
          value={hex}
          aria-label={field.label}
          onChange={(e) => onSet(e.target.value.toLowerCase())}
          className="h-7 w-9 rounded border border-gh-line bg-white p-0.5"
        />
        <span className="text-xs text-gh-gray tabular-nums w-16">{hex}</span>
      </label>
    );
  }
  const v = value as number;
  const shown = (v * (field.scale ?? 1)).toFixed(field.digits ?? 2);
  return (
    <div className="flex items-center gap-2">
      {field.ends && <span className="text-[11px] text-gh-gray w-20 text-right">{field.ends[0]}</span>}
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={v}
        aria-label={field.label}
        onChange={(e) => onSet(Number(e.target.value))}
        className="w-36 accent-accel-base"
      />
      {field.ends ? (
        <span className="text-[11px] text-gh-gray w-20">{field.ends[1]}</span>
      ) : (
        <span className="text-xs text-gh-black tabular-nums w-14">
          {shown}
          {field.unit === "%" || field.unit === "°" ? field.unit : ` ${field.unit ?? ""}`}
        </span>
      )}
    </div>
  );
}

// --- Preview -------------------------------------------------------------------

/** A turn left to itself stops below this speed, in radians a second. */
const STILL = 0.02;
/** How the sample is first seen: tipped back a little and turned, so its ring is not seen edge on. */
const FIRST_TURN = (() => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.35, 0.1));
  return [q.x, q.y, q.z, q.w] as Turn3D;
})();

/** The preview's field of view, in degrees, and how gently its camera goes to another look's distance, in seconds. */
const FOV = 30;
const FRAMING_TAU = 0.12;

function Preview({ style, look, onDouble }: { style: Style3D; look: Role3D; onDouble: () => void }) {
  // (far enough back for a molecule twice the size of its space-filling self)
  const far = useMemo(() => solidOf(SAMPLE_3D, style).reach.secondary * 16, [style]);
  return (
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [0, 0, far / 2], fov: FOV, near: 0.1, far }} onDoubleClick={onDouble}>
      <ambientLight intensity={style.ambientLight} />
      <directionalLight position={KEY_LIGHT_FROM as [number, number, number]} intensity={style.keyLight} />
      <Framing style={style} look={look} />
      <Turnable style={style} look={look} />
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
function Turnable({ style, look }: { style: Style3D; look: Role3D }) {
  const [turn, setTurn] = useState<Turn3D>(FIRST_TURN);
  const { gl, invalidate } = useThree();
  const spin = useRef<{ axis: THREE.Vector3; speed: number } | null>(null);
  const styleRef = useRef(style);
  styleRef.current = style;
  const turnBy = (axis: THREE.Vector3, angle: number) =>
    setTurn((was) => {
      const q = new THREE.Quaternion(...was).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
      return [q.x, q.y, q.z, q.w];
    });

  useEffect(() => {
    const dom = gl.domElement;
    let drag: { x: number; y: number; t: number; recent: { t: number; angle: number; dt: number }[]; axis: THREE.Vector3 } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dom.setPointerCapture(e.pointerId);
      spin.current = null;
      drag = { x: e.clientX, y: e.clientY, t: e.timeStamp, recent: [], axis: new THREE.Vector3(0, 1, 0) };
      setCursor(dom, "turning");
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
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
      const took = drag.recent.reduce((a, r) => a + r.dt, 0);
      const speed = drag.recent.reduce((a, r) => a + r.angle, 0) / (Math.max(took, 16) / 1000);
      if (e.timeStamp - drag.t < 80 && speed > STILL) spin.current = { axis: drag.axis, speed };
      drag = null;
      setCursor(dom, "turn");
      invalidate();
    };
    setCursor(dom, "turn");
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
  }, [gl, invalidate]);

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
      turn={turn}
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
