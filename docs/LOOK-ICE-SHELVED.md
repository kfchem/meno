# The ice look: shelved (2026-10-29)

The Blender plugin's still-picture look "ice" is withdrawn. The maintainer's reason: something half-finished should not be
offered at all. It is to be revisited when there is time. No list of its faults was recorded with the ruling, so the points
below are what the code itself shows. A restart should begin by asking the maintainer what fell short.

## Where it is

On this branch it is still whole:

- `src-tauri/resources/plugins/blender/looks.py`: `ice()`, and its entries in `IDS`, `STUDIO` and `BUILD`. In `apply`, the
  look adds a subdivision modifier (render levels 3), sets the displacement to "both", and uses 6 volume bounces.
- `manifest.json`: the look's declaration ("Ice: melting, clear"), with sticks stopped at the surface, its own materials, and
  see-through.
- `worker.py`: `OWN_LOOKS`.
- `scripts/calc/test_plugin_blender.py`: the own-looks list.

Main dropped it in the withdrawal PR ("Blender plugin: Liquid film and Ice look withdrawn for now"). No other look used its
materials or nodes.

## What it did

Each ball and stick was refracting glass (IOR 1.31) with a faint cyan that deepens with thickness (volume absorption), and
bubbles and white streaks inside, densest at the centre. On the surface:

- gentle lumps, made by true displacement from a low-frequency noise, so that the outline is no circle;
- wet, sharp highlights;
- a few droplets, made as Voronoi bumps.

## What to question first

- **The idea of "melting" in a still.** Lumps and droplets on otherwise intact spheres read as a lumpy glass, not ice. Decide
  what ice is meant to show: frost, clear cut ice, or a melt caught at a moment.
- **Displacement on every ball.** It needs a subdivided mesh at render time (levels 3 on every object). That is slow on large
  molecules, and it changes each atom's silhouette, which is part of what a molecule figure must keep readable.
- **Refraction and volume.** A clear refracting volume shows the studio and the other atoms through each ball, bent. At small
  sizes this muddles the structure. Volume absorption and scatter add noise (6 volume bounces) and render time.
- **Sticks.** They were stopped at the surface, as for the other see-through looks; how bonds read through ice was not judged
  on its own.
- **Judge it as the other looks were:** on the white and dark studios, on a small and a large molecule, at the size a slide
  shows, beside glass and crystal, so that it earns its own place in the list.
