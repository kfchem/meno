// @vitest-environment node
/**
 * Enumerate's worker (./enumerateWorker), run as a worker runs it: with no window, document or localStorage, `self` standing for the
 * worker's scope. It loads; it answers a message, by lists and by substituents, with what a worker can post (it survives
 * `structuredClone`) and what Enumerate gives in place; and an error inside is answered, not thrown (found in review).
 */
import { describe, expect, it } from "vitest";
import { isDeepStrictEqual } from "node:util";
import type { EnumerateAsked } from "./enumerateOff";

type Posted = { id: number; ok: boolean; made?: unknown; error?: string };

describe("Enumerate's worker, as a worker runs it: no DOM, messages in and out", () => {
  it("loads with no window or document, and answers each message with what a worker can post, as Enumerate gives it in place", async () => {
    const scope: { postMessage?: (m: Posted) => void; onmessage?: (e: { data: { id: number; asked: EnumerateAsked } }) => void } = {};
    (globalThis as { self?: unknown }).self = scope;
    const posted: Posted[] = [];
    scope.postMessage = (m) => posted.push(m);
    await import("./enumerateWorker");
    expect(typeof scope.onmessage).toBe("function");
    const { drawnFromSmiles } = await import("../chem/testdata/identityCases");
    const { template } = await import("./testdata/enumerationCases");
    const { enumerated } = await import("./enumerate");
    const { substituted } = await import("./substituents");
    const t = template("F[C@H](*)Cl");
    const text = "R1: Me\nEt\nPh\nH\nOMe";
    scope.onmessage!({ data: { id: 7, asked: { way: "lists", template: t, text } } });
    expect(posted[0]).toMatchObject({ id: 7, ok: true });
    expect(isDeepStrictEqual(structuredClone(posted[0].made), enumerated(t, text))).toBe(true);
    const xyl = drawnFromSmiles("Cc1ccc(C)cc1");
    scope.onmessage!({ data: { id: 8, asked: { way: "substituents", template: xyl, positions: [3, 8], text: "Cl\nBr", combine: "one" } } });
    expect(posted[1]).toMatchObject({ id: 8, ok: true });
    expect(isDeepStrictEqual(structuredClone(posted[1].made), substituted(xyl, [3, 8], "Cl\nBr", "one", undefined))).toBe(true);
    // (an error inside: answered, not thrown)
    scope.onmessage!({ data: { id: 9, asked: { way: "lists", template: undefined as never, text } } });
    expect(posted[2]).toMatchObject({ id: 9, ok: false });
  });
});
