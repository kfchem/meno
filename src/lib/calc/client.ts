/**
 * Asking a plugin's worker that reads or writes files
 * (resources/plugins/<id>/worker.py): one JSON object a line each way,
 * answers matched to questions by id, as the worker of a plugin that fills
 * a role is asked (lib/roles/client). It reads what it is sent, and writes
 * what it is given, and nothing else.
 *
 * The transport is handed in, so that the client knows nothing of how the
 * worker runs (a sidecar, here; anything that carries lines, in tests).
 */
import type { ReaderOutput } from "./output";
import type { OptionValues } from "../options";
import type { WrittenMolecule } from "../io/writers";

/**
 * A reader, however it runs - a plugin's worker, or Meno's own: what it
 * makes of a file of a kind - Meno says which, having told what the file is
 * (lib/io/kinds) - a promise it gave, asked for, and whether a file is of a
 * kind it told Meno it tells itself.
 */
export interface Reader {
  /** Its version, once it has said; Meno's own, empty. */
  version: string | null;
  read(kind: string, name: string, text: string): Promise<ReaderOutput>;
  /** What a promise it gave stands for - by its key - the file's name and text sent again. */
  ask(kind: string, key: string, name: string, text: string): Promise<unknown>;
  /** Whether a file - by its name and its start - is of `kind`, one the reader tells itself (`probe` in its manifest). */
  probe(kind: string, name: string, head: string): Promise<boolean>;
  /**
   * A file of `kind`, one it writes (`writes` in its manifest), named
   * `name`: what it holds, made of the molecules given with the options
   * chosen. Meno writes it where the chemist said.
   */
  write(kind: string, name: string, molecules: readonly WrittenMolecule[], options: OptionValues): Promise<string>;
}

export type ReaderTransport = {
  send(line: string): void;
  /** Hears each line the worker writes; the function returned stops it. */
  listen(onLine: (line: string) => void): () => void;
};

/** How long a reader may take over one file: a long output, a slow machine. */
const TIMEOUT_MS = 120_000;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Ids counted from 1: a worker's, for the clients that share it. */
export function counter(): () => number {
  let next = 1;
  return () => next++;
}

export class ReaderClient implements Reader {
  private pending = new Map<number, Pending>();
  private stop: () => void;
  /** The reader's version, once its worker has said it is ready. */
  version: string | null = null;
  readonly ready: Promise<string>;

  constructor(
    /** What it is called in messages: "cclib". */
    private name: string,
    private transport: ReaderTransport,
    private timeoutMs = TIMEOUT_MS,
    /** Where its questions' ids come from: shared with the other clients of the same worker, so that each hears only its own answers. */
    private ids: () => number = counter(),
  ) {
    let markReady!: (v: string) => void;
    this.ready = new Promise((resolve) => (markReady = resolve));
    this.stop = transport.listen((line) => this.receive(line, markReady));
  }

  private receive(line: string, markReady: (v: string) => void) {
    let m: { id?: number; ok?: boolean; result?: unknown; error?: string; event?: string; version?: string };
    try {
      m = JSON.parse(line);
    } catch {
      return; // not an answer: what the reader's library printed, say
    }
    if (m.event === "ready") {
      this.version = m.version ?? "";
      markReady(this.version);
      return;
    }
    const p = typeof m.id === "number" ? this.pending.get(m.id) : undefined;
    if (!p) return;
    this.pending.delete(m.id!);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(m.error ?? `${this.name} could not read it`));
  }

  /** What the reader makes of a file of `kind`: its name, as given, and its text. */
  read(kind: string, name: string, text: string): Promise<ReaderOutput> {
    return this.request({ op: "read", kind, name, text }, `reading ${name}`) as Promise<ReaderOutput>;
  }

  /** What a promise the reader gave stands for, by its key: the file it read sent again. */
  ask(kind: string, key: string, name: string, text: string): Promise<unknown> {
    return this.request({ op: "ask", kind, key, name, text }, `working out ${key} of ${name}`);
  }

  /** Whether a file is of `kind`, by its name and its start: the reader's own answer, yes only where it says so. */
  async probe(kind: string, name: string, head: string): Promise<boolean> {
    const said = (await this.request({ op: "probe", kind, name, head }, `looking at ${name}`)) as { yes?: unknown } | null;
    return said?.yes === true;
  }

  /** A file of `kind`, as the plugin writes it: its text. */
  async write(kind: string, name: string, molecules: readonly WrittenMolecule[], options: OptionValues): Promise<string> {
    const made = (await this.request({ op: "write", kind, name, molecules, options }, `writing ${name}`)) as { text?: unknown } | null;
    if (typeof made?.text !== "string") throw new Error(`${this.name} wrote nothing for ${name}`);
    return made.text;
  }

  /**
   * What a plugin's jobs for a step are (docs/WORKFLOWS.md, *What changes in
   * the contract*): each one's input files, the program and arguments that
   * run it, the entries it is for, and the files it reads back once done.
   */
  prepare(step: string, entries: readonly unknown[], options: OptionValues, cores?: number): Promise<unknown> {
    return this.request({ op: "prepare", step, entries, options, ...(cores ? { cores } : {}) }, `preparing ${step}`);
  }

  /** What a job for a step gave, read back by its plugin from the files asked for and its log - or why it did not, where it did not end done. */
  collect(step: string, entries: readonly unknown[], options: OptionValues, files: Record<string, string>, log: string, ended: string): Promise<unknown> {
    return this.request({ op: "collect", step, entries, options, files, log, ended }, `reading what ${step} gave`);
  }

  /** A step a plugin does at once, on the entries that came in - a conformer set's (`holds`) or a compound set's: what it did (docs/WORKFLOWS.md, `run`). */
  run(step: string, entries: readonly unknown[], options: OptionValues, holds: string): Promise<unknown> {
    return this.request({ op: "run", step, entries, options, holds }, `doing ${step}`);
  }

  private request(question: Record<string, unknown>, what: string): Promise<unknown> {
    const id = this.ids();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name} did not finish ${what} in time`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.transport.send(JSON.stringify({ id, ...question }));
    });
  }

  /** Stops listening; whatever is still waiting fails. */
  close(reason = `the ${this.name} reader stopped`): void {
    this.stop();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
