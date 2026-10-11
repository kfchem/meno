/**
 * Short notices in the corner of the window, beside the network's cards
 * (./network/NetworkToasts): what Meno did of itself that the chemist may
 * want otherwise, with the way to have it so - each shown for a while,
 * once.
 */
import { create } from "zustand";

/** How long a notice stays, unless it is dismissed. */
const NOTICE_MS = 9000;

export type Notice = { id: string; title: string; text: string; action?: { label: string; run: () => void } };

type Notices = { notices: Notice[]; show: (n: Notice) => void; dismiss: (id: string) => void };

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useNotices = create<Notices>((set, get) => ({
  notices: [],
  show: (n) => {
    set((s) => ({ notices: [...s.notices.filter((x) => x.id !== n.id), n] }));
    clearTimeout(timers.get(n.id));
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
