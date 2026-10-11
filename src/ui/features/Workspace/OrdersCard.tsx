import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * A ligand's bond orders, which its file does not give and its shape cannot
 * say - no hydrogens to go by (docs/WORKSPACE.md, *Hydrogens and bond
 * orders*) - given from a SMILES of it: a card over the canvas, as Export's
 * is, so that the molecule stays in view. Enter gives them; Escape, or
 * Cancel, lets it go; what went wrong is said in it.
 */
export default function OrdersCard({ onGive, onCancel }: { onGive: (smiles: string) => Promise<void>; onCancel: () => void }) {
  const [smiles, setSmiles] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const give = async () => {
    if (!smiles.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onGive(smiles);
    } catch (e: unknown) {
      setError(`No bond orders could be given: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div
      role="dialog"
      aria-labelledby="orders-title"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[380px] max-w-[90%] rounded-lg border border-gh-line bg-white/95 shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="orders-title" className="font-semibold mb-1">
        Bond orders from SMILES
      </h2>
      <p className="text-xs text-gh-gray mb-2">The SMILES of this molecule: its bonds are given its orders.</p>
      <input
        ref={field}
        value={smiles}
        onChange={(e) => setSmiles(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") void give();
          else if (e.key === "Escape") onCancel();
        }}
        spellCheck={false}
        aria-label="SMILES"
        className="w-full h-8 rounded-md border border-gh-line bg-white px-2 font-mono text-xs outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase"
      />
      {error && <p className="mt-1.5 text-xs text-accel-accent">{error}</p>}
      <div className="mt-2.5 flex justify-end gap-2">
        <button onClick={onCancel} className="h-7 px-2.5 rounded-md text-xs text-gh-gray hover:text-gh-black">
          Cancel
        </button>
        <button
          onClick={() => void give()}
          disabled={!smiles.trim() || busy}
          className="h-7 px-3 rounded-md bg-accel-base text-white text-xs hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Giving…" : "Give bond orders"}
        </button>
      </div>
    </motion.div>
  );
}
