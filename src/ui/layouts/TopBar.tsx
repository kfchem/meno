import { PlusIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { motion } from "motion/react";
import type { MouseEvent } from "react";
import { TabKind } from "../../lib/core";
import { IS_MAC, shortcutLabel } from "../../lib/doc/shortcuts";
import OfflineToggle from "../network/OfflineToggle";
import { DURATION, EASE } from "../theme/motion";
import SaveIcon from "./SaveIcon";
import { TabStrip, type TabMeta } from "./Tabs";
import WindowButtons, { SystemButtonsRoom } from "./WindowButtons";

export type TabsController = {
  tabOrder: string[];
  tabsById: Record<string, TabMeta>;
  activeId: string | null;
  reorder: (order: string[]) => void;
  select: (id: string) => void;
  close: (id: string) => void;
  add: () => void;
  openByKind?: (kind: TabKind, opts?: { label?: string }) => void;
  /** Files picked in the system's dialog, each opened in a tab (Open…). */
  openFiles: () => void;
  /** The tab in front saved (Save), where it can be: a workspace. */
  save?: () => void;
};

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * The window's title bar, drawn by Meno: the tabs on the line that runs
 * under them, "+" for a new workspace right after the last of them (going
 * along as they come and go), and at the right, evenly spaced, online or
 * offline, Save - the tab in front, where it is a workspace - Settings, and
 * the window's buttons -
 * on a Mac the system's own, at the left, on a window with the system's
 * rounded corners and shadow (tauri.macos.conf.json); elsewhere Meno's, at
 * the right. Dragged by any of it that is not a button, it moves the
 * window. (Meno's menu, from its logo, went in 2026-10-10: the workspace's
 * commands are on the right-click menu on empty space, and keys.)
 */
export default function TopBar({ ctl, mac = IS_MAC }: { ctl: TabsController; mac?: boolean }) {
  const { tabOrder, tabsById, activeId, reorder, select, close, add, openByKind, save } = ctl;
  return (
    <div
      data-tauri-drag-region
      className="w-full flex items-stretch justify-between h-10 min-h-10 bg-gh-base select-none relative"
    >
      {mac && <SystemButtonsRoom />}
      <div className="h-px bg-transparent border-t border-gh-line absolute bottom-0 right-0 left-0" />

      {/* The tabs, "+" right after the last, and the rest of the bar to drag the window by. */}
      <div data-tauri-drag-region className="flex-1 min-w-0 h-full flex items-stretch">
        <TabStrip
          tabOrder={tabOrder}
          tabsById={tabsById}
          activeId={activeId}
          reorder={reorder}
          select={select}
          close={close}
        />
        <div data-tauri-drag-region className="shrink-0 h-full flex items-center pr-1">
          <motion.button
            layout="position"
            transition={{ layout: { duration: DURATION.base, ease: EASE } }}
            aria-label="New workspace"
            title="New workspace"
            onClick={add}
            onMouseDown={stop}
            className="h-7 w-7 rounded-md flex items-center justify-center text-gh-gray transition-colors duration-150 ease-meno hover:bg-gray-200 hover:text-gh-black"
          >
            {/* (a little smaller than it was: as heavy as a tab's ×, neither drawing the eye from the other - the maintainer, 2026-10-19) */}
            <PlusIcon className="h-3.5 w-3.5" />
          </motion.button>
        </div>
        <div data-tauri-drag-region className="flex-1" />
      </div>

      <div className={clsx("h-full flex items-center gap-1", mac && "pr-2")}>
        <OfflineToggle />
        <button
          aria-label="Save"
          data-guide="save"
          title={`Save (${shortcutLabel("S")})`}
          disabled={!save}
          onMouseDown={stop}
          onClick={save}
          className="h-7 w-7 rounded-md flex items-center justify-center text-gh-gray transition-[color,background-color,opacity] duration-150 ease-meno hover:bg-gray-200 hover:text-gh-black disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gh-gray"
        >
          <SaveIcon className="h-4.5 w-4.5" />
        </button>
        <button
          aria-label="Settings"
          data-guide="settings"
          title="Settings"
          onMouseDown={stop}
          onClick={() => openByKind?.("settings", { label: "Settings" })}
          className="h-7 w-7 rounded-md flex items-center justify-center text-gh-gray transition-colors duration-150 ease-meno hover:bg-gray-200 hover:text-gh-black"
        >
          <Cog6ToothIcon className="h-4.5 w-4.5" />
        </button>

        {!mac && <WindowButtons />}
      </div>
    </div>
  );
}
