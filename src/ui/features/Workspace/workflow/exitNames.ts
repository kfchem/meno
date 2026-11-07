/**
 * The names of a step's exits beside their ports (docs/WORKFLOWS.md, *Exit
 * names*), drawn by WebGL (pageGl `PageTexts`).
 */
import type { WorkflowStep } from "../store/types";
import { COLORS } from "../../../theme/colors";
import { CHIP, chipLine } from "../pageGl/chips";
import type { Drawn } from "../pageGl/PagePlaced";
import type { PageText } from "../pageGl/texts";
import { pagePx } from "../pageGl/units";
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

/** How far out from its port a held exit's chip begins, in page px. */
export const EXIT_CHIP_OUT = 8;

/**
 * What a held exit's set holds, said beside its port as the pointer is on
 * it (docs/WORKFLOWS.md, *Held results*): its name, then its count in the
 * words a large set's summary says it in ("Failed · 3 molecules") - in a
 * chip as a molecule's frames chip is drawn (pageGl `chips`: its box, its
 * words, their sizes and tones), but whole, not let through: it stands on
 * its port's wire, which would show through it. Out to the right of the
 * port, its middle level with it; taking no pointer, so that the port
 * keeps it.
 */
export function exitChip(key: string, name: string, holds: string, port: { x: number; y: number }): Drawn {
  const line = chipLine([
    { text: `${name} \u00b7 `, tone: "quiet" },
    { text: holds, tone: "ink" },
  ]);
  const w = pagePx(line.width + 2 * CHIP.side);
  const h = pagePx(CHIP.line + 2 * CHIP.pad + 2 * CHIP.border);
  const x0 = port.x + pagePx(EXIT_CHIP_OUT);
  const box = { x0, x1: x0 + w, y0: port.y - h / 2, y1: port.y + h / 2 };
  // (its baseline as Plex sets its words in its line: half the room the letters leave, then their ascent - as a frames chip's)
  const baseline = box.y1 - pagePx(CHIP.border + CHIP.pad + (CHIP.line - 1.3 * CHIP.size) / 2 + 1.025 * CHIP.size);
  const left = x0 + pagePx(CHIP.side);
  const tone = { quiet: COLORS.quiet, ink: COLORS.ink, attention: COLORS.attention };
  return {
    shapes: [{ kind: "box", key, ...box, radiusPx: CHIP.radius, fill: COLORS.background, fillAlpha: 1, line: { widthPx: CHIP.border, color: COLORS.hairline }, shadow: CHIP.shadow, opacity: 1 }],
    texts: line.runs.map((r, i) => ({ key: `${key}:${i}`, x: left + pagePx(r.from), y: baseline, anchor: "start", text: r.text, sizePx: CHIP.size, color: tone[r.tone], z: 1, opacity: 1 })),
    regions: [],
  };
}
