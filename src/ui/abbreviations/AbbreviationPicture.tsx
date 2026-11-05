import { useEffect, useMemo, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../lib/chem/acs";
import { drawnSmiles, picturedStructure } from "../../lib/chem/abbreviationPlace";
import type { GroupStructure } from "../../lib/chem/ligands";
import { styleOf, type StyleChoice } from "../../lib/chem/style";
import { useAppSettings } from "../../lib/settings/appSettings";
import { drawingSvg } from "../features/Workspace/fileActions";
import type { Model } from "../features/Workspace/store/types";

/**
 * A structure, laid out by Meno, its groups written by name where Clean-up
 * writes them so: atoms with ids from 1, its bonds as the editor holds them.
 */
function modelOf(s: GroupStructure): Model {
  const placed = picturedStructure(s, NOMINAL_BOND_LENGTH);
  return {
    atoms: placed.atoms.map((a, i) => ({ ...a, id: i + 1, r: 0.9 })),
    bonds: placed.bonds.map((b, k) => ({
      id: placed.atoms.length + k + 1,
      a: b.a1 + 1,
      b: b.a2 + 1,
      order: b.order,
      stereo: b.stereo ?? ("none" as const),
      ...(b.narrow != null ? { narrow: b.narrow + 1 } : {}),
      ...(b.display ? { display: b.display } : {}),
      ...(b.coordination ? { coordination: true } : {}),
      ...(b.endpoints ? { endpoints: b.endpoints.map((e) => e + 1), attach: "all" as const } : {}),
    })),
  };
}

/** The picture as SVG, at its own size made larger and never wider than where it is shown; null for SMILES that does not read. */
function pictureSvg(smiles: string | undefined, structure: GroupStructure | undefined, scale: number, choice: StyleChoice): string | null {
  let model: Model | null = null;
  if (structure) model = modelOf(structure);
  else if (smiles) {
    const drawn = drawnSmiles(smiles, NOMINAL_BOND_LENGTH);
    if (drawn) {
      model = {
        atoms: drawn.atoms.map((a) => ({ ...a, r: 0.9 })),
        bonds: drawn.bonds.map((b) => ({ ...b, stereo: "none" as const })),
      };
    }
  }
  if (!model) return null;
  const text = drawingSvg(model, { aromaticEnabled: false, aromaticRings: {} }, styleOf(choice));
  return text.replace(/^<svg([^>]*?) width="([\d.e+-]+)" height="([\d.e+-]+)"/, (_m, rest, w, h) =>
    `<svg${rest} width="${Number(w) * scale}" height="${Number(h) * scale}" style="max-width:100%;max-height:100%;height:auto"`,
  );
}

// A list of hundreds (Settings › Dictionary) draws each picture only as it
// comes near the view, a few at a time between the page's own work, and
// keeps it: the list opens at once, and again without drawing anything.
const kept = new Map<string, string | null>();
const waiting: (() => void)[] = [];
let draining = false;

function drawSoon(job: () => void) {
  waiting.push(job);
  if (!draining) {
    draining = true;
    setTimeout(drain, 0);
  }
}

function drain() {
  const until = performance.now() + 8;
  while (waiting.length && performance.now() < until) waiting.shift()!();
  if (waiting.length) setTimeout(drain, 0);
  else draining = false;
}

/**
 * What an abbreviation stands for, drawn by Meno in the application's
 * drawing style - from its SMILES, a "*" where it is attached, or as a
 * structure made for it (a ligand bound to M; a reagent, its stereocentres
 * wedged; `of` makes it only when it is drawn) - or nothing, for SMILES
 * that does not read. `scale` enlarges the picture from the style's own
 * size. Given a `keep` key, it is drawn when it comes near the view, and
 * kept under that key.
 */
export default function AbbreviationPicture({
  smiles,
  structure,
  of,
  keep,
  scale = 1.5,
  className,
}: {
  smiles?: string;
  structure?: GroupStructure;
  of?: () => GroupStructure;
  keep?: string;
  scale?: number;
  className?: string;
}) {
  const choice = useAppSettings((s) => s.drawingStyle);
  const key = keep ? `${keep}|${scale}|${JSON.stringify(choice)}` : null;
  const now = useMemo(
    () => (key ? undefined : pictureSvg(smiles, structure ?? of?.(), scale, choice)),
    // (`of` makes the same structure each time: what it is of is in the key, or in `smiles`/`structure`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, smiles, structure, scale, choice],
  );
  const [later, setLater] = useState<string | null | undefined>(() => (key ? kept.get(key) : undefined));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!key) return;
    if (kept.has(key)) {
      setLater(kept.get(key));
      return;
    }
    setLater(undefined);
    let gone = false;
    const draw = () =>
      drawSoon(() => {
        if (gone) return;
        if (!kept.has(key)) kept.set(key, pictureSvg(smiles, structure ?? of?.(), scale, choice));
        setLater(kept.get(key));
      });
    if (typeof IntersectionObserver === "undefined" || !box.current) {
      draw();
      return () => void (gone = true);
    }
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        draw();
      },
      { rootMargin: "800px" },
    );
    seen.observe(box.current);
    return () => {
      gone = true;
      seen.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const svg = key ? later : now;
  if (!key && !svg) return null;
  return <div ref={box} className={className} {...(svg ? { dangerouslySetInnerHTML: { __html: svg } } : {})} />;
}
