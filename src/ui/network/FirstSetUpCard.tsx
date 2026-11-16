import { AnimatePresence, motion } from "motion/react";
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { usePresentingWindow } from "../presenting";
import { RISE } from "../theme/motion";
import { Leaving } from "../theme/leaving";
import { pluginsFilling } from "../../lib/calc/catalog";
import { useReaders } from "../../lib/calc/workers";
import { CARD_DETAIL, CARD_SOURCES, CARD_TITLE, DEPS, filledOtherwise, FIRST_ROLE, firstSetUpSaid, notNow, setUpChemistry, stopFirstSetUp, useFirstSetUp, type FirstSetUpCard as FirstSetUpCardState } from "../../lib/plugins/firstSetUp";
import { useDownloads } from "../../lib/pyEnv";
import RoleOffer from "../features/Workspace/RoleOffer";
import { Sources } from "./ConsentDialog";

const BUTTON = "shrink-0 h-7 px-2.5 rounded-md border border-gh-line transition-[color,background-color,opacity] duration-150 ease-meno hover:bg-gh-base";
const MAIN = "shrink-0 h-7 px-2.5 rounded-md bg-accel-base text-white transition-opacity duration-150 ease-meno hover:opacity-90";

/** A button of the card's: pressed, it takes no focus - Enter and Escape stay the page's, and a key typed goes where the chemist is typing. */
function CardButton({ main, onClick, children }: { main?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button tabIndex={-1} onMouseDown={(e: MouseEvent) => e.preventDefault()} onClick={onClick} className={main ? MAIN : BUTTON}>
      {children}
    </button>
  );
}

/**
 * The card that sets chemistry up as Meno first starts (lib/plugins/firstSetUp):
 * at the edge of the window, over nothing in the middle, holding up nothing,
 * taking no focus and no key; there until it is answered. Its question first,
 * then each step as it goes with *Stop*; a question beyond what it named, in
 * its place; the plugins to choose from, where the list offers no one; or why
 * it failed, with *Try again*.
 */
export default function FirstSetUpCard() {
  const card = useFirstSetUp();
  // (not over a talk given in the window: ../presenting)
  const talking = usePresentingWindow((s) => s.on);
  // (a plugin that fills the role added meanwhile - the chemist's own click: nothing more to ask)
  useEffect(
    () =>
      useReaders.subscribe((s) => {
        if (pluginsFilling(FIRST_ROLE).some((p) => s.state[p.id] === "added")) filledOtherwise();
      }),
    [],
  );
  // (the plugin's files, as they download: a share where the backend reports one)
  const share = useDownloads((s) => (card.phase === "going" && card.plugin ? s[card.plugin.id] : undefined));
  const shown = card.phase !== "none" && !talking;
  return (
    <AnimatePresence>
      {shown && (
        <Leaving key="first-set-up">
          {(held) => (
            <motion.div
              {...RISE}
              {...held}
              role="status"
              className="fixed bottom-3 left-3 z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2.5 text-xs text-gh-black"
            >
              <CardBody card={card} share={share} />
            </motion.div>
          )}
        </Leaving>
      )}
    </AnimatePresence>
  );
}

/** What the card says and offers as it stands (`useFirstSetUp`): drawn on its own for the card's tests. */
export function CardBody({ card, share }: { card: FirstSetUpCardState; share?: number }) {
  return (
    <>
    {card.phase === "offered" && (
      <>
        <p className="font-semibold">{CARD_TITLE}</p>
        <p className="mt-1 text-gh-gray">{CARD_DETAIL}</p>
        <div className="text-[11px]">
          <Sources sources={CARD_SOURCES} />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <CardButton onClick={notNow}>Not now</CardButton>
          <CardButton main onClick={() => void setUpChemistry(DEPS)}>
            Set up
          </CardButton>
        </div>
      </>
    )}
    {card.phase === "going" && (
      <>
        <p className="font-semibold">{card.stopping ? "Stopping once this step ends." : firstSetUpSaid(card.step, card.plugin?.name, share)}</p>
        {card.plugin && (
          <p className="mt-1 text-gh-gray">
            {card.plugin.name} · {card.plugin.licence} · {card.plugin.size}
          </p>
        )}
        {!card.stopping && (
          <div className="mt-2 flex justify-end">
            <CardButton onClick={stopFirstSetUp}>Stop</CardButton>
          </div>
        )}
      </>
    )}
    {card.phase === "asking" && (
      <>
        <p className="font-semibold">{card.question.title}</p>
        <p className="mt-1 text-gh-gray">{card.question.detail}</p>
        <div className="text-[11px]">
          <Sources sources={card.question.sources} />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <CardButton onClick={() => card.answer(false)}>Not now</CardButton>
          <CardButton main onClick={() => card.answer(true)}>
            Set up
          </CardButton>
        </div>
      </>
    )}
    {card.phase === "choose" && (
      <>
        <p className="font-semibold">{CARD_TITLE}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <RoleOffer role={FIRST_ROLE} done={filledOtherwise} />
        </div>
        <div className="mt-2 flex justify-end">
          <CardButton onClick={notNow}>Not now</CardButton>
        </div>
      </>
    )}
    {card.phase === "failed" && (
      <>
        <p className="font-semibold">Chemistry was not set up</p>
        <p className="mt-1 text-gh-gray">{card.why}</p>
        <div className="mt-2 flex justify-end gap-2">
          {/* (a failure seen and put away: not now - set up later from the line under the SMILES field, or Settings) */}
          <CardButton onClick={notNow}>Dismiss</CardButton>
          <CardButton main onClick={() => void setUpChemistry(DEPS)}>
            Try again
          </CardButton>
        </div>
      </>
    )}
    </>
  );
}
