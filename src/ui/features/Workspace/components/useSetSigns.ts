import { useEffect, useMemo, useState } from "react";
import { useEditor, useEditorStore } from "../store";
import { setSigns, type SetSign } from "../workflow/setSigns";

type Page = Parameters<typeof setSigns>[1];

/**
 * Each set that shows what letting go would do while the pointer is held
 * (workflow/setSigns): the page as the pointer went down - heard before
 * anything under the window hears the press, as the frames' settling hears
 * it (store `watchFrames`) - against the page now. Nothing while no pointer
 * is held: what was let go on is the set's count and its frame, then.
 */
export function useSetSigns(): ReadonlyMap<number, SetSign> {
  const store = useEditorStore();
  const [pressed, setPressed] = useState<Page | null>(null);
  useEffect(() => {
    const press = () => {
      const { sets, model, molecules3d, pictures } = store.getState();
      setPressed({ sets, model, molecules3d, pictures });
    };
    const release = () => setPressed(null);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    return () => {
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
  }, [store]);
  const sets = useEditor((s) => s.sets);
  const model = useEditor((s) => s.model);
  const molecules3d = useEditor((s) => s.molecules3d);
  const pictures = useEditor((s) => s.pictures);
  return useMemo(() => setSigns(pressed, { sets, model, molecules3d, pictures }), [pressed, sets, model, molecules3d, pictures]);
}
