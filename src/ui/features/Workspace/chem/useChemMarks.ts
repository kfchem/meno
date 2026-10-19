import { useEffect, useMemo, useState } from "react";
import { chemMolblock } from "../../../../lib/roles/molblock";
import { forFlatReaders } from "./drawing";
import { chemAtHand, chemWorker, useChem } from "../../../../lib/roles/worker";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { Model } from "../store/types";
import { marksOf, NO_MARKS, shownMarks, stereoAskedOf, type ChemMarks, type StereoAsked } from "./marks";

/** How long the structure has to stay as it is before the plugin is asked. */
const SETTLE_MS = 150;

/**
 * The marks the plugin that does the checks (lib/plugins/roles) puts on a
 * structure, as far as they are asked for - valence warnings by the
 * settings, each R or S and E or Z by its atom or bond (`stereoShown`) -
 * brought up to date a moment after it stops changing. Only while the plugin can be had without
 * asking: a structure being drawn never sets it up by itself. Marks for an
 * earlier version stay up until the new ones come, so nothing flickers -
 * but only those shown already: R and S, E and Z asked for since are shown
 * from them only where they were worked out for the structure as it is,
 * and otherwise come with the marks worked out after, all of them
 * together, rather than some at once from the earlier marks and the rest a
 * moment later.
 */
export function useChemMarks(model: Model, active: boolean): ChemMarks | null {
  const { valenceWarnings } = useAppSettings((s) => s.chemistry);
  // (any R or S, E or Z asked for on the drawing)
  const stereoAsked = useMemo(() => model.atoms.some((a) => a.stereoShown) || model.bonds.some((b) => b.stereoShown), [model]);
  const chem = useChem();
  const [atHand, setAtHand] = useState(false);
  // (with what R and S, E and Z were asked for as they were worked out, and the structure they were for)
  const [got, setGot] = useState<{ marks: ChemMarks; asked: StereoAsked; molblock: string } | null>(null);
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
      if (!v) setGot(null);
    });
    return () => {
      live = false;
    };
  }, [wanted, chem.state]);

  useEffect(() => {
    if (!wanted || failed || !(atHand || ready)) return;
    let live = true;
    const t = setTimeout(() => {
      const asked = stereoAskedOf(model);
      const molblock = chemMolblock(forFlatReaders(model));
      void chemWorker("checks")
        .then((c) => c.request("analyse", { molblock }))
        .then((r) => {
          if (live) setGot({ marks: marksOf(model, r), asked, molblock });
        })
        .catch(() => {
          // the plugin could not make sense of it, or has stopped: no marks
          if (live) setGot({ marks: NO_MARKS, asked, molblock });
        });
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [model, wanted, failed, atHand, ready]);

  return useMemo(
    () =>
      wanted && got
        ? {
            valence: valenceWarnings ? got.marks.valence : NO_MARKS.valence,
            ...(stereoAsked
              ? shownMarks(got.marks, model, got.asked, () => chemMolblock(forFlatReaders(model)) === got.molblock)
              : { centres: NO_MARKS.centres, doubleBonds: NO_MARKS.doubleBonds }),
          }
        : null,
    [wanted, got, valenceWarnings, stereoAsked, model],
  );
}
