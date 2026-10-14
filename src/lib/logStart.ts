/**
 * Meno's log set going (lib/log): imported first in main.tsx, so that what
 * goes wrong as the other modules load is caught too.
 */
import { installLog } from "./log";

installLog();
