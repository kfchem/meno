import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { valuesOf, type OptionValues } from "../../../../lib/options";
import { roleOptionsRole } from "../../../../lib/plugins/roles";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import OptionsForm from "../../../options/OptionsForm";
import type { PythonPlugin } from "../../../../lib/calc/catalog";
import type { Motion, RenderAsk } from "./renderScene";
import { askOf, remembered, renderOptions, type Kind } from "./renderOptions";
import { useInFront } from "../../../layouts/inFront";

/**
 * Render, asked before it begins (docs/RENDER.md): a picture or a film;
 * Meno's own choices for it - its size and shape, a film's motion, length
 * and rate, what its molecules and surfaces are made of - and the options
 * of the plugin that renders, as its manifest declares them, each the last
 * chosen. A card over the canvas, as Export's is, so that what is rendered
 * stays in view.
 */
export default function RenderCard({
  plugin,
  motions,
  surfaces,
  onRender,
  onCancel,
}: {
  plugin: PythonPlugin;
  /** How what is rendered can move in a film: turning, always; through its frames, where one has them; in a vibration, where one shows it. */
  motions: readonly Motion[];
  /** Whether what is rendered shows a surface. */
  surfaces: boolean;
  onRender: (ask: RenderAsk, options: OptionValues) => void;
  onCancel: () => void;
}) {
  const saved = useAppSettings((s) => s.options);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  const [kind, setKind] = useState<Kind>(saved.render?.kind === "film" ? "film" : "picture");
  // (the looks this plugin declares, after the canvas's)
  const own = renderOptions(kind, motions, surfaces, plugin.roleLooks.render, plugin.roleMotions.render);
  const theirs = (plugin.roleOptions.render ?? []).filter((o) => kind === "film" || o.id !== "quality");
  const [chosen, setChosen] = useState<Partial<Record<Kind, OptionValues>>>({});
  const [chosenTheirs, setChosenTheirs] = useState<OptionValues | null>(null);
  const values = chosen[kind] ?? valuesOf(own, saved[remembered(kind)]);
  const theirValues = chosenTheirs ?? valuesOf(plugin.roleOptions.render ?? [], saved[roleOptionsRole("render")]);

  const renderRef = useRef<HTMLButtonElement>(null);
  // (the keys given to Render as it opens, once: not again each time the
  // canvas round it is drawn, which took them from the option being set)
  useEffect(() => {
    renderRef.current?.focus();
  }, []);
  // (Escape cancels while its tab is in front: in another tab it is that tab's, the card waiting)
  const inFront = useInFront();
  useEffect(() => {
    if (!inFront) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, inFront]);

  const go = () => {
    rememberOptions("render", { kind });
    rememberOptions(remembered(kind), values);
    rememberOptions(roleOptionsRole("render"), theirValues);
    onRender(askOf(kind, values), theirValues);
  };

  return (
    <motion.div
      role="dialog"
      aria-labelledby="render-title"
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[380px] max-w-[90%] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-gh-line bg-white/95 shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="render-title" className="font-semibold mb-2">
        Render
      </h2>
      <div role="radiogroup" aria-label="What is rendered" className="flex flex-wrap gap-1.5 mb-3">
        {(["picture", "film"] as const).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={k === kind}
            onClick={() => setKind(k)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors duration-150 ease-meno ${
              k === kind ? "border-accel-base bg-accel-lightbase text-gh-black" : "border-gh-line text-gh-gray hover:bg-gray-100"
            }`}
          >
            {k === "picture" ? "Picture" : "Film"}
          </button>
        ))}
      </div>
      <motion.div key={kind} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} className="mb-3">
        <OptionsForm options={own} values={values} onChange={(v) => setChosen((c) => ({ ...c, [kind]: v }))} />
      </motion.div>
      {theirs.length > 0 && (
        <section className="mb-3 border-t border-gh-line pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gh-gray">{plugin.name}</h3>
          <OptionsForm options={theirs} values={theirValues} onChange={setChosenTheirs} context={values} />
        </section>
      )}
      {/* (kept in view at the card's foot, however many options there are above) */}
      <div className="sticky -bottom-3 -mx-3 -mb-3 flex justify-end gap-2 bg-white/95 px-3 pb-3 pt-2">
        <button onClick={onCancel} className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100">
          Cancel
        </button>
        <button ref={renderRef} onClick={go} className="rounded-md border border-accel-base bg-accel-lightbase px-3 py-1.5 hover:brightness-95">
          Render
        </button>
      </div>
    </motion.div>
  );
}
