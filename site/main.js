// Meno's website: the visitor's own system first, and the story - scrolling
// through it runs a film of Meno at work, recorded from the app: each
// chapter a short video whose position the scroll sets. A phone gets the
// smaller cut; with Save-Data on, no film is fetched and the stills stay.

(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Offer the visitor's own system first.
  const cta = document.getElementById("cta");
  if (cta && /Windows/i.test(navigator.userAgent)) {
    const win = cta.querySelector('[data-asset="windows"]');
    const mac = cta.querySelector('[data-asset="mac"]');
    win.classList.add("primary");
    mac.classList.remove("primary");
    cta.prepend(win);
  }

  const story = document.getElementById("story");
  const screen = document.getElementById("screen");
  const rail = document.getElementById("rail");
  const heroWindow = document.getElementById("hero-window");
  const chapters = [...document.querySelectorAll(".chapter")];
  story.style.setProperty("--chapters", String(chapters.length));

  // frames/<name>.mp4, or frames/<name>-s.mp4 where the window is small (a phone);
  // frames/<name>.avif is its first frame, shown until the film has come.
  const small = screen.getBoundingClientRect().width < 720;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const films = chapters.map((ch) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.disablePictureInPicture = true;
    v.preload = "none";
    v.poster = `${ch.dataset.film}.avif`;
    v.setAttribute("aria-hidden", "true");
    v.addEventListener("loadedmetadata", request);
    v.addEventListener("seeked", () => {
      // the latest position asked for while it was seeking
      if (v.want !== undefined) seek(v, v.want);
    });
    screen.appendChild(v);
    return v;
  });
  /** Starts fetching a chapter's film, once. */
  function load(c) {
    if (saveData || c < 0 || c >= films.length || films[c].src) return;
    const v = films[c];
    v.preload = "auto";
    v.src = `${chapters[c].dataset.film}${small ? "-s" : ""}.mp4`;
    v.load();
  }
  /** Puts a film at `p` (0 to 1) of its length - or, while it is still seeking, remembers to. */
  function seek(v, p) {
    if (!v.duration || v.seeking) {
      v.want = p;
      return;
    }
    v.want = undefined;
    const t = Math.min(v.duration - 0.001, p * v.duration);
    if (Math.abs(v.currentTime - t) > 0.004) v.currentTime = t;
  }

  const pips = chapters.map((ch, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = ch.querySelector(".n").textContent.split("·")[1].trim();
    b.addEventListener("click", () => {
      const span = story.offsetHeight - innerHeight;
      scrollTo({ top: story.offsetTop + (span * (i + 0.02)) / chapters.length, behavior: reduce ? "auto" : "smooth" });
    });
    rail.appendChild(b);
    return b;
  });

  function update() {
    ticking = false;
    const y = scrollY, vh = innerHeight;
    root.style.setProperty("--scroll", y.toFixed(1));

    // The hero window lies back, and straightens as it comes up.
    const r = heroWindow.getBoundingClientRect();
    const flat = reduce ? 1 : Math.min(1, Math.max(0, 1 - (r.top - vh * 0.18) / (vh * 0.6)));
    heroWindow.style.setProperty("--flat", flat.toFixed(3));

    // Scrolling through the story runs the film.
    const span = story.offsetHeight - vh;
    const p = span > 0 ? Math.min(0.9999, Math.max(0, (y - story.offsetTop) / span)) : 0;
    const at = p * chapters.length;
    const c = Math.floor(at);
    const local = at - c;
    if (story.getBoundingClientRect().top < vh * 2) {
      load(c);
      load(c + 1);
    }
    chapters.forEach((ch, i) => ch.classList.toggle("on", i === c));
    films.forEach((v, i) => v.classList.toggle("on", i === c));
    pips.forEach((b, i) => {
      b.classList.toggle("on", i === c);
      b.setAttribute("aria-current", i === c ? "step" : "false");
      b.style.setProperty("--p", i < c ? "1" : i > c ? "0" : local.toFixed(3));
    });
    seek(films[c], local);
  }

  let ticking = false;
  function request() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }
  addEventListener("scroll", request, { passive: true });
  addEventListener("resize", request);
  update();
})();
