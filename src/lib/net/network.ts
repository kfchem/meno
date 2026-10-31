import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { PLUGINS } from "../calc/catalog";

/**
 * What Meno does on the network, as the window sees it. The app keeps the
 * record and lets connections through or not (src-tauri/src/net.rs); this
 * mirrors it, asks the user before a purpose first uses the network, and
 * switches offline mode.
 *
 * The window itself reaches nothing: its content security policy keeps it
 * to the app. Anything it is kept from reaching is recorded as blocked.
 */

/** Something the app does that may use the network. */
export type NetTask = {
  id: string;
  purpose: string;
  label: string;
  /** The hosts it may reach, as its consent named them; none, any (the user's own code). */
  hosts?: string[] | null;
  started: number;
  ended?: number | null;
  outcome?: "done" | "failed" | null;
};

/** One connection, or one refused. */
export type NetConnection = {
  id: number;
  taskId?: string | null;
  purpose?: string | null;
  label?: string | null;
  host: string;
  port: number;
  started: number;
  ended?: number | null;
  sent: number;
  received: number;
  outcome: "open" | "done" | "failed" | "blocked";
  reason?: string | null;
};

/** A purpose's first use of the network, waiting on the user's yes or no. */
export type ConsentRequest = {
  purpose: string;
  /** "Download Python for the console?" */
  title: string;
  /** What will be fetched and why. */
  detail: string;
  /** Where from: "Python itself: github.com". */
  sources: string[];
  /**
   * The hosts those name, as the task asked for is kept to them
   * (src-tauri/src/net.rs): each exact, or with a leading dot for any host
   * under one (`.hf.co`). Made with `sources`, from one list, and sent
   * with what begins the task.
   */
  hosts: readonly string[];
  /** Asked even where the purpose is allowed already: what it fetches is more than the user was told of when they allowed it. */
  again?: boolean;
  /** The purposes a yes allows, where it is more than its own: several asked in one question (`askToConnectAll`). */
  grants?: readonly string[];
  /** Each one's own words, where several are asked in one question: what it fetches, and from where, under its name. */
  parts?: readonly { name: string; detail: string; sources: readonly string[] }[];
};

type NetworkState = {
  /** Whether the app's side is there to ask (not outside the app). */
  available: boolean;
  offline: boolean;
  granted: string[];
  /** Tasks by id, ended ones included. */
  tasks: Record<string, NetTask>;
  /** Recent connections, oldest first. */
  connections: NetConnection[];
  asking: (ConsentRequest & { answer: (yes: boolean) => void }) | null;
};

export const useNetwork = create<NetworkState>(() => ({
  available: false,
  offline: false,
  granted: [],
  tasks: {},
  connections: [],
  asking: null,
}));

/** Purposes by what they are, for the settings and the record. */
export function purposeName(purpose: string): string {
  if (purpose === "python-code") return "Python run in the console";
  if (purpose === "web-view") return "The window";
  if (purpose === "app-update") return "Keeping Meno up to date";
  if (purpose === "ccd") return "Chemical components from the wwPDB's dictionary";
  if (purpose === "python-env:console")
    return "Setting up Python for the console";
  if (purpose === "python-env:node") return "Setting up Python for workflows";
  const plugin = PLUGINS.find((p) => purpose === `python-env:${p.profile}`);
  if (plugin) return `Setting up ${plugin.name}`;
  if (purpose.startsWith("python-env:"))
    return `Setting up Python (${purpose.slice("python-env:".length)})`;
  return purpose;
}

const KEEP = 1000;

function upsertConnection(c: NetConnection) {
  useNetwork.setState((s) => {
    const i = s.connections.findIndex((x) => x.id === c.id);
    const next = i >= 0 ? s.connections.slice() : [...s.connections, c];
    if (i >= 0) next[i] = c;
    return { connections: next.slice(-KEEP) };
  });
}

let started = false;

/** Reads the app's record and keeps up with it. */
export async function startNetwork(): Promise<void> {
  if (started || !isTauri()) return;
  started = true;
  const state = await invoke<{
    offline: boolean;
    granted: string[];
    tasks: NetTask[];
    connections: NetConnection[];
  }>("net_state").catch(() => null);
  if (!state) return;
  useNetwork.setState({
    available: true,
    offline: state.offline,
    granted: state.granted,
    tasks: Object.fromEntries(state.tasks.map((t) => [t.id, t])),
    connections: state.connections,
  });
  await listen<NetTask>("net:task", (e) =>
    useNetwork.setState((s) => ({
      tasks: { ...s.tasks, [e.payload.id]: e.payload },
    })),
  );
  await listen<NetConnection>("net:connection", (e) =>
    upsertConnection(e.payload),
  );
  // Whatever the window is kept from reaching goes on the record.
  document.addEventListener("securitypolicyviolation", (e) => {
    const host = hostOf(e.blockedURI);
    if (host) void noteBlocked(host, "the window is kept from the network");
  });
}

function hostOf(uri: string): string | null {
  try {
    const url = new URL(uri);
    return url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "wss:"
      ? url.host
      : null;
  } catch {
    return null;
  }
}

/** Puts on the record a connection that was not made. */
export async function noteBlocked(host: string, reason: string): Promise<void> {
  if (!useNetwork.getState().available) return;
  await invoke("net_note_blocked", { host, reason }).catch(() => undefined);
}

/**
 * Brings the app's side into line with the settings: offline or not, and
 * the purposes the user has allowed.
 */
export async function applyNetworkSettings(settings: {
  offline: boolean;
  granted: readonly string[];
}): Promise<void> {
  useNetwork.setState({
    offline: settings.offline,
    granted: [...settings.granted],
  });
  if (!isTauri()) return;
  await invoke("net_set_offline", { offline: settings.offline }).catch(
    () => undefined,
  );
  for (const purpose of settings.granted) {
    await invoke("net_grant", { purpose }).catch(() => undefined);
  }
}

/** Offline mode on or off. */
export async function setOffline(offline: boolean): Promise<void> {
  useNetwork.setState({ offline });
  if (isTauri())
    await invoke("net_set_offline", { offline }).catch(() => undefined);
}

/** Withdraws a purpose's leave to use the network. */
export async function revoke(purpose: string): Promise<void> {
  useNetwork.setState((s) => ({
    granted: s.granted.filter((p) => p !== purpose),
  }));
  if (isTauri()) await invoke("net_revoke", { purpose }).catch(() => undefined);
}

async function grant(purpose: string): Promise<void> {
  // (the app first: whatever the page does on seeing the purpose allowed -
  // a look for a newer Meno - is then let through)
  if (isTauri()) await invoke("net_grant", { purpose }).catch(() => undefined);
  useNetwork.setState((s) =>
    s.granted.includes(purpose)
      ? s
      : { granted: [...s.granted, purpose].sort() },
  );
}

/** The questions waiting their turn: the last's answer, the next asked after it - and each purpose's, while it is asked or waits. */
let questions: Promise<unknown> = Promise.resolve();
const waiting = new Map<string, Promise<boolean>>();

/**
 * Whether `request.purpose` may use the network: yes when it has been
 * allowed before; otherwise the user is asked, and a yes is remembered. No
 * in offline mode, without asking. One question at a time: one asked while
 * another is up waits its turn - never taken as a no - and one for a
 * purpose already being asked shares that answer.
 */
export function askToConnect(request: ConsentRequest): Promise<boolean> {
  const s = useNetwork.getState();
  if (s.offline) return Promise.resolve(false);
  if (s.granted.includes(request.purpose) && !request.again) return Promise.resolve(true);
  // (one asked again - what it fetches having grown - does not share the answer of one that is not)
  const key = request.again ? `${request.purpose} again` : request.purpose;
  const same = waiting.get(key);
  if (same) return same;
  const asked = questions.then(() => askNow(request));
  waiting.set(key, asked);
  void asked.finally(() => waiting.delete(key));
  questions = asked.catch(() => undefined);
  return asked;
}

/** A question, its turn come: asked - unless meanwhile Meno went offline, or the purpose was allowed (and it is not to be asked again). */
function askNow(request: ConsentRequest): Promise<boolean> {
  const s = useNetwork.getState();
  if (s.offline) return Promise.resolve(false);
  if (s.granted.includes(request.purpose) && !request.again) return Promise.resolve(true);
  return new Promise((resolve) => {
    // (answered once: a second click on the question as it goes is no second answer)
    let answered = false;
    const answer = (yes: boolean) => {
      if (answered) return;
      answered = true;
      useNetwork.setState({ asking: null });
      if (yes) for (const purpose of request.grants ?? [request.purpose]) void grant(purpose);
      resolve(yes);
    };
    useNetwork.setState({ asking: { ...request, answer } });
  });
}

/**
 * Whether several purposes may use the network, asked in one question:
 * a plugin and those it uses, set up together. Yes where each was allowed
 * before and is not to be asked again; no offline; else one question - its
 * own words (`title`, `detail`), then each one's, under its name - whose yes
 * allows them all. One alone is asked as itself.
 */
export function askToConnectAll(title: string, detail: string, asks: readonly { name: string; request: ConsentRequest }[]): Promise<boolean> {
  const s = useNetwork.getState();
  if (s.offline) return Promise.resolve(false);
  const open = asks.filter((a) => a.request.again || !s.granted.includes(a.request.purpose));
  if (!open.length) return Promise.resolve(true);
  if (open.length === 1) return askToConnect(open[0].request);
  return askToConnect({
    purpose: open[open.length - 1].request.purpose,
    title,
    detail,
    sources: [],
    hosts: [...new Set(open.flatMap((a) => a.request.hosts))],
    again: true,
    grants: [...new Set(open.map((a) => a.request.purpose))],
    parts: open.map((a) => ({ name: a.name, detail: a.request.detail, sources: a.request.sources })),
  });
}

/** A number of bytes, for people. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
