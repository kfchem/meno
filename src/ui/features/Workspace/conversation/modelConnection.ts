/**
 * A conversation's connection through a plugin that talks with a model
 * (docs/CONVERSATIONS.md, *Connections*): the plugin filling the
 * language-model role. What leaves the computer goes to the hosts its
 * manifest names, and those alone, once the person has allowed it - asked
 * the first time, by those hosts and by what goes there. The person's key
 * is never the page's: the backend adds it to the request on the way to the
 * plugin's worker (src-tauri/src/model.rs).
 */
import type { PythonPlugin } from "../../../../lib/calc/catalog";
import { askToConnect, useNetwork, type ConsentRequest } from "../../../../lib/net/network";
import { stopWorker, workerOf, workerRunning, type PluginWorker } from "../../../../lib/plugins/process";
import { roleOptionsRole } from "../../../../lib/plugins/roles";
import { valuesOf, type OptionValues } from "../../../../lib/options";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { Connection, ModelReply, ModelRequest } from "./turn";
import type { ToolCall } from "./types";

/** Names in words: "a", "a and b", "a, b and c". */
const listSaid = (names: readonly string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The role a model's plugin fills (lib/plugins/roles). */
export const MODEL_ROLE = "language-model" as const;

/**
 * How long a model may take to answer, whole - nothing of a reply is shown
 * till it is: 10 minutes, as long as a model service's own SDK waits for one
 * request by default. A plugin gives up within it, in words.
 */
export const REPLY_MS = 600_000;

/** The most a model's words may be: as much as a conversation keeps of one (./saved). */
const MOST_TEXT = 1_000_000;

/** The most tools it may call in one reply. */
const MOST_CALLS = 64;

/** The most what a plugin keeps of a reply may be, as JSON. */
const MOST_KEEP = 2_000_000;

/**
 * The purpose a model's plugin uses the network under, its hosts in it, in
 * order (src-tauri/src/model.rs `purpose`, the same): a yes is for those
 * hosts - a plugin updated to name others is asked of again.
 */
export const modelPurpose = (plugin: string, hosts: readonly string[]) => `model:${plugin}@${[...hosts].sort().join(",")}`;

/** The question asked before a conversation first goes to a plugin's hosts: where it goes, and what goes there. */
export function consentOf(p: PythonPlugin): ConsentRequest {
  const hosts = p.roleHosts?.[MODEL_ROLE] ?? [];
  return {
    purpose: modelPurpose(p.id, hosts),
    title: `Send this conversation to ${listSaid(hosts)}, for ${p.name}?`,
    detail: "What is said in it, and what it is given, goes there.",
    sources: [`${p.name}: ${hosts.join(", ")}`],
    hosts,
  };
}

/** What Meno does not read of a plugin's answer. */
export const NOT_READ = "The model's plugin gave what Meno does not read";

/**
 * A plugin's answer, read strictly: its words - plain text, at most
 * MOST_TEXT - and the tools it calls, each by name with its arguments as an
 * object; or its error, in its words. Anything else is refused, never
 * guessed at.
 */
export function replyOf(raw: unknown): ModelReply {
  const r = raw as Record<string, unknown> | null;
  if (typeof r !== "object" || r === null || Array.isArray(r)) throw new Error(NOT_READ);
  if (typeof r.text !== "string" || r.text.length > MOST_TEXT) throw new Error(NOT_READ);
  // (what it keeps of the reply: its own, opaque - taken as it is, within its bound)
  const kept = r.keep === undefined ? {} : (JSON.stringify(r.keep)?.length ?? Infinity) <= MOST_KEEP ? { keep: r.keep } : null;
  if (!kept) throw new Error(NOT_READ);
  if (r.calls === undefined) return { text: r.text, ...kept };
  if (!Array.isArray(r.calls) || r.calls.length > MOST_CALLS) throw new Error(NOT_READ);
  const calls: ToolCall[] = r.calls.map((c) => {
    const call = c as Record<string, unknown> | null;
    if (typeof call !== "object" || call === null || typeof call.tool !== "string" || !call.tool) throw new Error(NOT_READ);
    const args = call.args;
    if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) throw new Error(NOT_READ);
    return args === undefined ? { tool: call.tool } : { tool: call.tool, args: args as Record<string, unknown> };
  });
  return calls.length ? { text: r.text, calls, ...kept } : { text: r.text, ...kept };
}

/** What a connection is made of, Meno's own unless a test gives its own. */
export type ModelSteps = {
  ask: (request: ConsentRequest) => Promise<boolean>;
  allowed: (purpose: string) => boolean;
  worker: (p: PythonPlugin) => Promise<PluginWorker>;
  running: (plugin: string) => boolean;
  stop: (plugin: string, why: string) => Promise<void>;
  options: (p: PythonPlugin) => OptionValues;
};

/** The plugin's options for the role, as the person set them in Settings, Conversations. */
const rememberedOptions = (p: PythonPlugin): OptionValues => valuesOf(p.roleOptions[MODEL_ROLE] ?? [], useAppSettings.getState().options[roleOptionsRole(MODEL_ROLE)]);

/**
 * A conversation's connection through `p`: each request asked of its
 * worker as `converse` - the person asked first, the first time, whether it
 * may go to its hosts; a no sends nothing.
 */
export function modelConnection(p: PythonPlugin, steps: ModelSteps = MENO_STEPS): Connection {
  const hosts = p.roleHosts?.[MODEL_ROLE] ?? [];
  return {
    id: p.id,
    to: hosts.join(", "),
    async send(request: ModelRequest): Promise<ModelReply> {
      const purpose = modelPurpose(p.id, hosts);
      const before = steps.allowed(purpose);
      if (!(await steps.ask(consentOf(p)))) throw new Error(`Nothing was sent: sending to ${listSaid(hosts)} was not allowed.`);
      // (its worker started before it was allowed went out nowhere: started again, now it may - the backend begins its task as it starts)
      if (!before && steps.running(p.id)) await steps.stop(p.id, `${p.name} was started again: it may now talk to ${listSaid(hosts)}`);
      const worker = await steps.worker(p);
      const raw = await worker.chem.request("converse", { told: request.told, said: request.said, tools: request.tools, options: steps.options(p) }, REPLY_MS);
      return replyOf(raw);
    },
  };
}

const MENO_STEPS: ModelSteps = {
  ask: askToConnect,
  allowed: (purpose) => useNetwork.getState().granted.includes(purpose),
  worker: workerOf,
  running: workerRunning,
  stop: stopWorker,
  options: rememberedOptions,
};
