# The liquid change: shelved (2026-10-29)

The Blender plugin's change of molecules "liquid" (`change-liquid`) is withdrawn. The maintainer judged it too awkward after
watching the films, and it is to be rethought from zero. This branch (`agent/films-liquid-shelved`) keeps all of it, so the work
can be picked up again: the motion's script, the changes from #688 and #714, and today's last fix, untested beyond a Mac trial.

## What it was

Each molecule melted, from the top down, into a pool of molten gold on the white studio. The melt was a Mantaflow liquid
simulation, as viscous as honey, its grid as fine as the film's width (192 cells at 1920 px). Then, between molecules:

- one pool drew itself up into a round drop and spread out again as the next molecule's pool;
- the next molecule rose out of that pool (its melt played backwards).

A film was made in stages:

- each molecule's melt once, its pool's last surface kept (`pool.npz`);
- each reform between two pools, by shape keys that move each pool onto a drop of their mean volume, with a dissolve at the swap;
- the film plays each melt forward, then backwards.

All the melts share one domain, sized for the widest molecule, so every melt ends with the camera in the same place.

Files: `motion_change_liquid.py` (the melt and the reform), `render.py` (`liquid_film`, `liquid_share`), the manifest's motion, and
the tests in `scripts/calc/test_plugin_blender.py` (`LiquidShare`, the cap, the domain flash).

## What was found

1. **Single image strip (#688, fixed).** A sequencer image strip reads every file from its first file's folder, so a film of
   several pieces played the first piece's frames throughout. The film is now made of one strip per run of frames from one
   folder (`strip_runs`). Lesson: judge the decoded film, not each piece's frames.
2. **The reform snapped (#714).** The film's length was shared in proportion: 8 s a melt, 1.6 s a reform, 8 s a melt. So a
   6 s film of three molecules gave each reform 8 frames, and the pool snapped into its drop. #714 gives the reform at least a
   second where the change has the frames (`liquid_share`), and keeps the dissolve within the drop's hold.
3. **Domain flash (#714, fixed).** A small molecule's top band can hold no atom. The liquid was made visible on the melt's
   first liquid frame, before anything was poured; the solver then drew its whole domain, and the camera, inside it, saw only
   gold for several frames. The liquid is now shown from the first band that pours.
4. **A large molecule's pool piled against the walls.** The maintainer's ruling (b): cap each molecule's poured liquid at
   what lies freely on the paper, and keep the domain and the framing. #714 reckons the poured liquid on the solver's grid; a
   large molecule swells less, and pours for fewer frames.
5. **The over-pour, and the curtains (found at 800 px on the Windows render PC).** This is the root cause of item 4, and of
   the ugly melts.
   - A melt played faster than its own 8 s was simulated with longer steps: the solver's time per frame was 0.8 x the speed-up.
   - Each band's inflow stays on for a few frames, refilling on every substep as the liquid drains. So a short film poured
     several times what was reckoned, and the refill drew the liquid out in vertical sheets: chunky walls for a medium
     molecule, a comb of thin curtains for a large one.
   - The run: 6 s, 30 fps, 800x450, three molecules of increasing size (the largest about paclitaxel's).
     - POUR said 2.80 / 2.80 / 2.68 L poured, but the reform measured the pools at 6.5 / 11.8 / 21.0 L.
     - The largest pool reached 0.97 of the domain's half-width and 0.98 of its half-depth, with straight, wall-shaped sides.
     - The two smaller pools reached 0.55 / 0.64 and 0.72 / 0.86.
   - Main has the curtains too. They show most in short films.
   - The last commit here simulates each melt in its own time (8 s at the film's fps, or longer where the film plays it
     slower) and renders only the frames the film plays, evenly sampled. The physics, the volume and the look then no
     longer depend on the film's length; a short film's melts bake about 3x more frames.
   - This fix was not yet recalibrated or run at production resolution. The cap's numbers (free depth 2.2 cm, refill 0.42 a
     frame) were measured at the old, speed-dependent step and are stale.
6. **What was met at 800 px.** Each reform was 30 frames, with no frame-to-frame step more than 2.5 times both its neighbours,
   and there was no domain flash.

The films and numbers of that run are on the render exchange share, at `jobs/liquid-cap-714/`: the film, its log lines, the
frame-difference curve, contact sheets of the pools and the melts, and every frame.

## What a restart should question first

- **Whether a fluid simulation is the right tool at all.** It is slow (minutes per molecule at 1920 px, the slowest preset by
  far). It depends on the grid: a pool a few centimetres deep is one or two cells thick at 800 px, so its volume and spread
  change with the film's width. And it is hard to direct. A melt and a reform drawn by shape keys or geometry nodes would be
  directable, fast and resolution-independent.
- **The motion's rhythm.** Most of the time went to the melt; the change itself (drop and spread) was squeezed into a second.
  The awkwardness may be the story's shape as much as the physics: the solid disappears into a lumpy sheet, then a sudden
  drop. Decide the beats, and their shares of a change, first.
- **One shared domain for every molecule.** It keeps the framing fixed, but makes a small molecule's pool a speck in a wide
  view and a large one's pool penned in. A framing that follows the pool may serve better.
- **Volume as an input, not an outcome.** Whatever the method, each molecule's liquid should be a stated quantity (and
  conserved through the reform), not what the solver happens to make.
- **The minimum length.** #718 gave the liquid 6 s a change. A new motion needs its own, set from trial films.

## Tools (local, on the Mac)

`~/work/meno-cache/films/plugintest/run.py` (a film as Meno runs it, with `RES`, `NOCAP` and `CAL` for the liquid), and in
`~/work/meno-cache/films/judge/`: `diffcurve.py` (a decoded film's frame-to-frame change), `poolstat.py` (a kept pool's
volume and reach) and `sheet.py` (contact sheets).
