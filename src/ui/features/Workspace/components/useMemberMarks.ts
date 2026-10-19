import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import type { Member, Model, Molecule3D, PictureItem, WorkflowSet } from "../store/types";
import type { Frame } from "../workflow/entries";

/** How long a member's mark shows, in ms: as it comes, holds and goes (App.css `meno-member-mark`). */
export const MARK_MS = 700;

/** A mark round something that has just joined a set, or just left it. */
export type MemberMark = { key: string; set: number; frame: Frame; joined: boolean };

type Page = { model: Model; molecules3d: readonly Molecule3D[]; pictures?: readonly PictureItem[] };

/**
 * Marks round what has just joined a set or left it (docs/WORKFLOWS-FOUNDATION.md,
 * *Members are explicit*): each a moment, fading in and out, so that a member
 * coming in or going - dropped in, dragged out, a frame resized - is seen to,
 * and nothing changes at once. A structure drawn on, split or joined is the
 * same member still; one deleted is gone with no mark; a set just made, or
 * gone, marks nothing.
 */
export function useMemberMarks(sets: readonly WorkflowSet[], page: Page, extentOf: (m: Molecule3D) => Frame): MemberMark[] {
  const was = useRef<Map<number, readonly Member[] | undefined> | null>(null);
  const [marks, setMarks] = useState<MemberMark[]>([]);
  const { invalidate } = useThree();
  const pageNow = useRef(page);
  pageNow.current = page;
  const extent = useRef(extentOf);
  extent.current = extentOf;
  useEffect(() => {
    const before = was.current;
    was.current = new Map(sets.map((b) => [b.id, b.members]));
    if (!before) return;
    const { model, molecules3d, pictures } = pageNow.current;
    const atoms = new Map(model.atoms.map((a) => [a.id, a]));
    const frameOf = (m: Member): Frame | null => {
      if ("structure" in m) {
        const at = m.structure.flatMap((id) => (atoms.has(id) ? [atoms.get(id)!] : []));
        if (!at.length) return null;
        return { x0: Math.min(...at.map((a) => a.x)) - 0.6, x1: Math.max(...at.map((a) => a.x)) + 0.6, y0: Math.min(...at.map((a) => a.y)) - 0.6, y1: Math.max(...at.map((a) => a.y)) + 0.6 };
      }
      if ("molecule" in m) {
        const mol = molecules3d.find((x) => x.id === m.molecule);
        if (!mol) return null;
        const r = extent.current(mol);
        return { x0: mol.at.x + r.x0, x1: mol.at.x + r.x1, y0: mol.at.y + r.y0, y1: mol.at.y + r.y1 };
      }
      const p = pictures?.find((x) => x.id === m.picture);
      return p ? { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 } : null;
    };
    const fresh: MemberMark[] = [];
    for (const b of sets) {
      const prior = before.get(b.id);
      if (!prior || !b.members || prior === b.members) continue;
      // (a structure member is its atoms: one that shares none with any of the other list's is new to it)
      const atomsOf = (list: readonly Member[]) => new Set(list.flatMap((m) => ("structure" in m ? m.structure : [])));
      const keyOf = (m: Member) => ("molecule" in m ? `m${m.molecule}` : "picture" in m ? `p${m.picture}` : "");
      const differ = (list: readonly Member[], other: readonly Member[], joined: boolean) => {
        const otherAtoms = atomsOf(other);
        const otherKeys = new Set(other.map(keyOf));
        for (const m of list) {
          const isNew = "structure" in m ? !m.structure.some((id) => otherAtoms.has(id)) : !otherKeys.has(keyOf(m));
          const frame = isNew ? frameOf(m) : null;
          if (frame) fresh.push({ key: `${b.id}:${joined ? "+" : "-"}${"structure" in m ? `s${m.structure[0]}` : keyOf(m)}:${Date.now()}`, set: b.id, frame, joined });
        }
      };
      differ(b.members, prior, true);
      differ(prior, b.members, false);
    }
    if (!fresh.length) return;
    setMarks((ms) => [...ms, ...fresh]);
    invalidate();
    const done = setTimeout(() => {
      setMarks((ms) => ms.filter((x) => !fresh.includes(x)));
      invalidate();
    }, MARK_MS);
    return () => clearTimeout(done);
  }, [sets, invalidate]);
  return marks;
}
