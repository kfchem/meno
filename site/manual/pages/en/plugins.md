# Plugins

What Meno does beyond itself comes from plugins: reading SMILES and making structures in 3D, reading structures from pictures, rendering pictures and films, reading calculations' outputs and running them. How to add one, choose between them, and take one away.

## The list {#list}

Settings, *Plugins*, has a card for each plugin Meno offers: its name and version, what it does, what it reads and writes, its licence and where it comes from. On the right, *Added* or *Not added*, with *Add* or *Remove*. A plugin made for some systems only says so in place of its button, as "For macOS and Windows only".

## Adding one {#adding}

Press *Add*. Meno asks before it downloads anything, as it does before anything first uses the network ([Installing](installing#network)): the question says what it fetches, from where, under which licence and about how large. *Allow and download* sets the plugin up; *Not now* fetches nothing. Meno remembers the yes for that plugin until you withdraw it.

- While it is set up, its card says how far it has got, and a card in the corner of the window says what is being downloaded and from where.
- Plugins are set up one at a time; one waiting its turn can be left out with *Skip*.
- Meno offers a plugin where one is needed, too: the first time something needs RDKit, say, or when a file is dropped that no added plugin reads.
- If setting one up fails, its card says why. Press *Add* again to try again; a download that stopped goes on from where it stopped.

## Programs you install yourself {#installed}

A few plugins work with a program installed separately, under its own licence, which Meno never downloads: ORCA, Gaussian 16, Multiwfn and NCIPLOT. Their cards have a line for the program: where Meno found it, with its version, or "Not found". Press *Locate…* and choose the program itself. Gaussian 16 is run on macOS and Linux only.

## Choosing who does what {#roles}

Settings, *Chemistry*, lists what plugins do for Meno's own work - *SMILES to a structure, and back*, *Structures in 3D, and their conformers* and the rest - and which plugin does each. Where two plugins can do the same, choose there which one does it: *Structures read from pictures* can be done by MolScribe or by MolNexTR. What a plugin can be asked to do differently stands under it, such as RDKit's *Conformers sought*.

## Taking one away {#removing}

*Remove* takes a plugin away, with what it downloaded. If it has work running or waiting, Meno asks first: *Stop and remove*, or *Cancel*. A plugin taken away is not set up again by itself; *Add* brings it back.

## Working offline {#offline}

Click *Online*, at the top of the window, to work offline - or turn on *Work offline* in Settings, *Network*. Nothing then leaves this computer: nothing is asked, nothing is downloaded, and so no plugin can be set up meanwhile.

Settings, *Network*, keeps the record: what has been allowed, each with *Withdraw* to take the yes back, and every connection since Meno started.

## The plugins Meno offers {#offered}

- **Getting started**: the first steps in Meno, and plugins to add. It comes with Meno, with nothing to download.
- **RDKit**: makes sense of a structure as it is drawn - hydrogens, valence, aromatic rings, R and S, E and Z - reads and writes SMILES, and makes structures in 3D and their conformers.
- **MolScribe**, **MolNexTR**: read structures from pictures - a figure a PDF holds as a picture, a screenshot.
- **Blender**: renders pictures and films of molecules in 3D.
- **cclib**: reads the outputs of many calculation programs.
- **WFX reader**: reads wavefunction files (WFX).
- **PySCF**: works out orbitals and densities on a grid, from a calculation's output.
- **xTB**: optimises molecules in 3D and works out their energies and vibrations.
- **CREST**: searches for a molecule's conformers in 3D.
- **ORCA interface**, **Gaussian interface**: optimise molecules in 3D and work out their energies and vibrations, with ORCA or Gaussian 16 installed separately.
- **Multiwfn interface**, **NCIPLOT interface**: show non-covalent interactions as surfaces coloured by their strength, with Multiwfn or NCIPLOT installed separately.
- **CReM**: makes new structures from seeds, by replacing their fragments.
- **REINVENT 4**: makes new molecules with a generative model of SMILES.
