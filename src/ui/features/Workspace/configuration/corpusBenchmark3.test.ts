import { afterEach, beforeEach, describe, vi } from "vitest";
import { BENCHMARK, corpusTest } from "./corpusCheck";

// Part of the configuration corpus: the layout benchmark's molecules with a configuration, the third of three parts (three files,
// so that they run side by side; the check: corpusCheck.ts).

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the configuration corpus, the benchmark's molecules (3 of 3): read(draw(c)) = c", () => {
  BENCHMARK.filter((_, i) => i % 3 === 2).forEach(corpusTest);
});
