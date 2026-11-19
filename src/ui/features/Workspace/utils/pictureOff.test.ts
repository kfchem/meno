import { afterEach, describe, expect, it, vi } from "vitest";
import { pictureReadOff } from "./pictureOff";
import type { PicturePngJob } from "./tracedPicture";

/** A worker played here: what it was given, answering when told to. */
const made: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: { message: { id: number; job: PicturePngJob }; transfer: Transferable[] }[] = [];
  constructor(public url: URL) {
    made.push(this);
  }
  postMessage(message: { id: number; job: PicturePngJob }, transfer: Transferable[] = []) {
    this.posted.push({ message, transfer });
  }
}

describe("a picture read off the drawing's thread", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("goes to its worker as its PNG, handed over, to be decoded there - never its pixels, decoded on the drawing's thread", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const png = new Uint8Array([137, 80, 78, 71]).buffer as ArrayBuffer;
    void pictureReadOff({ png, at: { scale: 1, x: 0, y: 0 }, known: [], letters: [] });
    expect(made).toHaveLength(1);
    expect(made[0].url.pathname).toMatch(/pictureWorker\.ts$/);
    const [sent] = made[0].posted;
    expect(sent.transfer).toEqual([png]);
    expect(Object.keys(sent.message.job).sort()).toEqual(["at", "known", "letters", "png"]);
  });
});
