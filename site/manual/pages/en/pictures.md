# Pictures and films

How to make a picture of what is on the page, and how to render molecules in 3D as a picture or a film - turning, moving through their conformers or in a vibration - to save, or to show on a slide.

## A picture of the page {#of-the-page}

Choose what the picture should hold - ⌘A (Ctrl+A on Windows) chooses everything - and then:

- Copy it (⌘C, or Ctrl+C) and paste it into Word, PowerPoint or another program ([Into Word and PowerPoint](drawing#office)).
- Or right-click it, choose *Export…*, and choose *SVG picture* on the *Export* card; Meno then asks where to save it ([Writing other formats](files#export)).

A drawing goes into these as lines. Molecules in 3D go in as a picture made of pixels, as the page shows them, never as lines: Settings, *Files*, *Copied pictures*, *Resolution* sets how sharp - *300 dpi*, *600 dpi* or *1200 dpi*.

## What a render needs {#needs}

A render is made by the Blender plugin, which runs on macOS and Windows. Add it in Settings, *Plugins*: Meno asks before it downloads the plugin and its own copy of Blender, saying from where, under which licence and how large, and *Allow and download* sets it up ([Adding one](plugins#adding)). Nothing else needs to be installed.

## Asking for a render {#asking}

Right-click a molecule in 3D, or a selection that holds some, and choose *Render…*. It is on the menu only while a plugin that renders is added.

The *Render* card opens over the page. At its top, choose *Picture* or *Film*. Below, its choices stand in parts: *Look*, *Render*, *Scene* and, for a film, *Motion*. *Render* begins; *Cancel*, or Escape, closes the card. The card remembers what was chosen, for a picture and for a film apart.

## The look {#look}

*Look* sets what the molecules seem made of: *As the canvas draws them*, or one of Meno's own looks:

- *Lacquered: a clear coat over the element colours*
- *Flat: no shine, in the element colours*
- *Crystal: clear, tinted by the element colours*
- *Anodised: metal in the element colours*
- *Cartoon: one lit band, outlined*
- *Line art: white fill, outlined*

With one of these chosen, a line under the choice says what it looks like.

*Adjust this look*, folded under it, shows the parts the look is made of, to change for this render alone: *Molecules made of*, *Surfaces made of* where a surface is shown, *Shading*, and *Outlines*, with *Outline width* and *Outline colour*. A part that does not apply is not shown.

## Size, background and light {#scene}

- Under *Render*: *Width*, in pixels, and *Shape* - *Fitted to the molecules*, *16:9*, *4:3* or *Square*. Then the plugin's own: *Renderer*, *Samples for each pixel*, *Remove noise*, *Render on* and *Colours*.
- Under *Scene*: *Background* - *Transparent*, *White*, *Black* or *Grey*, for a picture and a film alike - then *Key light, against the canvas's*, *Light all round, against the canvas's* and *Shadows' softness*.

## Films {#films}

For a film, *Motion* holds:

- *Moving*: *Turning once round*; *Through its frames*, where a molecule has several - its conformers, say; or *In the vibration shown*, where a vibration from its calculation is shown on it.
- *Once or Loop*, for a motion that can come back to where it began: *Once: eases in and comes to rest*, or *Loop: seamless, over and over*.
- *Length*, in seconds. A film is never shorter than its motion can be followed in: the card says the shortest under it, as *At least 3 s*.
- *Frames a second*: *24*, *30* or *60*.

*A film's quality*, under *Render*, sets how large the file is. The *Film looks and motions* plugin, added in Settings, *Plugins*, brings more looks, motions and a *Studio* to the card while it is added.

## While it renders {#rendering}

A dashed frame stands where the result will lie, as large as it will be: on the right of the molecules, or in the nearest free space. It says how far the render has got - *Getting ready…*, *Waiting for other jobs to finish…*, *Rendering 37%…* - with a button that stops it. Drag the frame to put the result somewhere else.

If a render fails, the frame says why, and its button puts the frame away. Closing the workspace's tab stops its renders.

## The result on the page {#result}

A picture comes onto the page as a PNG, a film as an MP4 that plays where it lies, over and over, without sound. Move it or make it larger as any picture on the page.

- Right-click a picture for *Save picture…* and *Copy picture*; a film for *Pause* or *Play*, and *Save film…*. *Delete picture* takes either away.
- A picture rendered on *Transparent* keeps its transparency, in Meno and in the PNG saved.
- A film rendered on *Transparent* lies over whatever is under it on the page. *Save film…* saves it as a *Film with transparency (QuickTime)*. Not every program reads such a film; for a slide in another program, render the film on the slide's colour instead.
- On Meno's own slides, a film plays from its start as its slide comes, and a click pauses it or plays it on ([Presenting](slides#presenting)).

## Pictures in a workflow {#step}

*Render* is also a step of a workflow: double-click empty space, choose *Calculations*, then *Render* under *Blender* ([The steps](steps)). It takes molecules in 3D or conformers and makes a picture of each - pictures only, no films - in a set named *Rendered*.
