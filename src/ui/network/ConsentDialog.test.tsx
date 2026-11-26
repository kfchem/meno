import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { askToConnect, askToConnectAll, useNetwork, type ConsentRequest } from "../../lib/net/network";
import { UPDATE_CONSENT } from "../../lib/update";
import { ConsentSmallPrint, ConsentWords } from "./ConsentDialog";
import { questionKey } from "./questionKey";
import { giveFocusBack, noteFocus } from "./focusBack";

// Vitest runs in Node, with no page to click on: a click on the dialog as it
// fades out reaches the question it was drawn for - its `answer`, as the
// button going out still holds it - and that is what is clicked here.

const ask = (purpose: string) => askToConnect({ purpose, title: `Set up ${purpose}?`, detail: "", sources: [], hosts: [] });
const settle = () => new Promise((go) => setTimeout(go, 0));

describe("the question before using the network", () => {
  beforeEach(() => useNetwork.setState({ offline: false, granted: [], asking: null }));

  it("takes a second click on Allow, as the dialog goes, as nothing: the next question is still asked, and nothing more allowed", async () => {
    const first = ask("python-env:plugin-sketchkit");
    const second = ask("python-env:plugin-manyread");
    await settle();
    const shown = useNetwork.getState().asking!;
    shown.answer(true);
    await settle();
    // (the double-click's second, on the button going out with the first question)
    shown.answer(true);
    expect(await first).toBe(true);
    await settle();
    expect(useNetwork.getState().asking?.purpose).toBe("python-env:plugin-manyread");
    expect(useNetwork.getState().granted).toEqual(["python-env:plugin-sketchkit"]);
    useNetwork.getState().asking!.answer(false);
    expect(await second).toBe(false);
  });

  it("shows each question as a dialog of its own, so the next comes in as itself and takes no click meant for the one before", async () => {
    void ask("python-env:plugin-sketchkit");
    void ask("python-env:plugin-manyread");
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
    expect(said).toContain("Meno remembers a yes for “Keeping Meno up to date” until you withdraw it in Settings › Network.");
  });

  it("names a plugin's look-up in words, as Settings, Network lists it - never Meno's key for it", () => {
    const said = renderToString(<ConsentSmallPrint purpose="lookup:finder@names.example.org" />).replace(/<!-- -->/g, "").replace(/\s+/g, " ");
    expect(said).toContain("Meno remembers a yes for “Looking names up at names.example.org, for finder” until you withdraw it in Settings › Network.");
    expect(said).not.toContain("lookup:");
  });

  it("leaves those out of a question's own words: said twice, they were read as two things", () => {
    expect(UPDATE_CONSENT.detail).not.toMatch(/connection|offline|Settings/i);
  });
});

describe("one question for a plugin and the plugins it uses", () => {
  beforeEach(() => useNetwork.setState({ offline: false, granted: [], asking: null }));
  const request = (purpose: string, again = false): ConsentRequest => ({ purpose, title: `Set up ${purpose}?`, detail: `What ${purpose} fetches.`, sources: [`${purpose}'s packages: pypi.org`], hosts: [`${purpose}.example`], ...(again ? { again } : {}) });

  it("asks once, each one's words under its name, and a yes allows each of them", async () => {
    const asked = askToConnectAll("Set up the Uses interface, with Tool?", "It uses Tool, which is set up first.", [
      { name: "Tool", request: request("python-env:plugin-tool") },
      { name: "Uses interface", request: request("python-env:plugin-uses") },
    ]);
    await settle();
    const shown = useNetwork.getState().asking!;
    expect(shown.parts?.map((p) => p.name)).toEqual(["Tool", "Uses interface"]);
    const html = renderToString(<ConsentWords asking={shown} />);
    expect(html).toContain("Set up the Uses interface, with Tool?");
    expect(html).toContain("<h3 class=\"font-semibold\">Tool</h3>");
    expect(html).toContain("What python-env:plugin-uses fetches.");
    expect(html).toContain("python-env:plugin-tool&#x27;s packages: pypi.org");
    shown.answer(true);
    expect(await asked).toBe(true);
    await settle();
    expect(useNetwork.getState().granted).toEqual(["python-env:plugin-tool", "python-env:plugin-uses"]);
  });

  it("asks nothing where each was allowed before; asks one left as itself", async () => {
    useNetwork.setState({ granted: ["python-env:plugin-tool", "python-env:plugin-uses"] });
    expect(await askToConnectAll("t", "d", [{ name: "Tool", request: request("python-env:plugin-tool") }, { name: "Uses", request: request("python-env:plugin-uses") }])).toBe(true);
    expect(useNetwork.getState().asking).toBeNull();
    useNetwork.setState({ granted: ["python-env:plugin-tool"] });
    void askToConnectAll("t", "d", [{ name: "Tool", request: request("python-env:plugin-tool") }, { name: "Uses", request: request("python-env:plugin-uses") }]);
    await settle();
    expect(useNetwork.getState().asking?.purpose).toBe("python-env:plugin-uses");
    expect(useNetwork.getState().asking?.parts).toBeUndefined();
  });

  it("asks nothing offline: no", async () => {
    useNetwork.setState({ offline: true });
    expect(await askToConnectAll("t", "d", [{ name: "Tool", request: request("python-env:plugin-tool") }, { name: "Uses", request: request("python-env:plugin-uses") }])).toBe(false);
  });
});

describe("the caret, after a question is answered", () => {
  // (stand-ins for what is on the page: Node has none - the dialog notes what had the caret as its question comes, and gives it back as it is answered)
  const field = () => ({ focus: vi.fn(), isConnected: true }) as unknown as Element & { focus: ReturnType<typeof vi.fn> };
  const outside = () => false;

  it("is back in the field it was in, after Not now and after Allow alike - so Enter there looks up again", () => {
    for (const _answer of ["Not now", "Allow"]) {
      const quickAdd = field();
      noteFocus(quickAdd, outside);
      giveFocusBack();
      expect(quickAdd.focus).toHaveBeenCalledTimes(1);
      expect(quickAdd.focus).toHaveBeenCalledWith({ preventScroll: true });
    }
  });

  it("is given back once: a second click as the dialog goes gives nothing more", () => {
    const quickAdd = field();
    noteFocus(quickAdd, outside);
    giveFocusBack();
    giveFocusBack();
    expect(quickAdd.focus).toHaveBeenCalledTimes(1);
  });

  it("is not taken from a question's own button, nor given to what is no longer on the page", () => {
    const quickAdd = field();
    noteFocus(quickAdd, outside);
    // (the next question comes as the caret is on the one before's button: the field still kept)
    noteFocus(field(), () => true);
    giveFocusBack();
    expect(quickAdd.focus).toHaveBeenCalledTimes(1);
    const gone = { focus: vi.fn(), isConnected: false } as unknown as Element & { focus: ReturnType<typeof vi.fn> };
    noteFocus(gone, outside);
    giveFocusBack();
    expect(gone.focus).not.toHaveBeenCalled();
  });
});
