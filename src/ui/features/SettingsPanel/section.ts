import { create } from "zustand";

export type SettingsSection = "general" | "style" | "style3d" | "chemistry" | "files" | "calculations" | "conversations" | "plugins" | "abbreviations" | "network";

/** Which part of Settings is shown: set from elsewhere to open it at one. */
export const useSettingsSection = create<{ section: SettingsSection }>(() => ({
  section: "general",
}));

export function showSettingsSection(section: SettingsSection): void {
  useSettingsSection.setState({ section });
}

/** Each time Settings was asked for from somewhere else - a step's card, say - counted: Meno opens its tab (App). */
export const useSettingsAsked = create<{ asked: number }>(() => ({ asked: 0 }));

/** Opens Settings at `section`, from anywhere. */
export function openSettingsAt(section: SettingsSection): void {
  showSettingsSection(section);
  useSettingsAsked.setState((s) => ({ asked: s.asked + 1 }));
}
