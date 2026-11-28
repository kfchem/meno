import { describe, expect, it } from "vitest";
import { cameBack, sayCameBack, tellOpenFiles, whileSaving } from "./pageBack";

/** An app that answers as src-tauri/src/pagestop.rs does: the words once, after a stop; none at any other start. */
function app(words: string | null) {
  let left = words;
  const asked: [string, Record<string, unknown>][] = [];
  const to = async (command: string, args: Record<string, unknown>) => {
    asked.push([command, args]);
    if (command !== "page_came_back") return null;
    const said = left;
    left = null;
    return said;
  };
  return { to, asked };
}

const STOPPED = "Meno's window stopped working and was started again. What was not saved is lost.";
const DURING = `${STOPPED} Route.meno was being saved, and that save did not happen: Route.meno is as it was before.`;

describe("the page started again after it stopped", () => {
  it("says what came of the work once, in the app's words, either way", async () => {
    for (const words of [STOPPED, DURING]) {
      const { to } = app(words);
      const said: string[] = [];
      await sayCameBack((w) => said.push(w), to);
      // (asked again - as a second mount asks - nothing more)
      await sayCameBack((w) => said.push(w), to);
      expect(said).toEqual([words]);
    }
  });

  it("says nothing at an ordinary start, nor where the app cannot be asked", async () => {
    const said: string[] = [];
    await sayCameBack((w) => said.push(w), app(null).to);
    await sayCameBack((w) => said.push(w), () => Promise.reject(new Error("no app")));
    expect(said).toEqual([]);
    expect(await cameBack(() => Promise.reject(new Error("no app")))).toBeNull();
  });
});

describe("what the page tells the app as it goes", () => {
  it("tells of a save by its file's name as it begins, and that it ended however it ends", async () => {
    const { to, asked } = app(null);
    expect(await whileSaving("/home/someone/Route.meno", async () => "saved", to)).toBe("saved");
    await expect(whileSaving("C:\\w\\Other.meno", () => Promise.reject(new Error("full")), to)).rejects.toThrow("full");
    const saving = asked.filter(([c]) => c === "page_saving").map(([, a]) => a.name);
    expect(saving).toEqual(["Route.meno", null, "Other.meno", null]);
  });

  it("begins the save only once the app is told of it", async () => {
    const order: string[] = [];
    let tell: () => void = () => {};
    const to = (command: string, args: Record<string, unknown>) => {
      if (command !== "page_saving" || args.name === null) return Promise.resolve(null);
      return new Promise((done) => (tell = () => (order.push("told"), done(null))));
    };
    const saved = whileSaving("/w/a.meno", async () => void order.push("written"), to);
    await Promise.resolve();
    expect(order).toEqual([]);
    tell();
    await saved;
    expect(order).toEqual(["told", "written"]);
  });

  it("tells the files the tabs hold where they changed, not again where they did not", () => {
    const { to, asked } = app(null);
    tellOpenFiles(["/w/a.meno"], to);
    tellOpenFiles(["/w/a.meno"], to);
    tellOpenFiles(["/w/a.meno", "/w/b.meno"], to);
    tellOpenFiles([], to);
    expect(asked.map(([, a]) => a.paths)).toEqual([["/w/a.meno"], ["/w/a.meno", "/w/b.meno"], []]);
  });
});
