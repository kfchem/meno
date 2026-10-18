import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import {
  LOOK_3D_FIELDS,
  look3dPreset,
  lookOfStyle,
  ownStyle3d,
  SCENE_3D,
  SCENE_3D_FIELDS,
  style3dOf,
  styleName3d,
  withAtomColour,
  withLookSetting,
  withSharedSetting,
  type MoleculeLook,
  type Role3D,
  type Scene3D,
  type Style3DChoice,
  type Style3DField,
} from "../../../lib/chem/style3d";
import { endsShow } from "../Workspace/utils/molecule3d";
import HideHydrogensAsk from "./HideHydrogensAsk";
import { useAtLeastWide } from "./sideBySide";
import Preview3D from "./Preview3D";
import StylePicker3D from "./StylePicker3D";
import AtomColours from "./AtomColours";

/**
 * How molecules in 3D look and turn (docs/WORKSPACE.md, *Styles in 3D*):
 * the primary and the secondary - every molecule's look to begin with, and
 * the one a double-click away - and the other styles, built in and the
 * user's own (./StylePicker3D); each set as the drawing style is
 * (./StyleEditor) - a built-in one's changes kept apart, to be taken back;
 * the user's own set as a whole - and what they all share, the light and
 * the turning. Beside them a molecule drawn in the style being set,
 * which can be turned, to try how turning feels, and double-clicked, to go
 * over to the other look as a molecule on the canvas does.
 */
export default function Style3DEditor({
  choice,
  onChange,
}: {
  choice: Style3DChoice;
  onChange: (next: Style3DChoice) => void;
}) {
  const style = useMemo(() => style3dOf(choice), [choice]);
  // the style being set - and shown - and the one asking to hide its hydrogens
  const [chosen, setEditing] = useState(choice.primary);
  // (one of the user's own, deleted: the primary instead)
  const editing = ownStyle3d(choice, chosen) || look3dPreset(chosen).id === chosen ? chosen : choice.primary;
  const [asking, setAsking] = useState<string | null>(null);
  const own = !!ownStyle3d(choice, editing);
  const editedName = styleName3d(choice, editing);
  // (what a setting goes back to: a built-in style's own; the user's own, as it is - nothing to go back to)
  const edited = own ? lookOfStyle(choice, editing) : look3dPreset(editing).look;
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
  // (side by side with the preview only where there is room for both: else the preview above, as the drawing's editor has it)
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const roomy = useAtLeastWide(box);
  const lookGroups = [...new Set(LOOK_3D_FIELDS.map((f) => f.group))];
  const sharedGroups = [...new Set(SCENE_3D_FIELDS.map((f) => f.group))];
  return (
    <div ref={setBox} className={roomy ? "flex gap-8 items-start" : "flex flex-col gap-6"}>
      <div className="min-w-0 flex-1">
        <StylePicker3D choice={choice} style={style} editing={editing} onEdit={setEditing} onChange={onChange} />
        <div className="mt-6 flex items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold text-gh-black">
            {editedName}
            {own && <span className="ml-2 text-xs font-normal text-gh-gray">Your style</span>}
          </h3>
          {changed > 0 && (
            <button
              onClick={() => onChange({ ...choice, looks: Object.fromEntries(Object.entries(choice.looks).filter(([id]) => id !== editing)) })}
              className="h-8 px-3 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base whitespace-nowrap"
              title={`Take all ${changed} changes to ${editedName} back`}
            >
              Reset {editedName} ({changed})
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
                  stacked={!roomy}
                  field={f}
                  value={look[f.key]}
                  changed={f.key in changes}
                  was={{ value: edited[f.key], from: editedName }}
                  onSet={(v) => setLook(f.key, v as never)}
                  warn={f.key === "hydrogens" && look.hydrogens === "carbonHidden"}
                  // (what space-filling has none of, or sticks alone, or bond ends its balls cover: there, but faint)
                  faint={
                    (look.atoms === "space" && STICKS_ONLY.has(f.key)) ||
                    (look.atoms === "sticks" && f.key === "ballScale") ||
                    (f.key === "doubleEnds" && !endsShow(look, 2)) ||
                    (f.key === "tripleEnds" && !endsShow(look, 3))
                  }
                  // (what another setting makes moot - how deep a shade there is none of)
                  off={!!f.unless && look[f.unless.key as keyof typeof look] === f.unless.is}
                />
              ))}
            </div>
          </section>
        ))}
        <AtomColours
          look={look}
          preset={own ? { ...look, colours: {} } : edited}
          onSet={(el, colour) => onChange(withAtomColour(choice, editing, el, colour))}
          onReset={(els) => onChange(els.reduce((c, el) => withAtomColour(c, editing, el, null), choice))}
        />
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
                  stacked={!roomy}
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
      </div>
      <div className={roomy ? "w-[26rem] shrink-0 sticky top-4" : "order-first"}>
        {/* (what it shows, said: the style being set, as a molecule in it is drawn) */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-gh-gray">Preview</span>
          <span className="min-w-0 truncate text-sm font-medium text-gh-black">{editedName}</span>
        </div>
        <div className="mt-2 h-80 rounded-lg border border-gh-line bg-white overflow-hidden" aria-label={`A molecule drawn in ${editedName}`}>
          <Preview3D style={shownStyle} look={shownLook} onDouble={() => setEditing(choice[other])} />
        </div>
        <p className="mt-1.5 text-[11px] text-gh-gray">
          A molecule in {editedName}, the style being set, as it looks on the canvas and in exported pictures. Drag it to turn it;
          double-click it for {styleName3d(choice, choice[other])}.
        </p>
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

// --- One setting ---------------------------------------------------------------

export function Row({
  field,
  value,
  changed,
  was,
  onSet,
  warn,
  faint,
  off,
  stacked,
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
  /** Moot as another setting is: shown faintly, and not to be set. */
  off?: boolean;
  /** Its control under its words, not beside them: where the editor is narrow. */
  stacked?: boolean;
}) {
  return (
    <div
      className={clsx(
        "px-3 py-2.5 relative transition-opacity duration-150 ease-meno",
        warn ? "bg-accel-lightaccent/40" : changed && "bg-accel-lightbase/15",
        (faint || off) && "opacity-50",
      )}
      aria-disabled={off || undefined}
    >
      {(changed || warn) && (
        <span aria-hidden className={clsx("absolute left-0 top-2 bottom-2 w-0.5 rounded-full", warn ? "bg-accel-accent" : "bg-accel-base")} />
      )}
      <div className={clsx("flex gap-3", stacked ? "flex-col items-stretch gap-2" : "items-start")}>
        <div className="min-w-0 flex-1">
          <div className={clsx("text-sm", warn ? "text-accel-accent font-medium" : "text-gh-black")}>{field.label}</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5 max-w-2xl">{field.description}</p>
        </div>
        <div className={clsx("shrink-0 flex items-center gap-1.5", stacked ? "justify-end" : "pt-0.5", off && "pointer-events-none")} inert={off || undefined}>
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
