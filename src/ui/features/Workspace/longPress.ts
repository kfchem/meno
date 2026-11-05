import { useAppSettings } from "../../../lib/settings/appSettings";
import { LONG_PRESSES } from "./constants";

/** How long a press held still takes to be a long press now, in ms: as Settings says (*General*, *A long press*), read as each press is held. */
export const longPressMs = (): number => LONG_PRESSES[useAppSettings.getState().pointer.longPress ?? "normal"];

/**
 * How long a press on an atom held still takes to be a long press, in ms -
 * none with Option or Alt held: that press is the one-click bond's, and a
 * press made slowly with it never selects the structure instead (the
 * maintainer's ruling).
 */
export const atomLongPressMs = (press: { altKey?: boolean } | null | undefined): number | null => (press?.altKey ? null : longPressMs());
