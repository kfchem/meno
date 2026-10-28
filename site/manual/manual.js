// Meno's manual: a language chosen on the switch, or at the front door, is
// kept for the next visit (the front door reads it: scripts/site/manual.mjs),
// and the switch keeps the reader's place - both languages give their
// sections the same ids. A how-to step's picture opens out to the whole
// window when clicked, and back.

(() => {
  for (const a of document.querySelectorAll("a[data-lang]")) {
    a.addEventListener("click", () => {
      try {
        localStorage.setItem("meno-manual-language", a.dataset.lang);
      } catch {
        // (nothing kept: the browser's language decides next time)
      }
      if (location.hash) a.hash = location.hash;
    });
  }

  // a step's picture: near its spot, or - a click away - the whole window
  for (const shot of document.querySelectorAll(".shot.near")) {
    shot.addEventListener("click", () => {
      shot.classList.toggle("whole");
      shot.classList.toggle("near");
    });
  }
})();
