// Meno's manual: a language chosen on the switch, or at the front door, is
// kept for the next visit (the front door reads it: scripts/site/manual.mjs),
// and the switch keeps the reader's place - both languages give their
// sections the same ids.

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
})();
