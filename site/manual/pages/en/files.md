# Files

How Meno keeps your work in one file, opens other files, writes structures out in other formats, and becomes the app files open with.

## The workspace file {#meno}

Everything on a workspace's page is kept in one file, a .meno: its drawings and molecules, its texts, PDFs and pictures, the calculations' outputs its molecules were read from, and what a workflow's calculations wrote.

- *Save* is the button at the top of the window (⌘S on a Mac, Ctrl+S on Windows). A workspace saved before goes back to its file; one never saved asks where first, and its tab then takes the file's name.
- *Save As…*, on the right-click menu of empty space (⇧⌘S, or Ctrl+Shift+S), saves it as a new file.
- *Open…*, on the same menu (⌘O, or Ctrl+O), opens a .meno in a tab of its own, or brings its tab forward if it is open already. A .meno double-clicked in Finder or File Explorer, or dropped on the window, opens the same way.
- *New workspace*, the + beside the tabs, opens an empty one, and *Close tab*, the × on a tab, closes one. A dot on a tab means changes not saved: Meno asks before such a tab or the window closes - *Save*, *Close without saving*, or *Cancel*.

## A large workspace {#large}

A workspace that keeps calculations' raw outputs can grow large. Past a size - 500 MB at first, set in Settings, *General*, *Say a workspace is large past* - Meno asks as it saves: *Save it all*, *Don't keep their raw outputs*, or *Cancel*. Past 1 GB a workspace would be too large to open again, and *Save it all* is not offered.

To leave raw outputs out ahead of that, choose *Don't keep raw outputs* on a step's right-click menu, or *Don't keep in the file* on a set's.

## Opening other files {#opening}

Choose *Open…*, or drop files on the window: each goes where it belongs.

- Structures in MOL, SD, RXN, XYZ and PDB files, and cube files, are read by Meno itself and put on the page - where they are dropped, or near the middle of the view with *Open…*.
- PDFs, and pictures in PNG or JPEG, are put on the page too.
- Texts - .txt, .csv, .tsv, .json, .log and the like - open in the column of texts on the right. A CSV or TSV table can go on the page with *Put on the page as a table*, on its right-click menu.
- A calculation's output - ORCA's, Gaussian's, xTB's and others' - is read by a plugin, cclib among them, added in Settings, *Plugins*. Where none added reads it, Meno names the plugin that would, with a button to add it.
- A file that cannot be read is named, with why.

## Writing other formats {#export}

- Choose structures or molecules, right-click, and choose *Export…*. The *Export* card offers *MOL file*, *SD file*, *RXN file* for a reaction, *PDB file* and *XYZ file* for molecules in 3D, and *SVG picture*; then Meno asks where to save it.
- *Copy as SMILES*, on the same menu, copies a drawing's SMILES.
- A picture's right-click menu has *Copy picture* and *Save picture…* (*Save film…* for a film), and a PDF's has *Save as PDF…*.

A copy puts a picture beside the structure, for programs that take no drawing of their own. Where that picture is made of pixels - for a program that takes no drawing in vectors, and for molecules in 3D in any picture - Settings, *Files*, *Copied pictures* sets how sharp: *300 dpi*, *600 dpi* or *1200 dpi*.

## Which plugin reads what {#readers}

Settings, *Files*, has a table of the kinds of file Meno opens: what reads each, what else could, and what writes it. Where more than one plugin can read a kind, choose there which one does.

## Opening files with Meno {#default-app}

Settings, *Files*, under *Opening files*, lists the formats Meno can be the app for - .mol, .sdf, .rxn, .xyz, .pdb, .cube and .pdf - and which app opens each now. A .meno opens with Meno from the start.

- On a Mac, *Use Meno* makes Meno the app for that format; the system may ask first. The app it replaced can have it back with the button named after it, as *Use Preview again*.
- On Windows, only Windows' own Settings can choose a default. *Use Meno* offers Meno for that format and opens Settings, where you choose it. Until you have, the row has *Choose in Settings*, to open Settings there again, and *Stop offering Meno*, to take the offer back.
