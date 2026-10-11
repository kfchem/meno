# Rendering

Pictures and films of molecules in 3D, rendered by a plugin: the Blender
interface, the first to fill the role *Render*. Written on 2026-10-11 with
the maintainer (lane L7); what is decided is under *Decided*.

## What it is for

Meno's canvas draws molecules in 3D for working with them: quickly, in the
3D style's looks. A render is for showing them - a figure for a paper, a
film of a molecule turning or moving in a vibration for a talk - lit as a
real scene is, with true shadows, the light round the scene reaching into
every crevice, and materials such as glass and metal. It is made by a
program that does nothing else so well, apart from Meno, and comes back
onto the page beside the molecules it shows.

## How it is asked for

Right-click a molecule in 3D - or a selection holding some - and choose
**Render…**. It is offered only while a plugin that renders is added (the
Blender interface, in Settings, *Plugins*). A card over the canvas asks:

- **Picture** or **Film**.
- Meno's own choices, whoever renders:
  - a film's motion: **turning** once round, about the page's up, each
    molecule in place; **through its frames**, where one has several, each
    blended into the next (a conformer set's shown one after another,
    none being a step on the way to the next); or **in the vibration**
    shown, from its calculation's list - only those that can be;
  - a film's length in seconds - a vibration's made whole periods of 1.2 s,
    so that it loops - and its frames a second (24, 30 or 60);
  - the width in pixels, and the shape: fitted to the molecules, 16:9, 4:3
    or square;
  - what the molecules are made of: as the 3D style draws them, glossy,
    metal, glass, matte or clay (one light grey); and, where a surface is
    shown, what it is made of: as the canvas draws it, glass, glossy or
    matte.
- The plugin's options, as its manifest declares them (the Blender
  interface's below).

Each is remembered: Meno's for a picture and a film apart, the plugin's as
the role's options, which Settings, *Molecules in 3D*, shows as well.

## What Meno writes

The molecules in 3D asked for, as the canvas shows them, written as one
scene in **glTF 2.0** (`lib/scene/gltf.ts`), from Khronos's specification
alone (registry.khronos.org/glTF/specs/2.0) and the extensions named here
(github.com/KhronosGroup/glTF, `extensions/2.0/Khronos`); the code cites
the sections it follows. One JSON text, its binary data in one buffer
embedded as a `data:` URI (3.6.1.1); ångströms; +Y up, the camera looking
down -Z (3.4). Built by `render/renderScene.ts`:

- **Each molecule** a node where it stands on the page, as high as it
  stands, turned as it is (3.5.3), in the frame it shows. Its atoms are
  balls and its bonds' lines sticks - a double bond two, a triple three,
  as the canvas draws them - each a node placing, turning and scaling one
  of two shapes shared by all (`lib/scene/shapes.ts`: a sphere of radius 1,
  a cylinder of radius 1 and height 1), one mesh for each material
  (3.7.4). Atoms the look leaves out - hydrogens on carbon, where it hides
  them - are left out, and their bonds; a render does not carry the mark
  the canvas puts by such a molecule (the maintainer, 2026-10-10).
- **Materials** in the metallic-roughness model (3.9.2), colours linear:
  the look's finish, or as asked - glossy, a clear coat
  (`KHR_materials_clearcoat`); metal; glass, clear and tinted through its
  depth by the atom's colour (`KHR_materials_transmission`,
  `KHR_materials_ior`, `KHR_materials_volume`); matte; clay. A surface as
  the canvas draws it is seen through (alpha blended, 3.9.4) and from both
  sides (3.9.5); as glass, a thin wall.
- **Surfaces** - an orbital, a density - shown from a calculation's list,
  made at the value they are drawn at, each sign a mesh in its colour.
- **The camera** straight above, orthographic, as the canvas's is
  (3.10.3.4): its frame what is drawn with a little room round it, in the
  shape asked for - and, for a film, all it reaches in any of its frames.
  The frame is a piece of the page: what is made is put on the page as
  large as the molecules are drawn there.
- **The key light** as the canvas has it: directional
  (`KHR_lights_punctual`), from the same side, as strong. The light all
  round the canvas has, for which glTF has no word, is said in the scene's
  `extras` (`meno.ambientLight`), with the picture's size and frames.
- **A film's motion** as one animation (3.11): a key for each of its
  frames, every one worked out by Meno - the turn of each molecule, or the
  place of each atom and stick - so that the film is what Meno meant, not
  what a renderer would make between keys.

Khronos's glTF-Validator finds nothing wrong in what Meno writes (checked
while it was built; not part of Meno or its tests).

## The role, and its contract

*Render* is a role Meno defines (`lib/plugins/roles.ts`): given a scene,
it gives a picture or a film. A plugin fills it as it fills any role, and
runs a program for it as a job (docs/WORKFLOWS.md, *Jobs*), named in its
manifest with the role (`roles: [{role: "render", programs: [...],
options: [...]}]`; docs/PLUGINS.md, *The manifest*).

- `prepare {step: "render", entries: [{scene, film, width, height,
  frames, fps}], options, cores}` - its jobs, as a step's are. Meno puts
  the scene it wrote into the job's folder, under the entry's `scene`
  (`scene.gltf`), beside the files the plugin wrote; a plugin's own file of
  that name is refused.
- The job runs apart from Meno, as a workflow's do: waiting its turn among
  them, as many at once as Settings, *Calculations*, allows. Meno reads its
  log as it runs, and shows its last line - and how far it is, where it
  says so in a line of its own: `progress <done>/<all>`.
- `collect {step: "render", entries, options, files: {}, log, ended}` -
  answered `{made: [{entry, file, media}]}`, the file it made in the job's
  folder, `image/png` or `video/mp4`; or `{why}`. Meno reads the file
  itself, puts it on the page, and takes the job's folder away.

## On the page

While it renders, a dashed frame stands where what it makes will lie -
beside the molecules, on the right, as large as they are drawn - saying
how far it is and what its job said last, with a button that stops it.
Where it fails, the frame says why; the button puts it away. The view
eases to the frame and the molecules once, as the render is begun, where
they are not all in view; what it makes lands as the view then is, never
moving it again (the maintainer, 2026-10-11).

What it makes is a **picture** on the page (docs/PDF.md, *A picture*): a
PNG, or a **film** - an MP4 - which plays where it lies, over and over,
without sound. A film is a picture whose media is `video/mp4`: it is
moved, made larger, turned, selected, copied, deleted and saved with the
workspace as any picture is. Its menu offers **Pause** or **Play** and
**Save film…**; a picture's, **Save picture…**. A film is not copied as a
picture for other programs.

## The Blender interface

`src-tauri/resources/plugins/blender/`: a worker in Python alone (made by
uv, no package), and the script Blender runs, `render.py`.

- **Blender is installed separately**, under its own licence, and never
  fetched or shipped by Meno (`installed`). Meno looks for it where it was
  located, where the system finds programs, and where it is usually
  installed: on macOS `/Applications/Blender.app` and
  `~/Applications/Blender.app`; on Windows
  `Program Files\Blender Foundation\Blender *`, the newest first
  (`installed[].places`). On macOS an app picked in *Locate…* stands for
  the program inside it.
- **Blender 5.0 or later.** Meno asks each copy it finds its version
  (`blender --version`, `installed[].version`) - as it looks, as one is
  located and before each render - and takes the one located where it is
  new enough, else the newest copy that is. Settings, *Plugins*, shows
  the version beside where it is; of an older copy it says why it will not
  do: "Meno needs Blender 5.0 or later; this one is 4.1", and *Locate…*
  refuses one. It looks again whenever Meno is come back to while
  *Plugins* is shown, so a Blender installed or updated meanwhile is taken
  without starting Meno again; a copy is asked once, and again only once
  its file has changed.
- **Fetched by Meno, where none is found** (2026-10-11): where no Blender
  fit to run is found, Settings, *Plugins*, offers *Fetch for Meno* -
  Blender's official build for this computer, 5.2.2 LTS, from
  download.blender.org (macOS on Apple silicon, 346 MB; Windows x64,
  404 MB; Windows arm64, 274 MB), asked for first under a leave of its
  own, checked against the SHA-256 Blender publishes for it, and unpacked
  into the Blender interface's data folder for Meno's own use - nothing
  installed on the system; on macOS the app copied out of the disk image
  as it is, its signature whole - and taken away with the plugin.
  PLUGINS.md, *A program Meno fetches*, says when Meno does this at all.
- **Its job** runs Blender as its manual says (docs.blender.org, Blender
  5.2, "Command Line Arguments"): `blender -b --factory-startup -noaudio
  --offline-mode -t <cores> --python-exit-code 1 -P render.py --
  render.json` - in the background, with none of the chemist's own
  Blender settings, never reaching the network.
- **`render.py`** empties Blender's scene, takes in Meno's with Blender's
  glTF importer, sets the camera as Meno framed it, lights the world as
  evenly as Meno's light all round and the key light as asked, renders
  each frame with its transparency, and then puts what it rendered over
  the background asked for - after the colours are transformed, so that
  white is white - writing a PNG, or an MP4 (H.264) through Blender's own
  video writer.
- **Its options**: the renderer (Cycles, light traced, or EEVEE, fast),
  samples for each pixel, noise removal, the graphics processor where
  Blender can use one (Metal, OptiX, CUDA, HIP or oneAPI), the background
  (transparent - a film's then white - white, black or grey), the colours
  (true to the style, by Khronos PBR Neutral; film-like, AgX; or
  standard), the key light and the light all round against the canvas's,
  the shadows' softness, and a film's quality.
- The first render on a computer can take a few minutes while Blender
  prepares its renderer for the graphics processor; after that, seconds.
- **What the canvas alone draws** is left out of the scene, as a renderer
  finds its own: the hollows' shade and how deep (`MoleculeLook.occlusionBy`,
  `MoleculeLook.occlusion`), the shadows' darkness (`Scene3D.shadows`) and
  the lighter drawing of very many atoms (`Scene3D.largeDrawings`) - none
  is written in the glTF. Blender finds its own shadows and hollows as it
  lights the scene; the shadows' softness is the plugin's own option.

## Licences

Meno is Apache-2.0. A script using Blender's Python API is under the GPL,
so the Blender interface is GPL-3.0-or-later: its folder carries the
licence's text (`LICENSE`) and its files say so; it stands strictly apart
- nothing of Meno's or of another plugin's takes anything from it, and it
speaks to Meno only through files and arguments (docs/PLUGINS.md,
*Licences*). README lists it with its licence.

## Decided

By the maintainer, 2026-10-10 and 2026-10-11:

1. **Blender as a plugin, bundled for now** with a strict boundary, its
   licence GPL-3.0-or-later; distributed apart later if those using Meno in
   companies make that worthwhile.
2. **A render may leave out the "C-H hidden" mark.**
3. **More options rather than fewer**: samples, the renderer, the lights,
   the frames a second and the rest set directly.
4. **Films play on the page**, as pictures do; pictures go beside the
   molecules.
5. **Materials** - glossy, metal, glass, matte, clay - for molecules and for
   surfaces apart, written as Khronos's glTF extensions.
6. **The command first**; Render as a workflow's step in a later change.
7. **Blender 5.0 or later**, a round line; the newest copy new enough
   taken, its version shown in Settings.
8. **The view moves once**, as a render is begun; not again as what it
   makes lands.
9. **Blender fetched by Meno** where none fit to run is found, on asking -
   under the rule PLUGINS.md, *A program Meno fetches*, sets out.

## Not yet

- **Render as a step** in a workflow: each entry rendered, pictures in a
  result set (sets hold molecules alone today).
- What the canvas draws besides molecules: measurements' lines, labels,
  R and S, PDB ribbons (lane L5) - none is in the scene yet.
- Films with a transparent background (a video kind that keeps it, which
  every system's web view plays, is wanted first).
- A render goes on if its workspace is closed, and what it makes is then
  lost; it is not picked up again as a workflow's job is.
