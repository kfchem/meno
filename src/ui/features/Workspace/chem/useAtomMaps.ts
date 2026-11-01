import { useCallback, useRef, useState } from "react";
import type { Molecule } from "../../../../lib/chem/molecule";
import { valuesOf } from "../../../../lib/options";
import { roleOptionsRole } from "../../../../lib/plugins/roles";
import { chemWorker, rolePlugin } from "../../../../lib/roles/worker";
import { stopWorker } from "../../../../lib/plugins/process";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { useNotices } from "../../../notices";
import type { EditorState, Model } from "../store/types";
import { linkOf, signatureOf } from "../utils/drawnLink";
import { keptMap, reactionOf, type Side3D } from "./atomMap";
import { bareAtomsOf, blocksOf, conformersOf, moleculeOf, pageCount } from "./make3d";
import { mapAtoms, MappingStopped } from "./mapAtoms";

type Store = { getState: () => EditorState };

/** A mapping under way: the arrow it is for; whether its structures are being made in 3D or mapped; since when, and how many searches it has made. */
export type Mapping = { arrowId: number; phase: "3d" | "map"; since: number; searches: number };

/**
 * A drawn reaction's atom map made (docs/ATOM-MAPPING.md, *On a drawn
 * scheme*): its structures in 3D - the molecules in 3D made from them where
 * they are still theirs, else made now, one conformer each, every hydrogen
 * an atom; a lone ion as it stands - mapped off the drawing's thread, which
 * says how far it has got and can be stopped; and kept on the arrow, what it
 * shows put on the drawing, as one undo step.
 */
export function useAtomMaps(store: Store, setChemError: (e: string | null) => void) {
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const sideOf = useCallback(async (model: Model, pieces: number[][]): Promise<Side3D[]> => {
    const ids = pieces.flat();
    const st = store.getState();
    const out: Side3D[] = [];
    const blocks = blocksOf(model, ids);
    let chem: Awaited<ReturnType<typeof chemWorker>> | null = null;
    for (const block of blocks) {
      // (a molecule in 3D made from the structure, and still its: as it stands, the conformer shown)
      const atoms = new Set(block.atoms);
      const made = st.molecules3d.find(
        (m) => linkOf(m, model) === "live" && m.drawnFrom!.filter((id) => id != null).length === atoms.size && m.drawnFrom!.every((id) => id == null || atoms.has(id)),
      );
      if (made) {
        const frame = st.frames3d[made.id] ?? 0;
        const xyz = frame > 0 && made.frames?.[frame - 1] ? made.frames[frame - 1] : null;
        out.push({
          molecule: {
            atoms: made.atoms.map((a, i) => (xyz ? { ...a, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] } : a)),
            bonds: made.bonds,
          },
          drawnFrom: made.drawnFrom!,
        });
        continue;
      }
      chem ??= await chemWorker("conformers");
      const declared = rolePlugin("conformers")?.roleOptions.conformers ?? [];
      const options = valuesOf(declared, useAppSettings.getState().options[roleOptionsRole("conformers")]);
      const [c] = await conformersOf(chem, block, "one", options, pageCount(block, useAppSettings.getState().chemistry));
      if (!c) throw new Error("A structure of the reaction has no 3D structure.");
      const m = moleculeOf(c, block);
      out.push({ molecule: { atoms: m.atoms, bonds: m.bonds }, drawnFrom: m.drawnFrom ?? [] });
    }
    // (a lone ion - Cl-, Na+ - an atom alone in 3D)
    for (const a of bareAtomsOf(model, ids)) {
      out.push({ molecule: { atoms: [{ el: a.el, x: 0, y: 0, z: 0, ...(a.charge ? { charge: a.charge } : {}) }], bonds: [] }, drawnFrom: [a.id] });
    }
    return out;
  }, [store]);

  const makeAtomMap = useCallback(
    async (arrowId: number) => {
      const st = store.getState();
      const arrow = st.arrows.find((a) => a.id === arrowId);
      if (!arrow) return;
      const model = st.model;
      const { reactants, products } = reactionOf(model, arrow, st.pluses);
      if (!reactants.length || !products.length) {
        setChemError("An atom map is made for a reaction drawn with what reacts before its arrow and what it gives after it.");
        return;
      }
      setChemError(null);
      const ids = [...reactants.flat(), ...products.flat()];
      const drawnAs = signatureOf(model, ids);
      setMapping({ arrowId, phase: "3d", since: Date.now(), searches: 0 });
      // (stopped while its structures are made in 3D: the worker making them stopped - started afresh when next
      // asked - and nothing goes on)
      let stopped = false;
      const plugin = rolePlugin("conformers");
      stopRef.current = () => {
        stopped = true;
        if (plugin) void stopWorker(plugin.id, `${plugin.name} was stopped while it made a reaction's 3D structures`);
      };
      try {
        const rs = await sideOf(model, reactants);
        const ps = await sideOf(model, products);
        if (stopped) throw new MappingStopped();
        setMapping((m) => (m && m.arrowId === arrowId ? { ...m, phase: "map", since: Date.now() } : m));
        const job = mapAtoms(
          rs.map((s) => s.molecule as Molecule),
          ps.map((s) => s.molecule as Molecule),
          (searches) => setMapping((m) => (m && m.arrowId === arrowId ? { ...m, searches } : m)),
        );
        stopRef.current = job.stop;
        const result = await job.result;
        if ("error" in result) throw new Error(result.message);
        // (the structures changed meanwhile - an undo took them away - nothing is kept)
        const now = store.getState();
        if (signatureOf(now.model, ids) !== drawnAs || !now.arrows.some((a) => a.id === arrowId)) {
          setChemError("The reaction changed while its atoms were being mapped, so no map was kept.");
          return;
        }
        const kept = keptMap(now.model, result, rs, ps);
        now.setAtomMap(arrowId, kept);
        if (!kept.complete)
          useNotices.getState().show({
            id: "atom-map",
            title: "Atom map",
            text: "Not every atom of the reaction has its counterpart on the other side, so the map is incomplete and shows no numbers.",
          });
      } catch (e: unknown) {
        if (!(e instanceof MappingStopped) && !stopped) setChemError(`No atom map could be made: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        stopRef.current = null;
        setMapping(null);
      }
    },
    [store, setChemError, sideOf],
  );

  const stopMapping = useCallback(() => stopRef.current?.(), []);

  return { mapping, makeAtomMap, stopMapping };
}
