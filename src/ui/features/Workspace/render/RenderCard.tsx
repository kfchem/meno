import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { shownOptions, valuesOf, type OptionValues } from "../../../../lib/options";
import { roleOptionsRole } from "../../../../lib/plugins/roles";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import OptionsForm from "../../../options/OptionsForm";
import type { PythonPlugin } from "../../../../lib/calc/catalog";
import type { Motion, RenderAsk } from "./renderScene";
import { askOf, bySection, filmLength, remembered, renderContext, renderOptions, withFixed, type Kind } from "./renderOptions";
import { OPTION_SECTIONS, type OptionSection } from "../../../../lib/options";
import { useInFront } from "../../../layouts/inFront";
import { escapeLeft } from "../../../controls/keys";

/** What each part of the card is called. */
const PART_NAMES: Record<OptionSection, string> = { look: "Look", render: "Render", scene: "Scene", motion: "Motion" };

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
  molecules = 1,
  onRender,
  onCancel,
}: {
  plugin: PythonPlugin;
  /** How what is rendered can move in a film: turning, always; through its frames, where one has them; in a vibration, where one shows it. */
  motions: readonly Motion[];
  /** Whether what is rendered shows a surface. */
  surfaces: boolean;
  /** How many molecules are rendered: a film that changes one into the next is as long as its changes need. */
  molecules?: number;
  onRender: (ask: RenderAsk, options: OptionValues) => void;
  onCancel: () => void;
}) {
  const saved = useAppSettings((s) => s.options);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  const [kind, setKind] = useState<Kind>(saved.render?.kind === "film" ? "film" : "picture");
  // (the looks this plugin declares, after the canvas's)
  const declared = plugin.roleMotions.render;
  const plain = renderOptions(kind, motions, surfaces, plugin.roleLooks.render, declared);
  // (the plugin's own options, each shown `when` it says - of the card's options, or a picture's or a film's, `kind`)
  const theirs = plugin.roleOptions.render ?? [];
  const [chosen, setChosen] = useState<Partial<Record<Kind, OptionValues>>>({});
  const [chosenTheirs, setChosenTheirs] = useState<OptionValues | null>(null);
  const picked = chosen[kind] ?? valuesOf(plain, saved[remembered(kind)]);
  const theirValues = chosenTheirs ?? valuesOf(plugin.roleOptions.render ?? [], saved[roleOptionsRole("render")]);
  // (a film no shorter than its motion can be read in - for a change, its changes' - a length chosen before raised to it)
  const { length, values: lengthened } = filmLength(kind, picked, declared, molecules);
  // (what the motion is always made with, shown so and said why, whatever was chosen: Meno's own choices and the renderer's)
  const fixed = kind === "film" ? declared?.find((d) => d.id === lengthened.motion)?.fixed : undefined;
  const mine = withFixed(renderOptions(kind, motions, surfaces, plugin.roleLooks.render, declared, length), lengthened, fixed);
  const yours = withFixed(theirs, theirValues, fixed);
  const values = mine.values;
  const own = mine.options;
  const ours = bySection(own);
  const setMine = (v: OptionValues) => setChosen((c) => ({ ...c, [kind]: v }));
  // (the renderer's options are told the card's choices and what is rendered, `kind`; a part with none of them shown has no heading)
  const theirContext = renderContext(values, kind);
  const its = bySection(shownOptions(yours.options, yours.values, theirContext));

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
    // (not an Escape one of its lists has had, closing it)
    const onKey = (e: KeyboardEvent) => {
      if (!escapeLeft(e)) return;
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
    onRender(askOf(kind, values), yours.values);
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
              k === kind ? "border-accel-base bg-accel-lightbase text-gh-black" : "border-gh-line text-gh-gray hover:bg-gh-base"
            }`}
          >
            {k === "picture" ? "Picture" : "Film"}
          </button>
        ))}
      </div>
      <motion.div key={kind} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}>
        {/* (one card, in its parts - what the molecules look like, how it is rendered, the scene, a film's motion - Meno's own
            choices and the renderer's in each, where the renderer says they belong; those it does not place, last, under its name) */}
        {[...OPTION_SECTIONS.filter((p) => kind === "film" || p !== "motion"), "own" as const].map((part, i) => {
          if (!ours[part].length && !its[part].length) return null;
          return (
            <section key={part} className={`mb-3 ${i > 0 ? "border-t border-gh-line pt-3" : ""}`}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gh-gray">{part === "own" ? plugin.name : PART_NAMES[part]}</h3>
              {/* (Meno's own first, then the renderer's - a look's own choices just under it - and what Meno folds, last) */}
              <div className="space-y-3">
                {ours[part].some((o) => !o.group) && <OptionsForm options={ours[part].filter((o) => !o.group)} values={values} onChange={setMine} context={yours.values} />}
                {its[part].length > 0 && <OptionsForm options={its[part]} values={yours.values} onChange={setChosenTheirs} context={theirContext} />}
                {ours[part].some((o) => o.group) && <OptionsForm options={ours[part].filter((o) => o.group)} values={values} onChange={setMine} context={yours.values} />}
              </div>
            </section>
          );
        })}
      </motion.div>
      {/* (kept in view at the card's foot, however many options there are above: on its own ground, parted from them by a line, so that none shows through it) */}
      <div className="sticky -bottom-3 -mx-3 -mb-3 flex justify-end gap-2 border-t border-gh-line bg-white px-3 pb-3 pt-3">
        <button onClick={onCancel} className="rounded-md border border-gh-line px-3 py-1.5 outline-none hover:bg-gh-base focus-visible:border-accel-base focus-visible:ring-2 focus-visible:ring-accel-lightbase">
          Cancel
        </button>
        <button
          ref={renderRef}
          onClick={go}
          className="rounded-md border border-accel-base bg-accel-lightbase px-3 py-1.5 outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-accel-base/40"
        >
          Render
        </button>
      </div>
    </motion.div>
  );
}
