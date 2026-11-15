import { kindInfo } from "../workflow/kinds";

/** What a turn's changes leave to say besides that it changed the page, as the card and the column say it alike. */
export type RunsAgainOf = { id: number | string; kind: string };

/** "This makes Filter, Optimise run again, when you next run it": which steps its changes made run again, by what each does - none where none. */
export function runsAgainSaid(runsAgain: readonly string[] | undefined, steps: readonly RunsAgainOf[]): string | null {
  const names = (runsAgain ?? []).flatMap((id) => {
    const s = steps.find((x) => String(x.id) === id);
    return s ? [kindInfo(s.kind as Parameters<typeof kindInfo>[0]).name] : [];
  });
  return names.length ? `This makes ${names.join(", ")} run again, when you next run it.` : null;
}

/** Why Discard left the changes as they were, in words: a step they added is running, or the page changed since - none where it dropped them (or there were none). */
export function discardedSaid(result: "dropped" | "running" | "since" | "none"): string | null {
  return result === "running" ? "A step it added is running: stop it first." : result === "since" ? "The page has changed since: undo is yours, step by step." : null;
}
