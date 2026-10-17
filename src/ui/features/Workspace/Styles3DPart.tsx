import { useMemo } from "react";
import { SCENE_3D, SCENE_3D_FIELDS, type Style3DChoice } from "../../../lib/chem/style3d";
import { CARRIED_SCENE, fromCards, style3dIn, withSceneIn, workspaceCards, type CarriedScene } from "../../../lib/chem/workspaceStyle3d";
import { useAppSettings } from "../../../lib/settings/appSettings";
import StylePicker3D from "../StyleEditor/StylePicker3D";
import { Row } from "../StyleEditor/Style3DEditor";
import { useEditor } from "./store";

/** The light's settings a workspace carries, as Settings shows them. */
const SCENE_FIELDS = SCENE_3D_FIELDS.filter((f) => (CARRIED_SCENE as readonly string[]).includes(f.key));

/**
 * The styles in 3D of the workspace on this canvas (docs/WORKSPACE.md,
 * *Styles in 3D*): its primary and its secondary in their slots, Settings'
 * styles to choose from below them - and one it carries that Settings has
 * none like, on a card of its own - and its light. A change is an edit to
 * the workspace, one step to undo, its molecules going over to it; what is
 * done to a style itself here - duplicated, renamed - is done to Settings'.
 */
export default function Styles3DPart() {
  const ws = useEditor((s) => s.docStyle3d);
  const setDocumentStyle3d = useEditor((s) => s.setDocumentStyle3d);
  const viewer = useAppSettings((s) => s.style3d);
  const setViewer = useAppSettings((s) => s.setStyle3d);
  const { choice: cards, carried } = useMemo(() => workspaceCards(ws, viewer), [ws, viewer]);
  const style = useMemo(() => style3dIn(ws, viewer), [ws, viewer]);

  const onChange = (next: Style3DChoice) => {
    // (a role given: the workspace's, one step; a style duplicated or renamed: Settings')
    const made = fromCards(ws, viewer, next);
    if (made.ws !== ws) setDocumentStyle3d(made.ws);
    if (made.viewer !== viewer) setViewer(made.viewer);
  };

  return (
    <section aria-label="Styles in 3D for this workspace">
      <StylePicker3D choice={cards} style={style} editing="" onEdit={() => {}} onChange={onChange} carried={carried} />
      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-gh-gray">Light</h4>
      <div className="mt-2 rounded-lg border border-gh-line divide-y divide-gh-line bg-white">
        {SCENE_FIELDS.map((f) => {
          const key = f.key as keyof CarriedScene;
          return (
            <Row
              key={key}
              stacked
              field={f}
              value={ws.scene[key]}
              changed={ws.scene[key] !== SCENE_3D[key]}
              was={{ value: SCENE_3D[key], from: "Meno" }}
              // (a slider's run, one step to undo)
              onSet={(v) => setDocumentStyle3d(withSceneIn(ws, key, v as never), `style3d:${key}`)}
            />
          );
        })}
      </div>
    </section>
  );
}
