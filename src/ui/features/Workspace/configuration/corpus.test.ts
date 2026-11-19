import { afterEach, beforeEach, describe, vi } from "vitest";
import { CORPUS } from "./corpus";
import { corpusTest } from "./corpusCheck";

// Part of the configuration corpus: its own entries (corpus.ts), each kind of unit Meno reads (the check: corpusCheck.ts).

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the configuration corpus: read(draw(c)) = c", () => {
  for (const entry of CORPUS) corpusTest(entry);
});
