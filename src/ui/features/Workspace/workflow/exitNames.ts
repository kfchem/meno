/**
 * The names of a step's exits beside their ports (docs/WORKFLOWS.md, *Exit
 * names*), drawn by WebGL (pageGl `PageTexts`).
 */
import type { WorkflowStep } from "../store/types";
import { COLORS } from "../../../theme/colors";
import { CHIP, CHIP_HEIGHT, chipLine, shutChip } from "../pageGl/chips";
import type { Drawn } from "../pageGl/PagePlaced";
import type { PageText } from "../pageGl/texts";
import { pagePx } from "../pageGl/units";
import { FRAMES_CHIP_GAP } from "../utils/molecule3d";
import { exitsOf } from "./kinds";
import { CARD_W, GAP, PORT_STEP, portDown, PX } from "./look";

/** How far out from the card's side a name begins, as an input's (StepCard), and how large its letters are, in page px. */
export const EXIT_NAME_OUT = 8;
export const EXIT_NAME_PX = 10;

/**
 * Each exit's name, where its step has more than one exit and its set is on
 * no page beside it (`named`: held off the page, workflow/held) - a set on
 * the page is named by its frame. Outside the card's right side, half a
 * port's step above its port, as an input's name is above its port on the
 * left: between the wire that leaves its port level and the line above,
 * through neither. In the quiet words an input's name is in. The first cut
 * with an ellipsis short of where its set's frame would stand (`GAP` out),
 * as a wire leaves it level there; those under it whole.
 */
export function exitNames(steps: readonly Pick<WorkflowStep, "id" | "x" | "y" | "kind">[], named: (step: number, exit: string) => boolean): PageText[] {
  return steps.flatMap((s) => {
    const exits = exitsOf(s.kind);
    if (exits.length < 2) return [];
    return exits.flatMap((x, k): PageText[] =>
      named(s.id, x.id)
        ? [
            {
              key: `exit:${s.id}:${x.id}`,
              x: s.x + CARD_W + EXIT_NAME_OUT * PX,
              y: s.y - portDown(k) + PORT_STEP / 2,
              anchor: "start",
              baseline: "middle",
              text: x.name,
              sizePx: EXIT_NAME_PX,
              color: COLORS.quiet,
              ...(k === 0 ? { maxWidthPx: GAP / PX - 2 * EXIT_NAME_OUT } : {}),
            },
          ]
        : [],
    );
  });
}

/** How far out from its port a held exit's chip begins, in page px. */
export const EXIT_CHIP_OUT = 8;

/**
 * What a held exit's set holds, said beside its port as the pointer is on
 * it (docs/WORKFLOWS.md, *Held results*): its name, then its count in the
 * words a large set's summary says it in ("Failed · 3 molecules") - in a
 * chip as a molecule's frames chip is drawn shut (pageGl `shutChip`), out
 * to the right of the port, level with it; taking no pointer, so that the
 * port keeps it.
 */
export function exitChip(key: string, name: string, holds: string, port: { x: number; y: number }): Drawn {
  const runs = [
    { text: `${name} \u00b7 `, tone: "quiet" as const },
    { text: holds, tone: "ink" as const },
  ];
  const w = pagePx(chipLine(runs).width + 2 * CHIP.side);
  const h = pagePx(CHIP_HEIGHT);
  // (hung, as a frames chip is, FRAMES_CHIP_GAP below a point: here the one that puts its middle level with the port)
  const chip = shutChip(key, runs, { x: port.x + pagePx(EXIT_CHIP_OUT) + w / 2, y: port.y + h / 2 + pagePx(FRAMES_CHIP_GAP) });
  return { ...chip, regions: [] };
}
