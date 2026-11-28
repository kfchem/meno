import { describe, expect, it } from "vitest";
import { cameBack, saveTokenFor, sayCameBack, tellOpenFiles, whileSaving } from "./pageBack";

type Heard = (event: string, handler: () => void) => Promise<() => void>;

/** An app that answers as src-tauri/src/pagestop.rs does: the words once, after a stop, and what is said later once; none at any other start. */
function app(now: string | null, later: string | null = null) {
  const left: Record<string, string | null> = { page_came_back: now, page_came_back_later: later };
  const asked: [string, Record<string, unknown>][] = [];
  let tokens = 0;
  let told: () => void = () => {};
  const to = async (command: string, args: Record<string, unknown>) => {
    asked.push([command, args]);
    if (command === "page_saving") return ++tokens;
    if (!(command in left)) return null;
    const said = left[command];
    left[command] = null;
    return said;
  };
  const hear: Heard = async (_event, handler) => {
    told = handler;
    return () => {};
  };
  return { to, asked, hear: hear as never, tell: () => told(), setLater: (w: string) => (left.page_came_back_later = w) };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

const STOPPED = "Meno's window stopped working and was started again. What was not saved is lost.";
const DURING = `${STOPPED} Route.meno was being saved, and that save did not happen: Route.meno is as it was before.`;
const PENDING = `${STOPPED} Route.meno was being saved: what came of that save is said here once it has ended.`;
const ENDED = "Route.meno was being saved, and the save was finished: Route.meno is as saved. It is open again.";

describe("the page started again after it stopped", () => {
  it("says what came of the work once, in the app's words, either way", async () => {
    for (const words of [STOPPED, DURING]) {
      const { to, hear } = app(words);
      const said: string[] = [];
      sayCameBack((w) => said.push(w), to, hear);
      // (asked again - as a second mount asks - nothing more)
      sayCameBack((w) => said.push(w), to, hear);
      await settle();
      expect(said).toEqual([words]);
    }
  });

  it("says what came of a save being written once it has ended, after what it said at once", async () => {
    const back = app(PENDING);
    const said: string[] = [];
    sayCameBack((w) => said.push(w), back.to, back.hear);
    await settle();
    expect(said).toEqual([PENDING]);
    back.setLater(ENDED);
    back.tell();
    await settle();
    back.tell();
    await settle();
    expect(said).toEqual([PENDING, ENDED]);
  });

  it("says what was said later even where the app told it before the page listened", async () => {
    const back = app(PENDING, ENDED);
    const said: string[] = [];
    sayCameBack((w) => said.push(w), back.to, back.hear);
    await settle();
    expect(said).toEqual([PENDING, ENDED]);
  });

  it("says nothing at an ordinary start, nor where the app cannot be asked", async () => {
    const said: string[] = [];
    const ordinary = app(null);
    sayCameBack((w) => said.push(w), ordinary.to, ordinary.hear);
    sayCameBack((w) => said.push(w), () => Promise.reject(new Error("no app")), ordinary.hear);
    await settle();
    expect(said).toEqual([]);
    expect(await cameBack(() => Promise.reject(new Error("no app")))).toBeNull();
  });
});

describe("what the page tells the app as it goes", () => {
  it("tells of a save by its file's name as it begins, sends its write with the save's token, and ends it however it ends", async () => {
    const { to, asked } = app(null);
    let during: number | undefined;
    expect(await whileSaving("/home/someone/Route.meno", async () => ((during = saveTokenFor("/real/Route.meno")), "saved"), to)).toBe("saved");
    expect(during).toBe(1);
    // (a file of another name written meanwhile is not the save's)
    await whileSaving("C:\\w\\Other.meno", async () => expect(saveTokenFor("C:\\w\\Other.svg")).toBeUndefined(), to);
    await expect(whileSaving("C:\\w\\Other.meno", () => Promise.reject(new Error("full")), to)).rejects.toThrow("full");
    expect(asked.filter(([c]) => c === "page_saving" || c === "page_saved").map(([c, a]) => `${c} ${String(a.name ?? a.token)}`)).toEqual([
      "page_saving Route.meno",
      "page_saved 1",
      "page_saving Other.meno",
      "page_saved 2",
      "page_saving Other.meno",
      "page_saved 3",
    ]);
    // (none once it has ended)
    expect(saveTokenFor("/home/someone/Route.meno")).toBeUndefined();
  });

  it("begins the save only once the app is told of it", async () => {
    const order: string[] = [];
    let tell: () => void = () => {};
    const to = (command: string) => {
      if (command !== "page_saving") return Promise.resolve(null);
      return new Promise((done) => (tell = () => (order.push("told"), done(7))));
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
    expect(asked.filter(([c]) => c === "page_files").map(([, a]) => a.paths)).toEqual([["/w/a.meno"], ["/w/a.meno", "/w/b.meno"], []]);
  });
});
