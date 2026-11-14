import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import SaveAbbreviationPanel from "./SaveAbbreviationPanel";
import { EditorProvider } from "./store";

// Vitest runs in Node, with no page to mount on: the server's renderer draws the panel, and what it says is read off that.
const panel = (notKept?: string) => {
  return renderToString(
    <EditorProvider tabId="panel-test">
      <SaveAbbreviationPanel ids={[]} smiles="*C(=O)OCC" notKept={notKept} onClose={() => {}} />
    </EditorProvider>,
  );
};

describe("the Save as abbreviation panel", () => {
  it("says what of the stereo the selection's bonds show it does not keep - only where it does not keep any", () => {
    const said = "Its wedges are not kept: an abbreviation has no stereo.";
    expect(panel(said)).toContain(said);
    expect(panel()).not.toContain("not kept");
  });
});
