/**
 * The names of a step's exits beside their ports (docs/WORKFLOWS.md, *Exit
 * names*), drawn by WebGL (pageGl `PageTexts`).
 */
import type { WorkflowStep } from "../store/types";
import { COLORS } from "../../../theme/colors";
import type { PageText } from "../pageGl/texts";
import { exitsOf } from "./kinds";
import { CARD_W, GAP, PORT_STEP, portDown, PX } from "./look";

/** How far out from the card's side a name begins, as an input's (StepCard), and how large its letters are, in page px. */
export const EXIT_NAME_OUT = 8;
export const EXIT_NAME_PX = 10;

/**
 * Each exit's name, where its step has more than one exit and its set is on
 * no page beside it (`named`: the name its frame would have - doers
 * `setName`, its kind's words filled from the step's options - for one held
 * off the page, workflow/held; none for one on the page, which its frame
 * names). Outside the card's right side, half a port's step above its port,
 * as an input's name is above its port on the left: between the wire that
 * leaves its port level and the line above, through neither. In the quiet
 * words an input's name is in. The first cut with an ellipsis short of
 * where its set's frame would stand (`GAP` out), as a wire leaves it level
 * there; those under it whole.
 */
export function exitNames(steps: readonly Pick<WorkflowStep, "id" | "x" | "y" | "kind">[], named: (step: number, exit: string) => string | null): PageText[] {
  return steps.flatMap((s) => {
    const exits = exitsOf(s.kind);
    if (exits.length < 2) return [];
    return exits.flatMap((x, k): PageText[] => {
      const name = named(s.id, x.id);
      return name
        ? [
            {
              key: `exit:${s.id}:${x.id}`,
              x: s.x + CARD_W + EXIT_NAME_OUT * PX,
              y: s.y - portDown(k) + PORT_STEP / 2,
              anchor: "start",
              baseline: "middle",
              text: name,
              sizePx: EXIT_NAME_PX,
              color: COLORS.quiet,
              ...(k === 0 ? { maxWidthPx: GAP / PX - 2 * EXIT_NAME_OUT } : {}),
            },
          ]
        : [];
    });
  });
}
