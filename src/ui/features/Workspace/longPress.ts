import { useAppSettings } from "../../../lib/settings/appSettings";
import { LONG_PRESSES } from "./constants";

/** How long a press held still takes to be a long press now, in ms: as Settings says (*General*, *A long press*), read as each press is held. */
export const longPressMs = (): number => LONG_PRESSES[useAppSettings.getState().pointer.longPress ?? "normal"];
