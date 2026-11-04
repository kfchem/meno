import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { OKABE_ITO_SET } from "../../../lib/chem/palette";
import ColourCard from "./ColourCard";
import PenCard from "./PenCard";
import { EditorProvider } from "./store";

// Vitest runs in Node, with no page to mount on: the cards as the server's
// renderer writes them, as they first show.

const YELLOW = "#f0e442";

/** The buttons of the group named `name` in `html`: each one's label, and whether it is disabled. */
function swatches(html: string, name: string): { label: string; disabled: boolean }[] {
  // (the group itself: the card is called "Colour" too)
  const start = html.indexOf(`role="group" aria-label="${name}"`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = html.indexOf('role="group"', start + 1);
  const group = html.slice(start, end < 0 ? undefined : end);
  return [...group.matchAll(/<button([^>]*)>/g)].map(([, attrs]) => ({ label: /aria-label="([^"]*)"/.exec(attrs)?.[1] ?? "", disabled: / disabled=""/.test(attrs) }));
}

describe("Okabe and Ito's yellow, for fills and highlights only", () => {
  // (the server's renderer reads a store as it began - zustand's server snapshot - so Okabe and Ito's set is made the one
  // in use there, and put back after)
  const initial = useAppSettings.getInitialState() as { colours: ReturnType<typeof useAppSettings.getState>["colours"] };
  let was: typeof initial.colours;
  beforeEach(() => {
    was = initial.colours;
    initial.colours = { use: OKABE_ITO_SET.id, sets: [] };
  });
  afterEach(() => {
    initial.colours = was;
  });

  it("is struck through for a part's colour - its lines and letters - and offered for its highlight and a ring's fill", () => {
    const html = renderToString(
      <EditorProvider tabId="colour-card">
        <ColourCard target={{ atoms: [1], bonds: [], rings: ["r"] }} x={0} y={0} within={{ width: 800, height: 600 }} onClose={() => {}} />
      </EditorProvider>,
    );
    const colour = swatches(html, "Colour");
    expect(colour.find((s) => s.label.startsWith(YELLOW))).toEqual({ label: `${YELLOW}, for fills and highlights only`, disabled: true });
    // (every other colour of the set offered there)
    expect(colour.filter((s) => s.disabled)).toHaveLength(1);
    for (const row of ["Highlight", "Fill ring"]) expect(swatches(html, row).find((s) => s.label === YELLOW), row).toEqual({ label: YELLOW, disabled: false });
  });

  it("is struck through for the pen, and offered for the marker", () => {
    const pen = renderToString(<PenCard mode={{ tool: "pen", color: null, width: 1 }} onMode={() => {}} onDone={() => {}} />);
    expect(swatches(pen, "Colour").find((s) => s.label.startsWith(YELLOW))).toEqual({ label: `${YELLOW}, for the marker only`, disabled: true });
    const marker = renderToString(<PenCard mode={{ tool: "marker", color: null, width: 1 }} onMode={() => {}} onDone={() => {}} />);
    expect(swatches(marker, "Colour").find((s) => s.label === YELLOW)).toEqual({ label: YELLOW, disabled: false });
  });
});
