import { useEffect, useMemo, useState } from "react";
import { chemMolblock } from "../../../../lib/roles/molblock";
import { forFlatReaders } from "./drawing";
import { chemAtHand, chemWorker, useChem } from "../../../../lib/roles/worker";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { Model } from "../store/types";
import { marksOf, NO_MARKS, type ChemMarks } from "./marks";

/** How long the structure has to stay as it is before the plugin is asked. */
const SETTLE_MS = 150;

/**
 * The marks the plugin that does the checks (lib/plugins/roles) puts on a
 * structure, as far as they are asked for - valence warnings by the
 * settings, each R or S and E or Z by its atom or bond (`stereoShown`) -
 * brought up to date a moment after it stops changing. Only while the plugin can be had without
 * asking: a structure being drawn never sets it up by itself. Marks for an
 * earlier version stay up until the new ones come, so nothing flickers.
 */
export function useChemMarks(model: Model, active: boolean): ChemMarks | null {
  const { valenceWarnings } = useAppSettings((s) => s.chemistry);
  // (any R or S, E or Z asked for on the drawing)
  const stereoAsked = useMemo(() => model.atoms.some((a) => a.stereoShown) || model.bonds.some((b) => b.stereoShown), [model]);
  const chem = useChem();
  const [atHand, setAtHand] = useState(false);
  const [marks, setMarks] = useState<ChemMarks | null>(null);
  const wanted =
    active && (valenceWarnings || stereoAsked) && model.atoms.length > 0;
  const ready = chem.state === "ready";
  const failed = chem.state === "failed";

  // whether what makes the checks is set up: asked once it matters, and
  // again as it is set up, started, stopped or taken away - its marks gone
  // with it, rather than left standing on a drawing that changes
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void chemAtHand().then((v) => {
      if (!live) return;
      setAtHand(v);
      if (!v) setMarks(null);
    });
    return () => {
      live = false;
    };
  }, [wanted, chem.state]);

  useEffect(() => {
    if (!wanted || failed || !(atHand || ready)) return;
    let live = true;
    const t = setTimeout(() => {
      void chemWorker("checks")
        .then((c) => c.request("analyse", { molblock: chemMolblock(forFlatReaders(model)) }))
        .then((r) => {
          if (live) setMarks(marksOf(model, r));
        })
        .catch(() => {
          // the plugin could not make sense of it, or has stopped: no marks
          if (live) setMarks(NO_MARKS);
        });
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [model, wanted, failed, atHand, ready]);

  return useMemo(
    () =>
      wanted && marks
        ? {
            valence: valenceWarnings ? marks.valence : NO_MARKS.valence,
            centres: stereoAsked ? shownOnly(marks.centres, model.atoms) : NO_MARKS.centres,
            doubleBonds: stereoAsked ? shownOnly(marks.doubleBonds, model.bonds) : NO_MARKS.doubleBonds,
          }
        : null,
    [wanted, marks, valenceWarnings, stereoAsked, model],
  );
}

/** The marks of those parts - atoms, or bonds - whose R or S, E or Z is shown. */
function shownOnly<T>(marks: Map<number, T>, parts: readonly { id: number; stereoShown?: true }[]): Map<number, T> {
  const shown = new Set(parts.filter((p) => p.stereoShown).map((p) => p.id));
  return new Map([...marks].filter(([id]) => shown.has(id)));
}
