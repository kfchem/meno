/**
 * A thousand analogues laid out at once, timed, and every one read back
 * against the molecule it was given (src/lib/layout/many.ts): on one thread,
 * then in batches across a pool of worker threads as the app does it
 * (chem/layOut.ts `layOutMany`), then lined up series by series on their
 * cores (`arranged`).
 *
 *   npm run layout-many                 # every analogue
 *   npm run layout-many -- --threads 4  # a pool of four
 *   npm run layout-many -- --smiles     # only writes their SMILES to .layout/analogues.json,
 *   <chem python> scripts/layout/analogues.py   # for RDKit to read: testdata/analogues.facts.json
 *
 * Time it on a machine with nothing else running: a busy one says more of
 * the machine than of the layout.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import type { LayoutInput } from "../../src/lib/layout/perceive";
import { arranged, laidOutChecked, type LaidOut } from "../../src/lib/layout/many";
import { analogues, CORE_SMILES } from "../../src/lib/layout/testdata/analogues";
import { fromSmiles } from "../../src/lib/layout/testdata/fromSmiles";

const BATCH = 16;

if (!isMainThread) {
  // (a worker: each batch it is sent, laid out and read back)
  parentPort!.on("message", (batch: LayoutInput[] | null) => {
    if (!batch) return process.exit(0);
    parentPort!.postMessage(batch.map(laidOutChecked));
  });
  void workerData;
} else {
  const at = process.argv.indexOf("--threads");
  const threads = at > 0 ? Number(process.argv[at + 1]) : Math.max(1, Math.min(8, availableParallelism() - 1));
  const list = analogues();
  if (process.argv.includes("--smiles")) {
    const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../.layout/analogues.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ analogues: list.map((a) => a.smiles) }, null, 1));
    console.log(`wrote ${list.length} SMILES to ${out}`);
    process.exit(0);
  }
  const inputs = list.map((a) => fromSmiles(a.smiles));
  const failed = (laid: readonly LaidOut[]) => laid.filter((l) => l.notAsGiven.length).length;

  let t0 = performance.now();
  const one = inputs.map(laidOutChecked);
  const oneMs = performance.now() - t0;
  console.log(`one thread: ${inputs.length} laid out and read back in ${(oneMs / 1000).toFixed(2)} s; not as given: ${failed(one)}`);

  // (the workers started and each given one small structure first: what is
  // timed is the laying out, not Node starting threads and compiling - the
  // app's workers are started once and kept)
  const workers = Array.from({ length: threads }, () => new Worker(fileURLToPath(import.meta.url), { execArgv: ["--import", "tsx"], workerData: {} }));
  const startedAt = performance.now();
  await Promise.all(workers.map((w) => new Promise<void>((done) => {
    w.once("message", () => done());
    w.postMessage([fromSmiles("CCO")]);
  })));
  console.log(`a pool of ${threads} started in ${((performance.now() - startedAt) / 1000).toFixed(2)} s`);
  t0 = performance.now();
  const pooled: LaidOut[] = new Array(inputs.length);
  let next = 0;
  await Promise.all(
    workers.map(
      (w) =>
        new Promise<void>((done) => {
          let from = 0;
          const give = () => {
            if (next >= inputs.length) {
              w.postMessage(null);
              return done();
            }
            from = next;
            next = Math.min(inputs.length, next + BATCH);
            w.postMessage(inputs.slice(from, next));
          };
          w.on("message", (laid: LaidOut[]) => {
            laid.forEach((l, k) => (pooled[from + k] = l));
            give();
          });
          give();
        }),
    ),
  );
  const poolMs = performance.now() - t0;
  console.log(`a pool of ${threads}: in ${(poolMs / 1000).toFixed(2)} s; not as given: ${failed(pooled)}`);

  t0 = performance.now();
  let after = 0;
  let notCore = 0;
  CORE_SMILES.forEach((core, c) => {
    const idx = list.flatMap((a, i) => (a.core === c ? [i] : []));
    const r = arranged(idx.map((i) => inputs[i]), idx.map((i) => one[i]), { gap: 1.5, core: fromSmiles(core) });
    after += r.notAsGiven.filter((s) => s.length).length;
    notCore += r.series.filter((s) => s.by !== "core").reduce((n, s) => n + s.members.length, 0);
  });
  console.log(`lined up on their cores in ${(performance.now() - t0).toFixed(0)} ms; core not found: ${notCore}; not as given after: ${after}`);
  process.exit(failed(one) || failed(pooled) || after ? 1 : 0);
}
