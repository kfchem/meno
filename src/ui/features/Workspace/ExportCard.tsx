import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EXPORT_ROLE, optionsFor, writeRole, type Writer } from "../../../lib/io/writers";
import type { Holds } from "./fileActions";
import { rememberable, valuesOf, type Known, type OptionValues } from "../../../lib/options";
import { useAppSettings } from "../../../lib/settings/appSettings";
import OptionsForm from "../../options/OptionsForm";
import { useInFront } from "../../layouts/inFront";

/** A molecule in 3D on the page, as Export names it when it asks which to write. */
export type Offered3D = { id: number; name: string };

/**
 * Export, asked before the file's name (docs/FILE-IO.md, *Save and
 * Export*): the kind of file - those the canvas can be written as, Meno's
 * and the plugins' added; first the kind of the file it came from, else the
 * one chosen last time, where it is among them - and that kind's options, as
 * its writer declares them (lib/io/writers), the last chosen remembered.
 * A writer given one molecule is given the molecules in 3D selected - one
 * system, where several are - or the one there is; else the card asks
 * which. Options that start from what is written (lib/options `Known`) start
 * from that molecule. A card over the canvas, as Ask3D is, so that what is
 * written stays in view.
 */
export default function ExportCard({
  writers,
  from,
  what,
  molecules,
  selected,
  known,
  onExport,
  onCancel,
}: {
  /** What the canvas can be written as, the fittest first. */
  writers: readonly Writer[];
  /** What is on the canvas: a writer's options about what it does not hold are not shown. */
  what: Holds;
  /** The kind of the file the canvas came from, where it can be written as it. */
  from?: string;
  /** The molecules in 3D on the page, and those selected, by id. */
  molecules: readonly Offered3D[];
  selected: readonly number[];
  /** What Meno knows of the molecules in 3D written, by their ids. */
  known: (ids: readonly number[]) => Partial<Record<Known, string | number>>;
  onExport: (writer: Writer, values: OptionValues, molecules: number[]) => void;
  onCancel: () => void;
}) {
  const remembered = useAppSettings((s) => s.options);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  const last = remembered[EXPORT_ROLE]?.kind;
  const [kind, setKind] = useState<string>(from ?? writers.find((w) => w.id === last)?.id ?? writers[0].id);
  const writer = writers.find((w) => w.id === kind) ?? writers[0];
  // (the molecules in 3D written by a writer given one: those selected, or the one there is, or the one chosen here)
  const [picked, setPicked] = useState<number | null>(null);
  const given = writer.takes !== "molecule" ? [] : selected.length ? [...selected] : molecules.length === 1 ? [molecules[0].id] : picked != null ? [picked] : [];
  const asks = writer.takes === "molecule" && !selected.length && molecules.length > 1;
  // (each kind's options as chosen in this card, or as they were last time - or as what is written says)
  const [chosen, setChosen] = useState<Partial<Record<string, OptionValues>>>({});
  const values = chosen[writer.id] ?? valuesOf(writer.options, remembered[writeRole(writer.id)], known(given));
  const shown = optionsFor(writer, { drawing: what.drawn || what.reaction, molecules3d: what.solid });
  const ready = writer.takes !== "molecule" || given.length > 0;

  const exportRef = useRef<HTMLButtonElement>(null);
  // (the keys given to Export as it opens, once: given again each time the
  // canvas round it was drawn, they left a number field as it was typed in,
  // and the next Enter exported)
  useEffect(() => {
    exportRef.current?.focus();
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

  const pick = (id: number) => {
    setPicked(id);
    // (what starts from the molecule written starts afresh from the one picked)
    setChosen((c) => {
      const mine = c[writer.id];
      if (!mine) return c;
      const fresh = valuesOf(writer.options, {}, known([id]));
      const kept = rememberable(writer.options, mine);
      return { ...c, [writer.id]: { ...fresh, ...kept } };
    });
  };

  const go = () => {
    if (!ready) return;
    rememberOptions(EXPORT_ROLE, { kind: writer.id });
    if (writer.options.length) rememberOptions(writeRole(writer.id), rememberable(writer.options, values));
    onExport(writer, values, given);
  };

  return (
    <motion.div
      role="dialog"
      aria-labelledby="export-title"
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[380px] max-w-[90%] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-gh-line bg-white/95 shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="export-title" className="font-semibold mb-2">
        Export
      </h2>
      <div role="radiogroup" aria-label="Kind of file" className="flex flex-wrap gap-1.5 mb-3">
        {writers.map((w) => (
          <button
            key={w.id}
            role="radio"
            aria-checked={w.id === writer.id}
            onClick={() => setKind(w.id)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors duration-150 ease-meno ${
              w.id === writer.id ? "border-accel-base bg-accel-lightbase text-gh-black" : "border-gh-line text-gh-gray hover:bg-gray-100"
            }`}
          >
            {w.name}
          </button>
        ))}
      </div>
      {asks && (
        <motion.fieldset initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} className="mb-3">
          <legend className="text-xs text-gh-gray mb-1">Molecule</legend>
          <div className="space-y-1">
            {molecules.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm text-gh-black">
                <input type="radio" name="export-molecule" checked={picked === m.id} onChange={() => pick(m.id)} />
                {m.name}
              </label>
            ))}
          </div>
        </motion.fieldset>
      )}
      {shown.length > 0 && (
        <motion.div key={`${writer.id}:${given.join(",")}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} className="mb-3">
          <OptionsForm options={shown} values={values} onChange={(v) => setChosen((c) => ({ ...c, [writer.id]: v }))} />
        </motion.div>
      )}
      {/* (kept in view at the card's foot, however many options there are above) */}
      <div className="sticky -bottom-3 -mx-3 -mb-3 flex justify-end gap-2 bg-white/95 px-3 pb-3 pt-2">
        <button onClick={onCancel} className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100">
          Cancel
        </button>
        <button
          ref={exportRef}
          onClick={go}
          disabled={!ready}
          className="rounded-md border border-accel-base bg-accel-lightbase px-3 py-1.5 hover:brightness-95 disabled:opacity-50"
        >
          Export…
        </button>
      </div>
    </motion.div>
  );
}
