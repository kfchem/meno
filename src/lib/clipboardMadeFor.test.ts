// Held beside clipboard.test.ts: copyMadeFor is the age of the EARLIEST copy still being made - with two being made at once it is the
// older's, and where the older is done it is the younger's.
import { describe, expect, it, vi } from "vitest";
import { copyMadeFor, copying } from "./clipboard";

describe("how long a copy has been made, with two copies at once", () => {
  it("is the older one's age while both are being made, then the younger's once the older is done", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout"] });
    try {
      let finishOld!: () => void;
      const old = copying(() => new Promise<void>((done) => (finishOld = done)));
      vi.advanceTimersByTime(200);
      let finishYoung!: () => void;
      const young = copying(() => new Promise<void>((done) => (finishYoung = done)));
      vi.advanceTimersByTime(100);
      expect(copyMadeFor()).toBe(300);
      finishOld();
      await old;
      await Promise.resolve();
      expect(copyMadeFor()).toBe(100);
      finishYoung();
      await young;
      await Promise.resolve();
      expect(copyMadeFor()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
