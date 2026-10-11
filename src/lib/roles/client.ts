/**
 * Asking the worker of a plugin that fills the chemistry roles (lib/plugins/
 * roles; RDKit's, for now: resources/plugins/rdkit/worker.py): one JSON
 * object a line each way, answers matched to questions by id. The worker
 * answers a fixed set of requests - these, the roles' contract - and runs
 * nothing else. Molecules go to it, and come back, as MOL blocks.
 *
 * The transport is handed in, so that the client knows nothing of how the
 * worker runs (a sidecar, here; anything that carries lines, in tests).
 */
import type { OptionValues } from "../options";
import { counter } from "../calc/client";

/** The requests the worker answers, and what each answers with. */
export type ChemRequests = {
  to_smiles: { args: { molblock: string }; result: { smiles: string } };
  from_smiles: { args: { smiles: string }; result: { molblock: string } };
  /** Hydrogens, valence, aromaticity and stereo labels, per atom and bond. */
  analyse: { args: { molblock: string }; result: Analysis };
  /**
   * The stereocentres and double bonds left open, by index, and how many
   * stereoisomers they make - but for those `like` gives a configuration.
   */
  open_stereo: { args: { molblock: string; like?: Like }; result: OpenStereo };
  /**
   * Conformers of a structure, made in 3D (ETKDG, then MMFF94): of the first
   * of its stereoisomers, or of each, where some of its stereo is left open
   * - and `like` does not give it. Of two enantiomers, one is made as the
   * other's mirror image.
   */
  conformers: {
    /** `options`: those the plugin declares for the role (its manifest's roleOptions), as chosen in Settings. */
    args: { molblock: string; isomers?: "one" | "all"; count?: number; like?: Like; options?: OptionValues };
    result: { isomers: Conformers[] };
  };
  /**
   * A molecule in 3D as a formula to draw: its heavy atoms in their order,
   * laid out in 2D and wedged as it is in 3D; its bonds' orders found where
   * they are not known (`perceive`).
   */
  drawing_of: { args: { molblock: string; perceive?: boolean }; result: { molblock: string } };
};

export type OpenStereo = { atoms: number[]; bonds: number[]; isomers: number };

/**
 * Some of a block's atoms, by index, where a molecule in 3D made from it
 * before has them: a stereocentre or double bond the block leaves open is
 * made as it is there, where it and the atoms bonded to it all have a place.
 */
export type Like = Record<number, [number, number, number]>;

/**
 * One stereoisomer's conformers: its atoms - those of the block in their
 * order, then the hydrogens made for them - its bonds by index, each
 * conformer's coordinates in angstroms, laid over the first, and its energy
 * in hartrees, lowest first; the force field's name; and the CIP label of
 * every stereocentre and double bond, and of those that were left open and
 * chosen, by the block's atom and bond index.
 */
export type Conformers = {
  atoms: { el: string; charge: number }[];
  bonds: { a1: number; a2: number; order: 1 | 2 | 3 }[];
  frames: number[][];
  energies: number[];
  field: string;
  /** How they were made, as rows to show - what made them, the method, the force field - in the plugin's words. */
  how?: { label: string; text: string }[];
  cip: { atoms: Record<string, string>; bonds: Record<string, string> };
  chosen: { atoms: Record<string, string>; bonds: Record<string, string> };
  smiles: string;
};

export type ChemOp = keyof ChemRequests;

export type Analysis = {
  atoms: {
    index: number;
    hydrogens: number;
    /**
     * More bonds than the atom can have: its valence, and the most it can
     * be, when that is known.
     */
    valenceError?: { valence: number; most?: number };
    cip?: "R" | "S" | "r" | "s";
    aromatic?: boolean;
  }[];
  /** A bond's CIP descriptor: E or Z, or an axis of chirality's M or P. */
  bonds: { index: number; aromatic?: boolean; cip?: "E" | "Z" | "M" | "P" }[];
};

/** What carries lines to the worker and back. */
export type ChemTransport = {
  send(line: string): void;
  /** Calls `onLine` for every line the worker writes; returns the unsubscribe. */
  listen(onLine: (line: string) => void): () => void;
};

/** An answer that is an error: the plugin could not do what was asked. */
export class ChemError extends Error {}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** How long an answer may take before it is given up on. */
const TIMEOUT_MS = 30_000;

export class ChemClient {
  private pending = new Map<number, Pending>();
  private stop: () => void;
  /** The plugin's version, once the worker has said it is ready. */
  version: string | null = null;
  readonly ready: Promise<string>;

  constructor(
    private transport: ChemTransport,
    private timeoutMs = TIMEOUT_MS,
    /** What the plugin is called, in what is said of it. */
    private name = "The plugin",
    /** Where its questions' ids come from: shared with the other clients of the same worker (lib/calc/client `counter`). */
    private ids: () => number = counter(),
  ) {
    let markReady!: (v: string) => void;
    this.ready = new Promise((resolve) => (markReady = resolve));
    this.stop = transport.listen((line) => this.receive(line, markReady));
  }

  private receive(line: string, markReady: (v: string) => void) {
    let m: {
      id?: number;
      ok?: boolean;
      result?: unknown;
      error?: string;
      event?: string;
      version?: string;
    };
    try {
      m = JSON.parse(line);
    } catch {
      return; // not an answer: what the plugin's library printed, say
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
    else p.reject(new ChemError(m.error ?? `${this.name} could not answer`));
  }

  /**
   * Asks the worker; the answer, or an error saying why there is none -
   * after `timeoutMs`, if given, for what takes long.
   */
  request<Op extends ChemOp>(
    op: Op,
    args: ChemRequests[Op]["args"],
    timeoutMs = this.timeoutMs,
  ): Promise<ChemRequests[Op]["result"]> {
    const id = this.ids();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ChemError(`${this.name} did not answer ${op} in time`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      this.transport.send(JSON.stringify({ id, op, ...args }));
    });
  }

  /** Stops listening; whatever is still waiting fails. */
  close(reason = "the chemistry worker stopped"): void {
    this.stop();
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new ChemError(reason));
      this.pending.delete(id);
    }
  }
}
