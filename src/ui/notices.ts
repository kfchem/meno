/**
 * Short notices in the corner of the window, beside the network's cards
 * (./network/NetworkToasts): what Meno did of itself that the chemist may
 * want otherwise, with the way to have it so - each shown for a while,
 * once; or, one that `stays`, until it is dismissed: what went wrong that
 * the chemist asked for, as a plugin not added.
 */
import { create } from "zustand";
import { usePresentingWindow } from "./presenting";

/** How long a notice stays, unless it is dismissed. */
const NOTICE_MS = 9000;

export type Notice = { id: string; title: string; text: string; action?: { label: string; run: () => void }; stays?: boolean };

type Notices = { notices: Notice[]; show: (n: Notice) => void; dismiss: (id: string) => void };

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Notices given while a talk is given: shown, each for its while, once it ends (./presenting). */
const held: Notice[] = [];

export const useNotices = create<Notices>((set, get) => ({
  notices: [],
  show: (n) => {
    if (usePresentingWindow.getState().on) {
      held.splice(0, held.length, ...held.filter((x) => x.id !== n.id), n);
      return;
    }
    set((s) => ({ notices: [...s.notices.filter((x) => x.id !== n.id), n] }));
    clearTimeout(timers.get(n.id));
    timers.delete(n.id);
    if (!n.stays)
      timers.set(
        n.id,
        setTimeout(() => get().dismiss(n.id), NOTICE_MS),
      );
  },
  dismiss: (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set((s) => ({ notices: s.notices.filter((x) => x.id !== id) }));
  },
}));

usePresentingWindow.subscribe((s, was) => {
  if (s.on || !was.on) return;
  for (const n of held.splice(0)) useNotices.getState().show(n);
});
