# Rendering

Pictures and films of molecules in 3D, rendered by a plugin: Blender, the
first to fill the role *Render*. Written on 2026-10-11 with the
maintainer (lane L7); what is decided is under *Decided*.

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
Blender plugin, in Settings, *Plugins*). A card over the canvas asks:

- **Picture** or **Film**.
- Meno's own choices, whoever renders:
  - a film's motion: Meno's own - **turning** once round, about the
    page's up, each molecule in place; **through its frames**, where one
    has several, each blended into the next (a conformer set's shown one
    after another, none being a step on the way to the next); or **in the
    vibration** shown, from its calculation's list - only those that can
    be - and then the motions the renderer declares (*Motions a renderer
    makes*, below), in its order;
  - a film's length in seconds - a vibration's made whole periods of 1.2 s,
    so that it loops - and its frames a second (24, 30 or 60);
  - the width in pixels, and the shape: fitted to the molecules, 16:9, 4:3
    or square - a film's width and height each made the nearest even
    number, as its video needs (H.264 keeps colour for each 2x2 pixels:
    360 px at 16:9 is 360 by 202), and its frame on the page given that
    shape exactly, grown, never cut;
  - the **look**: one choice, a bundle of what the molecules are made of,
    what the surfaces are made of, how it is shaded and how it is
    outlined. The card offers the canvas's own look, *as the canvas
    draws them*; then **Meno's own looks, each made of Meno's parts
    alone** - *Lacquered*, *Flat*, *Crystal*, *Anodised*, *Cartoon* and
    *Line art* - which any renderer that makes the parts makes, and of
    which a renderer is told only the parts (the boundary, 2026-10-31);
    and then those the renderer's manifest declares, made with materials
    and light of its own (a label, a description, docs/PLUGINS.md,
    *Looks*), in its order, Meno keeping no list of them. Folded under it, *Adjust this
    look* shows its parts, filled in from it, each the chemist's to change
    for this render alone: the molecules' material (as the 3D style draws
    them, glossy, metal, glass, matte, clay, white); where a surface is
    shown, the surface's (as the canvas draws it, glass, glossy, matte);
    the shading (lit, as a renderer finds light and shadow, or toon: one
    lit band and one in shade, the band's size chosen); and the outlines
    (none; thin, on every line; the outer edge only; the outer edge thick
    and the inner lines thin) with their width and colour. A part that
    does not apply - a band's size without toon shading, a width without
    an outer edge - is not shown.
  - A look no added plugin can make is not offered: a plugin's manifest
    declares the looks it can make (`looks`, PLUGINS.md).
- The plugin's options, as its manifest declares them (the Blender
  plugin's below).

**The card's parts** (the maintainer, 2026-10-29): one model for a picture
and a film alike, in four parts, in this order - **Look** (the look, its own
choices just under it, *Adjust this look* folded), **Render** (the
renderer, its samples, noise, where it renders, its colours, the width and
shape, a film's quality), **Scene** (the background, the lights) and, for
a film, **Motion** (the motion, *Once or Loop*, the length and the frames a
second). Meno's own choices each have their part; a plugin's option says
which part it belongs to (`section`, docs/PLUGINS.md), and one that says
none is shown last, under the plugin's name. *Once or Loop* is Meno's, for
every motion that can come back to its start - turning, and those a
renderer makes: *turning once round* Once eases in and comes to rest where
it began, as the canvas's *Turn once* does; as a Loop it turns at one speed,
seamlessly. A choice a motion is always made with - the Blender plugin's
motions are made with light traced, in Cycles - is said as text in its
row, with no control, and why beneath it, whatever was chosen (`fixed`, docs/PLUGINS.md, *Motions*).

Each is remembered: Meno's for a picture and a film apart, the plugin's as
the role's options, which Settings, *Chemistry*, shows as well, on its *3D* card.

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
  Where the look colours a bond by its atoms (`bondColouring: "byAtom"`),
  each line is two sticks, its halves, each in its atom's colour, as the
  canvas splits it at its middle.
- **Its chains as ribbons**, where its look draws them so: one mesh, made
  as the canvas makes it (`utils/ribbon.ts`), each point in the ribbon's
  colour (`COLOR_0` over a white material, as an NCI surface's below) and
  in the look's finish - clay and white one colour - and the chain atoms
  the ribbon stands for left out, as the canvas leaves them. Its triangles
  face as their normals do (anticlockwise seen from outside, 3.7.2.1): a
  renderer that takes a face's front by its turn, as Cycles does, lights
  it. A film that moves its atoms has the ribbon of each moment, shown
  only then (a scale key of `STEP`, 3.11) - every so many moments where a
  large protein's ribbons, all told, would weigh too much (1.5 million
  points), each held till the next; the render's frame on the page then
  says so ("Ribbons move every 4th frame").
- **Lines on its balls**, where its look draws them (`ballLines`): great
  circles about the molecule's own axes - x and y, or all three - each a
  thin ring (`lib/scene/shapes.ts` `unitRing`) lying on its ball, as wide
  as the look has them in ångströms, in their colour.
- **Its measurements**, as the canvas draws them: a distance's dashed
  line, an angle's or a torsion's arc and faint fan, in the canvas's blue
  and not lit (`KHR_materials_unlit`): marks, not things. None runs to an
  atom the look leaves out. Their values are words, which the scene does
  not carry yet (*Not yet*).
- **Materials** in the metallic-roughness model (3.9.2), colours linear:
  the look's finish, or as asked - glossy, a clear coat
  (`KHR_materials_clearcoat`); metal; glass, clear and tinted through its
  depth by the atom's colour (`KHR_materials_transmission`,
  `KHR_materials_ior`, `KHR_materials_volume`); matte; clay. A surface as
  the canvas draws it is seen through (alpha blended, 3.9.4) and from both
  sides (3.9.5); as glass, a thin wall.
- **Surfaces** - an orbital, a density - shown from a calculation's list,
  made at the value they are drawn at, each sign a mesh in its colour. One
  another grid colours (NCI's RDG surface, by sign(λ2)ρ: NCI.md) is one
  mesh whose points carry their colours on the scale (`COLOR_0`, linear,
  3.7.2.1), over a white material they multiply (3.9.2) - not seen
  through, as the canvas draws it; glass, glossy or matte as asked.
  Blender's importer takes those colours into the material as it is
  (checked with Blender 5.2: a ball whose points are red renders red).
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
  what a renderer would make between keys. A motion the renderer makes
  itself is not keyed: the scene is written still, for it to move.
- **What the molecules are made of**, in the scene's `extras`
  (`meno.molecules`): each molecule's atoms drawn - its element, and where
  it stands in the scene, in ångströms, as the first frame shows it - and
  its bonds between them, by index, with their orders. Meno's own data,
  written only for a film of a motion the renderer makes, which it builds
  from them: a large entry's every atom would only weigh down any other
  scene.

Khronos's glTF-Validator finds nothing wrong in what Meno writes (checked
while it was built; not part of Meno or its tests).

## Motions a renderer makes

Meno's canvas has one motion of its own, *Turn once* (2026-10-16): every
other motion of a film is the renderer's (the maintainer, 2026-10-16:
professional motion design, flashy where it serves a talk). A render
plugin declares the motions it makes in its role's `motions`, each an id,
a label and a description (docs/PLUGINS.md, *Motions*); Meno keeps no list
of them. The card's *Moving* offers Meno's own motions the molecules can
make, then the declared ones; chosen, the entry says the motion's id
(`motion`), and Meno writes the scene still, with the molecules' atoms and
bonds in its extras, and *Once or Loop* (`mode`: `once` or `loop`). The
options that adjust a motion are the role's, each `when` it is chosen.

### How long a film can be

A film is never asked shorter than its motion can be read in (the
maintainer, 2026-10-28): each motion says its shortest - Meno's own
(turning once round 3 s; through its frames, or in a vibration, 2 s), a
renderer's in its manifest (`shortest`, docs/PLUGINS.md, *Motions*). A
motion that changes one molecule into the next says each change's
shortest, and Meno multiplies it by the changes - one fewer than the
molecules, or as many where the film loops back to the first (*Once or
Loop*). The card's *Length* is bounded by it, and says so
under it ("At least 12 s for 3 molecules"); a length chosen before that is
shorter is raised to it, and the card says that instead. The longest it
asks is 60 s, or the shortest where that is longer. However a film is
asked for - the card, a saved or written ask - Meno refuses one shorter
before anything is rendered, saying how long it needs to be ("This film
needs at least 6 s for 3 molecules"): the rule is Meno's, and no renderer
keeps a copy of it (the boundary, 2026-10-31).

## Render as a step

**Render** is a kind of a workflow's step too (WORKFLOWS.md, *Kinds of
step*), done by a plugin that fills the role - the Blender plugin,
whose manifest names it among its `steps` with no options of its own, so
that it takes the role's: the same work, asked as a step. Built on
2026-10-12, its open questions answered the simplest way, for the
maintainer to change later:

- It takes molecules in 3D or a conformer set, and gives **a set of
  pictures** (the maintainer, 2026-10-12: as a calculation's results look):
  each entry is rendered as **a picture of its own** - its scene written by
  Meno as the command writes one, at the entry's own geometry, in its
  molecule's look, turned as the canvas turns that molecule, showing
  nothing besides (no list's surface, no vibration) - one job for each.
  No step takes pictures, so nothing is wired on from it.
- **Pictures only**, no films.
- Its options are Meno's own choices for a picture - width, shape, the
  look and its parts, starting from the command's defaults - then the
  plugin's; remembered for the step as any step's
  are (Settings, *Calculations*), apart from the command's.
- The pictures go **in the step's result set**, framed and wired from
  the step as any step's result set is, named *Rendered* and counted
  ("2 pictures"): in rows, left to right, in the order the entries came,
  each as large as its molecules are drawn. A set holds what lies inside
  its frame, pictures too: moved or copied, its pictures go with it. Run
  again, the set's pictures are replaced by the new ones - with what it
  did - as **one step to undo**; a run that makes none leaves them as they
  were and says why. An earlier run kept on the card keeps what it did,
  not its pictures.
- Its jobs are a step's: they wait their turn with the others, and a
  workspace opened again picks them up (the size each picture takes on
  the page kept with its job).

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

The frame is moved as anything on the page is: a drag on it - not on its
button - carries it, kept clear of where it now stands, and what the
render makes lands where it stands as it ends (the maintainer,
2026-10-28; `moveRender`).

While it renders, a dashed frame stands where what it makes will lie,
as large as it will be - beside the molecules, on the right, as large as
they are drawn; or, where something lies there, in the free space nearest
it, clear of all on the page and of other renders' frames - saying how
far it is and what its job said last, with a button that stops it. Its
words are set inside it in two lines at most, between margins clear of
the button - at 13 px, or as little less, to 10, as holds the longest it
may say; a frame too small for that - a small picture's - has them and
its button just below it, in a box as wide as two lines of them need or
as the frame, keeping only its bar. The frame and its words zoom with the
page alike, so where they go is the same at every zoom, and it is set as
the render begins, by all it may say as it runs; why one failed goes
inside where it holds, below where it is long. Words below a frame are
part of it on the page: its place is found clear of all with them, they
are kept clear as it is, and where the view eases to a render, it takes
them in too. What
it makes lands just there, in the frame's place; meanwhile the frame is
kept clear, as all on the page is, by what is put there - a file opened,
a set placed - so that nothing comes under where it lands.
Where it fails, the frame says why; the button puts it away. Its job's
folder is kept until Settings, *Calculations*, *Jobs*, clears it, as a
closed tab's are - its log, all the renderer said, and what it was
given - but what it made is taken out as it fails: a film's frames, which
it can make again. The view
eases to the frame and the molecules once, as the render is begun, where
they are not all in view; what it makes lands as the view then is, never
moving it again (the maintainer, 2026-10-11).

**Its workspace's tab closed**, a render stops with it - what it makes
would come to no page: its job is stopped as a step's is, its folder kept
until Settings, *Calculations*, *Jobs*, clears it, and nothing is put on
the page. Another workspace's renders go on. Closing asks nothing
more for a render: a tab with unsaved changes asks as before, and one
without closes at once.

What it makes is a **picture** on the page (docs/PDF.md, *A picture*): a
PNG, or a **film** - an MP4 - which plays where it lies, over and over,
without sound. A film is a picture whose media is `video/mp4`: it is
moved, made larger, turned, selected, copied, deleted and saved with the
workspace as any picture is. Its menu offers **Pause** or **Play** and
**Save film…**; a picture's, **Save picture…**. A film is not copied as a
picture for other programs.

## The Blender plugin

`src-tauri/resources/plugins/blender/`: a worker in Python alone (made by
uv, no package), and the script Blender runs, `render.py`.

- **Meno's own Blender** (the maintainer, 2026-10-12): the plugin always
  runs Blender 5.2.2 LTS, its official build for this computer from
  download.blender.org - macOS on Apple silicon (346 MB), Windows on x64
  (404 MB) and on arm64 (274 MB) - fetched as the plugin is set up, in the
  one question that sets it up, which says its licence, its size and where
  it comes from (`downloads`, `provides`); checked against the SHA-256
  Blender publishes for it; and unpacked into the plugin's data folder for
  Meno's own use - nothing installed on the system; on macOS the app
  copied out of the disk image as it is, its signature whole - and taken
  away with the plugin. A Blender installed on the computer is never
  looked for or run: not where the system finds programs, not where
  programs are usually installed, and there is no *Locate…*; one located
  before is not carried over. PLUGINS.md, *A program Meno fetches*, says
  when Meno fetches a program at all. The plugin is added on macOS and
  Windows (`systems`).
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
  samples for each pixel, noise removal, where it renders (the faster of
  the graphics processor - Metal, OptiX, CUDA, HIP or oneAPI, where Blender
  can use one - and the processor, or either), the background
  (transparent - a film's then white - white, black or grey), the colours
  (true to the style, by Khronos PBR Neutral; film-like, AgX; or
  standard), the key light and the light all round against the canvas's,
  the shadows' softness, and a film's quality. The renderer and noise
  removal are not offered under toon shading, which Cycles draws.
- **Its looks** (2026-10-15): all of Meno's. Their names say what each is as a whole, apart from the names of the materials a look is made of (2026-10-17, the maintainer: Lacquered, Flat, Crystal, Anodised and Terracotta, where they were Glossy, Matte, Glass, Metal and Clay, the materials' own names). The materials are in the
  scene's file. Toon shading is each material a Toon BSDF in the colour it
  had, lit in one band whose size is chosen, drawn by Cycles - which draws
  the band as a band - without noise removal, which would soften its edge.
  Outlines: Freestyle's silhouettes, borders and creases for the thin
  line, one pixel; and for the outer edge, the picture's own silhouette
  grown by the width, in the colour, under the picture - one edge round
  the molecule however its shapes overlap, which Freestyle's own external
  contour (each shape's) is not. Meno's looks keep the picture's place
  and size.
- **Looks with materials and light of their own** (`looks.py`, beside
  `render.py` in the job's folder). Gold, silver, copper, a soap bubble,
  wood, marble, terracotta (the look `clay`), porcelain, slime, neon,
  X-ray and fur are not a colour and a gloss: each is a
  material of Blender's own shader nodes, put on the molecules by their
  shapes' names (`ball #909090`, `stick #000000`: the element's colour is
  read from the name, so each element keeps its own, a shared material
  being the one thing the colours must not come to). A ribbon, one mesh
  whose points carry their colours, is first cut into a shape of each
  colour it has (`ribbon #c84a5e`), so that the look colours its parts as
  the canvas does; the lines on balls and a measurement's marks keep their
  own. Each look brings **its own
  lighting world**, which the camera never sees. The metals and the bubble
  reflect, so they have a studio: a world that is dim above and a darker
  band below, and three soft rectangular light panels (one wide at the
  upper left, one tall at the right, one narrow above) that give the
  reflections shapes. The matte looks have the same panels dim, a diffuse
  surface being over-exposed by the metals' strength. What is behind is
  still transparent, and is put under the picture as the Background choice
  asks. These looks are made by Cycles, with noise removal using the
  albedo and normal passes, the glossy and total bounces capped, and
  adaptive sampling; the key light and the light all round are the look's,
  not the canvas's. Their choices appear only under their look: silver's
  finish (mirror or satin), copper's (brushed or tarnished), the wood's
  species (oak, walnut, cherry, maple, ebony, or each element its own), terracotta's
  colour (one colour, terracotta, or the element colours), porcelain's
  finish (porcelain, or pearl: a cream white with a soft pink and green
  orient), fur's pile (long, or short and dense as velvet - a hair's length is a
  fixed fraction of its own part's radius and every ball and stick has the
  same number of hairs, whatever scale the shape has in the scene), and
  marble's pattern (Carrara, long veins laid in the molecule's own space so
  that they run on across atoms and sticks, or swirls on each atom). The
  metals' reflectances are the published F0 values of Hoffman's table of
  metals ("Physically Based Shading", SIGGRAPH 2010 course): gold 1.00
  0.71 0.29, silver 0.95 0.93 0.88 and copper 0.95 0.64 0.54, linear;
  copper is deepened by the scene - panels of a warm tone, fewer of them
  - not by its F0. A surface drawn from an orbital keeps the colours Meno
  gave it.
- **Its motions** (2026-10-17, for 0.1.14): Reveal, Pulse, Assemble, Scan
  and Dissolve - the motions the maintainer approved from the previews of
  2026-10-16 and 10-17 - each a script (`motion_<id>.py`) made in one
  studio they share (`studio.py`), both copied into the job's folder with
  render.py. The studio builds the molecules the scene's extras hold, at
  4 cm an ångström - a product on a table - as the canvas shows them, in
  the motions' own finish (each element's colour under a clear coat;
  carbon near black): a perspective camera with an 85 mm lens and depth of
  field - its sensor across the frame's width, a portrait film's too, so
  that a tall molecule is framed whole - motion blur, a finishing compositor. The Look and its parts are
  not used for them: a motion has its own. The Background choice picks
  the studio: **White** (or Transparent, a film having none) the white
  studio - a paper sweep the camera sees, lit only by a soft source above
  it, so that the molecule's contact shadow is its own, the molecule's
  lights lighting it alone, its colours by Khronos PBR Neutral, effects
  carried by colour and shadow rather than glow - **Black** or **Grey**
  the dark studio: a pool of light on a dark cyclorama, coloured rims,
  bloom. Each motion has its own tuning on each. *Once or Loop* (the
  entry's `mode`, Meno's choice): Once eases in and holds a composed last frame; Loop
  repeats seamlessly - Pulse and Scan, and Reveal in the dark studio, loop
  of themselves (three waves a period; a sheet up and down as the molecule
  turns once; the rims circling); the others loop as a cycle, played
  forward and then back from frames rendered once, both ends held still,
  so the seam does not show. Each motion is timed in a length of its own
  (Reveal 7 s, Pulse 6, Assemble 8, Scan 7, Dissolve 7) and a film of
  another length plays it all, faster or slower; a loop is timed in the
  film's length. A motion chooses where it renders as a picture does
  (*Where it renders*): on Automatic, the faster here, as timed once and
  kept - never the graphics processor only for being there, which on a
  computer whose graphics processor is slower than its processor (an
  integrated one, say) renders slower.
- **Its changes of molecules** (2026-10-26; the films lane's patterns,
  each approved by the maintainer from its films of 2026-10-19 to 10-23):
  a film of two molecules or more rendered together, each becoming the
  next in turn, in the order Meno wrote them - Once to the last, Loop back
  to the first. One film keeps one change throughout (the maintainer,
  2026-10-19). With one molecule, the render says it needs two.
  - **Ring** (`change-ring`): A's bonds let go; its atoms rise into one
    evenly spaced ring about the molecule (hydrogens just inside), which
    turns and lets them fall, in a sweep round it, into B's places - the
    nearest by the least travel in all, the same element preferred
    (Hungarian assignment); each keeps its colour until it lands, as B's
    element, with a squash. Where B has more atoms, one buds on the ring
    beside its source; where fewer, the spare ones fall into a neighbour.
  - **Scan** (`change-scan`): a sheet of light with a cobalt hoop at its
    rim passes down to the paper; below it A, its cut edge lit; just above
    it B, a rim of light seen through, solid a little higher.
  - **Shatter** (`change-shatter`): A breaks into shards of its own
    spheres and sticks (a Voronoi fracture made in the script, Bullet
    rigid bodies, the floor), and the shards gather into B's atoms, which
    fuse in a wave up from the paper.
  - Each piece is made in a Blender of its own - the studio, the part the
    changes share (`change.py`) and the change's script - after the one
    before. Every molecule stands on the same floor, turned as the canvas
    shows it; the camera is one move through the whole film - turning one
    way (Once) or swinging and back (Loop) - so one piece's last frame is
    the next one's first. The film is put together in the sequencer as
    runs of frames, one image strip for each run from one piece's folder
    (every piece's files have the same names). Shaders that glow are not sampled as lights,
    which would change how a molecule at rest is rendered between pieces.
  - Each change is timed in a length of its own (Ring, Scan and Shatter
    5 s), and the film's length is shared out among the pieces, each played
    faster or slower to fit.
- **Where it renders** (2026-10-16, the maintainer): a three-way choice,
  *Render on*: **Automatic (the faster one)**, the default; **Graphics
  processor**; **Processor**. Automatic times the two once on this
  computer - 16 samples at an eighth of the picture's width and height,
  the graphics processor warmed up first so that what is timed is not its
  kernels' preparing - and keeps the faster, by the processors' names and
  Blender's version, in `device-probe.json` in the plugin's data folder - which
  its worker knows, as the folder holding its environment, and passes to the
  job, whatever Blender's own path looks like; a later render takes what
  is kept. The step's line says *Checking which is
  faster...* while it times, and, after, **Rendered on the processor**,
  in small words, where the render was on the processor - by the choice,
  by the timing, or because Blender has no graphics processor it can use
  (nothing is shown where it rendered on the graphics processor). The
  job's log (*Show log* on the step's menu) says which in each case, and
  the two times - it is not in `meno.log`. The old on/off switch's
  remembered value is not read (pre-alpha: no shim). A render's progress
  comes from Blender's own render statistics (samples; a film's frames),
  as hundredths, and never goes back; between the statistics a graphics
  processor reports, seconds apart, the bar goes on by the clock along
  Blender's own estimate of the time remaining (never to the end before
  the render says it). A film's line says it in hundredths of its length,
  *Rendering 37%...*.
- **Why one failed** is what the render script said as it stopped
  (`render.py: ...`, said without the script's name, which means nothing
  to the person) or what Python raised, as its traceback ends
  (`TypeError: ...`) - all of it, a message of several lines as one, up
  to what Blender says next (its progress, its own last words); else Blender's last line that says error; else its
  last. Never Blender's own last words, which say only that a script
  failed or what memory it did not free as it quit (`worker.py` `why_of`).
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
so the Blender plugin is GPL-3.0-or-later: its folder carries the
licence's text (`LICENSE`) and its files say so; it stands strictly apart
- nothing of Meno's or of another plugin's takes anything from it, and it
speaks to Meno only through files and arguments (docs/PLUGINS.md,
*Licences*). README lists it with its licence.

## Decided

By the maintainer, 2026-10-10 to 2026-10-12:

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
7. **Meno's own Blender** (2026-10-12): the plugin always runs Blender
   5.2.2 LTS, fetched as it is set up; never a Blender installed on the
   computer. This replaces two decisions of 2026-10-11 - Blender 5.0 or
   later installed separately, the newest copy taken; and a copy fetched
   by Meno only where none was found, on asking.
8. **The view moves once**, as a render is begun; not again as what it
   makes lands.
9. **Render as a step** (2026-10-12): its pictures in a framed result set
   wired from the step, as a calculation's results are; one for each
   entry; pictures only; a run again replaces them, one step to undo; its
   own options, from Meno's defaults.

**Withdrawn for now** (the maintainer, 2026-10-29: something half-finished
is not offered at all): the Blender plugin's liquid change of molecules
(`change-liquid`) and its ice look. Both are kept, with a note of where
they stand and what a fresh start should question first, on the branch
`agent/films-liquid-shelved` (`docs/FILMS-LIQUID-SHELVED.md`,
`docs/LOOK-ICE-SHELVED.md`). An ask for either - a step saved with it, a
written ask - is refused ("no look is called 'ice'"); a card that last chose
one starts from its first choice.

## Not yet
- The words the canvas puts on molecules in 3D - atom numbers, R and S,
  E and Z, a measurement's value - are not in the scene yet: they are
  words, which glTF has no word for, so they would be written as shapes.
- Films with a transparent background (a video kind that keeps it, which
  every system's web view plays, is wanted first).
- A render is not picked up again as a workflow's job is: its workspace's
  tab closing stops it (*On the page*), and Meno's window closed as a
  whole leaves it running, what it makes kept only in its job's folder.
