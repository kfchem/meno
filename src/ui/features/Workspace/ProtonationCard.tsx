import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useInFront } from "../../layouts/inFront";
import { chargeText } from "../../../lib/chem/molecule";
import type { Site } from "../../../lib/chem/protonation";
import { keptAsDictionary, protonatedSpecies, type Protonation } from "./chem/protonate";

const SPINS = ["", "singlet", "doublet", "triplet", "quartet"];

/** A site as its row names it: what it is, and the atoms whose hydrogens it moves - "Carboxyl O4, O5", "Thiazole nitrogen N3". */
const siteName = (p: Protonation, s: Site) => `${s.title} ${s.changing.map((k) => p.labels[k]).join(", ")}`;

/** A form as its option says it: what it is, its charge, where its hydrogens are - "Imidazole - H on N3". */
const formName = (f: Site["forms"][number]) => `${f.name}${f.charge ? ` (${chargeText(f.charge)})` : ""} - ${f.where}`;

/**
 * How a molecule without its hydrogens is protonated, chosen by the chemist
 * before they are added (docs/WORKSPACE.md, *How it is protonated*): a card
 * over the canvas, as the SMILES card is, so that the molecule stays in
 * view. A row for each site, its forms to choose from - each tautomer one
 * of them, by where its hydrogens are - and the site lit on the molecule
 * while the pointer is over its row; other atoms charged on request; what
 * the molecule's charge and spin then are. Its hydrogens are added only
 * once every site is chosen, and the forms can all be drawn.
 */
export default function ProtonationCard({
  protonation: p,
  onAdd,
  onCancel,
  onMark,
}: {
  protonation: Protonation;
  onAdd: (forms: (number | null)[], charges: Map<number, number>) => Promise<void>;
  onCancel: () => void;
  onMark: (atoms: number[] | null) => void;
}) {
  const [forms, setForms] = useState<(number | null)[]>(p.start);
  const [charges, setCharges] = useState<Map<number, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = useMemo(() => ({ forms, charges }), [forms, charges]);
  const species = useMemo(() => protonatedSpecies(p, chosen), [p, chosen]);
  // (Escape lets it go while its tab is in front - not while its hydrogens are being added: they would be added after it had gone)
  const inFront = useInFront();
  useEffect(() => {
    if (!inFront || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, inFront, busy]);
  // (the molecule's atoms lit no more as the card goes)
  useEffect(() => () => onMark(null), [onMark]);
  const kept = forms.every((f, k) => f === p.start[k]) && !charges.size;
  const said = p.aromatic
    ? "Its file gives its rings as aromatic, which does not say where their hydrogens are: choose each site."
    : p.by === "dictionary"
      ? kept
        ? "As the CCD defines it."
        : "Changed from what the CCD defines."
      : p.by === "assigned" || p.by === undefined
        ? kept
          ? `As ${p.by ? "the SMILES" : "its file"} gives it.`
          : `Changed from what ${p.by ? "the SMILES" : "its file"} gives.`
        : "Its file does not say how it is protonated: choose each site.";
  const add = async () => {
    if ("why" in species || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(forms, charges);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const charged = p.others.filter((o) => charges.has(o.atom));
  const unchanged = p.others.filter((o) => !charges.has(o.atom));
  return (
    <motion.div
      role="dialog"
      aria-labelledby="protonation-title"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[440px] max-w-[90%] max-h-[80%] flex flex-col rounded-lg border border-gh-line bg-white/95 shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="protonation-title" className="font-semibold mb-1">
        How it is protonated
      </h2>
      <p className="text-xs text-gh-gray mb-2">{said}</p>
      <div className="overflow-y-auto min-h-0 -mx-1 px-1">
        {p.sites.map((s, k) => (
          <label
            key={k}
            className="flex items-center gap-2 py-1"
            onMouseEnter={() => onMark(s.atoms.map((a) => p.atoms[a]))}
            onMouseLeave={() => onMark(null)}
          >
            <span className="w-36 shrink-0 truncate text-xs" title={siteName(p, s)}>
              {siteName(p, s)}
            </span>
            <select
              aria-label={siteName(p, s)}
              value={forms[k] ?? ""}
              onChange={(e) => setForms((was) => was.map((f, j) => (j === k ? (e.target.value === "" ? null : Number(e.target.value)) : f)))}
              className="flex-1 min-w-0 h-7 rounded-md border border-gh-line bg-white px-1.5 text-xs outline-none focus:border-accel-base"
            >
              {forms[k] == null && <option value="">Choose…</option>}
              {s.forms.map((f, j) => (
                <option key={j} value={j}>
                  {formName(f)}
                </option>
              ))}
            </select>
          </label>
        ))}
        {charged.map((o) => (
          <label key={`atom-${o.atom}`} className="flex items-center gap-2 py-1" onMouseEnter={() => onMark([p.atoms[o.atom]])} onMouseLeave={() => onMark(null)}>
            <span className="w-36 shrink-0 truncate text-xs">Atom {o.label}</span>
            <select
              aria-label={`Atom ${o.label}`}
              value={charges.get(o.atom)}
              onChange={(e) => setCharges((was) => new Map(was).set(o.atom, Number(e.target.value)))}
              className="flex-1 min-w-0 h-7 rounded-md border border-gh-line bg-white px-1.5 text-xs outline-none focus:border-accel-base"
            >
              {o.charges.map((c) => (
                <option key={c} value={c}>
                  {c ? `Charge ${chargeText(c)}` : "No charge"}
                </option>
              ))}
            </select>
            <button
              aria-label={`Leave ${o.label} as it was`}
              onClick={(e) => {
                e.preventDefault();
                setCharges((was) => {
                  const next = new Map(was);
                  next.delete(o.atom);
                  return next;
                });
              }}
              className="h-7 px-1.5 rounded-md text-xs text-gh-gray hover:text-gh-black"
            >
              ×
            </button>
          </label>
        ))}
        {unchanged.length > 0 && (
          <select
            aria-label="Charge another atom"
            value=""
            onChange={(e) => {
              const o = p.others.find((x) => x.atom === Number(e.target.value));
              if (o) setCharges((was) => new Map(was).set(o.atom, o.now));
            }}
            className="mt-1 h-7 rounded-md border border-dashed border-gh-line bg-white px-1.5 text-xs text-gh-gray outline-none focus:border-accel-base"
          >
            <option value="">Charge another atom…</option>
            {unchanged.map((o) => (
              <option key={o.atom} value={o.atom}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mt-2 text-xs" aria-live="polite">
        {"why" in species ? <span className="text-gh-gray">{species.why}</span> : `Charge ${species.charge ? chargeText(species.charge) : "0"}, ${SPINS[species.multiplicity] ?? `multiplicity ${species.multiplicity}`}`}
      </p>
      {keptAsDictionary(p, chosen) && <p className="mt-0.5 text-xs text-gh-gray">Its hydrogens are put where the CCD has them.</p>}
      {error && <p className="mt-1.5 text-xs text-accel-accent">{error}</p>}
      <div className="mt-2.5 flex justify-end gap-2">
        <button onClick={onCancel} disabled={busy} className="h-7 px-2.5 rounded-md text-xs text-gh-gray hover:text-gh-black disabled:opacity-40">
          Cancel
        </button>
        <button onClick={() => void add()} disabled={"why" in species || busy} className="h-7 px-3 rounded-md bg-accel-base text-white text-xs hover:opacity-90 disabled:opacity-40">
          {busy ? "Adding…" : "Add hydrogens"}
        </button>
      </div>
    </motion.div>
  );
}
