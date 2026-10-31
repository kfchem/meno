import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { askToConnect, useNetwork } from "../../lib/net/network";
import { UPDATE_CONSENT } from "../../lib/update";
import { ConsentSmallPrint } from "./ConsentDialog";
import { questionKey } from "./questionKey";

// Vitest runs in Node, with no page to click on: a click on the dialog as it
// fades out reaches the question it was drawn for - its `answer`, as the
// button going out still holds it - and that is what is clicked here.

const ask = (purpose: string) => askToConnect({ purpose, title: `Set up ${purpose}?`, detail: "", sources: [], hosts: [] });
const settle = () => new Promise((go) => setTimeout(go, 0));

describe("the question before using the network", () => {
  beforeEach(() => useNetwork.setState({ offline: false, granted: [], asking: null }));

  it("takes a second click on Allow, as the dialog goes, as nothing: the next question is still asked, and nothing more allowed", async () => {
    const first = ask("python-env:plugin-rdkit");
    const second = ask("python-env:plugin-cclib");
    await settle();
    const shown = useNetwork.getState().asking!;
    shown.answer(true);
    await settle();
    // (the double-click's second, on the button going out with the first question)
    shown.answer(true);
    expect(await first).toBe(true);
    await settle();
    expect(useNetwork.getState().asking?.purpose).toBe("python-env:plugin-cclib");
    expect(useNetwork.getState().granted).toEqual(["python-env:plugin-rdkit"]);
    useNetwork.getState().asking!.answer(false);
    expect(await second).toBe(false);
  });

  it("shows each question as a dialog of its own, so the next comes in as itself and takes no click meant for the one before", async () => {
    void ask("python-env:plugin-rdkit");
    void ask("python-env:plugin-cclib");
    await settle();
    const one = useNetwork.getState().asking!;
    expect(questionKey(one)).toBe(questionKey(one));
    one.answer(false);
    await settle();
    const two = useNetwork.getState().asking!;
    expect(questionKey(two)).not.toBe(questionKey(one));
    two.answer(false);
  });
});

describe("what every question says, once", () => {
  it("says under each question that each connection is shown and recorded, that none is made offline, and that a yes can be withdrawn", () => {
    const said = renderToString(<ConsentSmallPrint purpose={UPDATE_CONSENT.purpose} />).replace(/<!-- -->/g, "").replace(/\s+/g, " ");
    expect(said).toContain("Every connection is shown as it happens and kept in the record in Settings › Network, and none is made while Meno works offline.");
    expect(said).toContain("Meno remembers a yes for “Keeping Meno up to date” until you withdraw it there.");
  });

  it("leaves those out of a question's own words: said twice, they were read as two things", () => {
    expect(UPDATE_CONSENT.detail).not.toMatch(/connection|offline|Settings/i);
  });
});
