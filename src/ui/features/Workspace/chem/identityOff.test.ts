import { afterEach, describe, expect, it, vi } from "vitest";
import { constitutionKey, identity } from "../../../../lib/chem/identity";
import { NOT_YET } from "../../../../lib/table";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { drawnHash, recordNow, whenDrawnKnown } from "../workflow/entries";
import { identityInputOf, labelsDrawnOut } from "./identityOf";
import { ANSWER_MOST_MS, constitutionKnown, forgetIdentities, identitiesAsked, identityKnown, IN_PLACE_MOST, useIdentitiesAnswered } from "./identityOff";

// Identities worked out off the drawing thread (./identityOff): a worker stood in for by one that answers later, on a timer, as a
// real one answers after the drawing thread has gone on - what the drawing thread does in the meantime is what is tested.

/** How many structures the stand-in worker has been asked for. */
let asked = 0;
class LaterWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: { id: number; input: Parameters<typeof identity>[0]; kind?: "constitution" }) {
    asked++;
    const found = m.kind === "constitution" ? { text: constitutionKey(m.input), complete: true } : identity(m.input);
    setTimeout(() => this.onmessage?.({ data: { id: m.id, ok: true, found } } as MessageEvent), 0);
  }
  terminate() {}
}
const withWorker = () => {
  (globalThis as { Worker?: unknown }).Worker = LaterWorker;
  asked = 0;
  forgetIdentities();
};
afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker;
  forgetIdentities();
});
const answered = () => new Promise((done) => setTimeout(done, 5));

const PPH3 = "P(c1ccccc1)(c1ccccc1)c1ccccc1";
// (another, for a test that leaves its drawing's key kept: workflow/entries keeps keys by drawing)
const TOLYL = "P(c1ccc(C)cc1)(c1ccc(C)cc1)c1ccc(C)cc1";

describe("a structure's identity, off the drawing thread", () => {
  it("is pending on the drawing thread where it is large and not yet answered, asked of the worker once, and known once answered", async () => {
    withWorker();
    const large = identityInputOf(drawnFromSmiles(PPH3)).input;
    expect(large.atoms.length).toBeGreaterThan(IN_PLACE_MOST);
    const before = useIdentitiesAnswered.getState().answered;
    expect(identityKnown(large)).toBeUndefined();
    expect(identityKnown(large)).toBeUndefined();
    await answered();
    expect(asked).toBe(1);
    expect(identityKnown(large)).toEqual(identity(large));
    expect(useIdentitiesAnswered.getState().answered).toBe(before + 1);
  });

  it("is worked out here where it is small, the worker not asked", () => {
    withWorker();
    const small = identityInputOf(drawnFromSmiles("CC(O)C")).input;
    expect(identityKnown(small)).toEqual(identity(small));
    expect(asked).toBe(0);
  });

  it("is known by what it is, not where it lies: the same structure moved is answered at once", async () => {
    withWorker();
    const m = drawnFromSmiles(PPH3);
    await identitiesAsked([identityInputOf(m).input]);
    const moved = { ...m, atoms: m.atoms.map((a) => ({ ...a, x: a.x + 3, y: a.y - 2 })) };
    expect(identityKnown(identityInputOf(moved).input)).toBeDefined();
    expect(asked).toBe(1);
  });
});

describe("a worker that cannot answer", () => {
  it("is never left pending: the identity is worked out here instead, late, and a record of another structure is then taken off", async () => {
    class FailingWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      postMessage(m: { id: number }) {
        setTimeout(() => this.onmessage?.({ data: { id: m.id, ok: false, error: "it could not" } } as MessageEvent), 0);
      }
      terminate() {}
    }
    (globalThis as { Worker?: unknown }).Worker = FailingWorker;
    forgetIdentities();
    const m = drawnFromSmiles(TOLYL);
    const ids = m.atoms.map((a) => a.id);
    const record = { of: "not this structure", properties: { x: { value: 1, unit: "none" as const, status: "computed" as const } } };
    expect(drawnHash(m, ids)).toBeUndefined();
    // (waited on until it is done, not for a time: the fallback runs after its own timer, late on a busy machine)
    await vi.waitFor(() => expect(drawnHash(m, ids)).toBeDefined());
    expect(recordNow(record, m, ids)?.properties).toBeUndefined();
    expect(await identitiesAsked([identityInputOf(m).input])).toEqual([identity(identityInputOf(m).input)]);
  });

  it("nor where it never answers: past the bound, worked out here", async () => {
    vi.useFakeTimers();
    try {
      (globalThis as { Worker?: unknown }).Worker = class {
        onmessage = null;
        onerror = null;
        postMessage() {}
        terminate() {}
      };
      forgetIdentities();
      const input = identityInputOf(drawnFromSmiles(TOLYL)).input;
      const asked = identitiesAsked([input]);
      await vi.advanceTimersByTimeAsync(ANSWER_MOST_MS + 1);
      expect(await asked).toEqual([identity(input)]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("nor a step that waits on it: its structures put down once worked out here", async () => {
    (globalThis as { Worker?: unknown }).Worker = class {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      postMessage(m: { id: number }) {
        setTimeout(() => this.onmessage?.({ data: { id: m.id, ok: false, error: "it could not" } } as MessageEvent), 0);
      }
      terminate() {}
    };
    forgetIdentities();
    let ran = 0;
    const down = new Promise<void>((go) => whenDrawnKnown([drawnFromSmiles(TOLYL)], () => (ran++, go())));
    expect(ran).toBe(0);
    await down;
    expect(ran).toBe(1);
  });

  it("nor one that stops: what waits on it worked out here, and the next ask made of a new worker", async () => {
    const made: { onerror: ((e: ErrorEvent) => void) | null }[] = [];
    (globalThis as { Worker?: unknown }).Worker = class {
      onmessage = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      constructor() {
        made.push(this);
      }
      postMessage() {}
      terminate() {}
    };
    forgetIdentities();
    const input = identityInputOf(drawnFromSmiles(TOLYL)).input;
    const asked = identitiesAsked([input]);
    made[0].onerror?.({ message: "stopped" } as ErrorEvent);
    expect(await asked).toEqual([identity(input)]);
    void identitiesAsked([identityInputOf(drawnFromSmiles(PPH3)).input]);
    expect(made).toHaveLength(2);
  });

  it("nor where it cannot be made at all", async () => {
    (globalThis as { Worker?: unknown }).Worker = class {
      constructor() {
        throw new Error("no workers here");
      }
    };
    forgetIdentities();
    const input = identityInputOf(drawnFromSmiles(TOLYL)).input;
    expect(await identitiesAsked([input])).toEqual([identity(input)]);
  });
});

describe("a worker still answering", () => {
  it("is never taken for stopped: structures asked together wait behind each other, the bound counted from its last answer", async () => {
    vi.useFakeTimers();
    try {
      // (one at a time, each answered most of the bound after the one before: the last answered well past the bound from its ask)
      const step = Math.round(ANSWER_MOST_MS * 0.7);
      let queue = Promise.resolve();
      let here = 0;
      (globalThis as { Worker?: unknown }).Worker = class {
        onmessage: ((e: MessageEvent) => void) | null = null;
        onerror = null;
        postMessage(m: { id: number; input: Parameters<typeof identity>[0] }) {
          queue = queue.then(
            () =>
              new Promise<void>((done) =>
                setTimeout(() => {
                  this.onmessage?.({ data: { id: m.id, ok: true, found: { text: `from the worker ${m.id}`, complete: true } } } as MessageEvent);
                  done();
                }, step),
              ),
          );
        }
        terminate() {}
      };
      forgetIdentities();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => here++);
      const inputs = [PPH3, TOLYL, "P(c1ccc(F)cc1)(c1ccc(F)cc1)c1ccc(F)cc1"].map((s) => identityInputOf(drawnFromSmiles(s)).input);
      const all = identitiesAsked(inputs);
      await vi.advanceTimersByTimeAsync(step * inputs.length + 1);
      expect((await all).map((f) => f.text.startsWith("from the worker"))).toEqual([true, true, true]);
      expect(here).toBe(0);
      warn.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the worker's silence", () => {
  /** A stand-in worker that answers only when the test says, and says whether it was let go. */
  const standIn = () => {
    const made: { posted: { id: number; input: Parameters<typeof identity>[0] }[]; ended: boolean; answer: (k: number) => void }[] = [];
    (globalThis as { Worker?: unknown }).Worker = class {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror = null;
      posted: { id: number; input: Parameters<typeof identity>[0] }[] = [];
      ended = false;
      constructor() {
        made.push(this);
      }
      postMessage(m: { id: number; input: Parameters<typeof identity>[0] }) {
        this.posted.push(m);
      }
      answer(k: number) {
        const m = this.posted[k];
        this.onmessage?.({ data: { id: m.id, ok: true, found: { text: "from the worker", complete: true } } } as MessageEvent);
      }
      terminate() {
        this.ended = true;
      }
    };
    forgetIdentities();
    return made;
  };
  const inputs = () => [PPH3, TOLYL].map((s) => identityInputOf(drawnFromSmiles(s)).input);

  it("is counted from the first ask while nothing answers, not again at each: a worker that never answers is let go a minute after", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const made = standIn();
      const [a, b] = inputs();
      const first = identitiesAsked([a]);
      await vi.advanceTimersByTimeAsync(ANSWER_MOST_MS * 0.7);
      void identitiesAsked([b]);
      await vi.advanceTimersByTimeAsync(ANSWER_MOST_MS * 0.3 + 1);
      expect(await first).toEqual([identity(a)]);
      expect(made[0].ended).toBe(true);
      // (and nothing of what waited on the worker let go is left waiting: the next one, once it has answered, is kept)
      const next = identitiesAsked([identityInputOf(drawnFromSmiles("P(c1ccc(F)cc1)(c1ccc(F)cc1)c1ccc(F)cc1")).input]);
      made[1].answer(0);
      expect((await next)[0].text).toBe("from the worker");
      await vi.advanceTimersByTimeAsync(ANSWER_MOST_MS * 2);
      expect(made[1].ended).toBe(false);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("is not counted while nothing waits: a worker that has answered everything is kept, however long it is idle", async () => {
    vi.useFakeTimers();
    try {
      const made = standIn();
      const [a] = inputs();
      const asked = identitiesAsked([a]);
      made[0].answer(0);
      expect((await asked)[0].text).toBe("from the worker");
      await vi.advanceTimersByTimeAsync(ANSWER_MOST_MS * 2);
      expect(made[0].ended).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is not counted for an ask the worker could not take: worked out here, and the worker kept", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const made: { ended: boolean }[] = [];
      (globalThis as { Worker?: unknown }).Worker = class {
        onmessage = null;
        onerror = null;
        ended = false;
        constructor() {
          made.push(this);
        }
        postMessage() {
          throw new Error("could not take it");
        }
        terminate() {
          this.ended = true;
        }
      };
      forgetIdentities();
      const [a] = inputs();
      const asked = identitiesAsked([a]);
      await vi.advanceTimersByTimeAsync(1);
      expect(await asked).toEqual([identity(a)]);
      await vi.advanceTimersByTimeAsync(ANSWER_MOST_MS * 2);
      expect(made).toHaveLength(1);
      expect(made[0].ended).toBe(false);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("what waits on an identity", () => {
  it("keeps a record as it stands while its structure's identity is pending - never taken for another - and judges it once known", async () => {
    withWorker();
    const m = drawnFromSmiles(PPH3);
    const ids = m.atoms.map((a) => a.id);
    const record = { of: "not this structure", properties: { x: { value: 1, unit: "none" as const, status: "computed" as const } } };
    expect(drawnHash(m, ids)).toBeUndefined();
    expect(recordNow(record, m, ids)).toBe(record);
    await answered();
    expect(recordNow(record, m, ids)?.properties).toBeUndefined();
  });

  it("puts a step's structures down once their identities are known: at once where they are, after the answer where not", async () => {
    withWorker();
    let ran = 0;
    whenDrawnKnown([drawnFromSmiles("CC(O)C")], () => ran++);
    expect(ran).toBe(1);
    whenDrawnKnown([drawnFromSmiles(PPH3)], () => ran++);
    expect(ran).toBe(1);
    await answered();
    expect(ran).toBe(2);
  });

  it("writes a table's constitution cell as still being worked out while pending, and its key once answered", async () => {
    withWorker();
    const input = identityInputOf(labelsDrawnOut(drawnFromSmiles(PPH3))).input;
    expect(constitutionKnown(input)).toBe(NOT_YET);
    await answered();
    expect(constitutionKnown(input)).toBe(constitutionKey(input));
  });
});
