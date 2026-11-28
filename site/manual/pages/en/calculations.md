# Calculations and their programs

Which programs Meno's calculations run, and how to point Meno to one you installed yourself; how many jobs run at once and where; how to watch a run and stop it; and what a molecule shows of the calculation it came from.

## Programs {#programs}

A calculation step is done by Meno or by a plugin ([Workflows](workflows#steps)); each step is on the page [The steps](steps). A plugin that runs a program comes in one of two kinds.

- Some bring their program with them: Meno downloads it when the plugin is set up, as with the xTB and CREST plugins.
- Others are interfaces to a program you install yourself, such as the ORCA interface for ORCA and the Gaussian interface for Gaussian 16. Meno never downloads such a program: setting up the interface fetches only what the interface needs.

Settings, *Plugins*, lists them ([Plugins](plugins)).

## A program you installed {#locate}

Meno looks for a program you installed where the system finds programs. Its plugin's card in Settings, *Plugins*, has a line for it, as *ORCA, installed separately:*, then where it was found and its version, or *Not found*.

- Press *Locate…* and choose the program itself to point Meno to it. If the copy will not do, the line says why.
- A step's card says *No input* until something is wired into it, and *Ready* once it can run. Where its program is not found, the card says so in place of *Ready*, as *ORCA not found*, and the play button on its right-click menu (*Run*) opens Settings, *Plugins*, where you can locate it.

## Before a run {#asking}

- A plugin is set up the first time you add it or something needs it, and Meno asks first: *Download xTB?*, say, or *Set up the ORCA interface?* for an interface. *Allow and download* sets it up; *Not now* fetches nothing ([Plugins](plugins#adding)).
- Where running a step again would take earlier runs out of the workspace, its menu says so with *Run*, before you choose it.
- Deleting a step that is running asks first (*Delete a step that is running?*): *Delete step* stops its jobs, and their files go with it.

## Jobs {#jobs}

A step that runs a program runs it as jobs on this computer, one for each molecule unless its plugin runs them together. Settings, *Calculations*, *Jobs* sets how they run ([Settings](settings#calculations)).

- *Cores for each job*, *Cores jobs may use* and *Memory jobs may use*: jobs run as many at once as fit in these, and the others wait their turn in the order they were asked for. While *Cores for each job* is empty, a step's jobs share the cores jobs may use.
- *Where jobs run*: the row says *Meno's own folder*, or the folder chosen. *Choose…* a folder for the jobs' files; once one is chosen, *Meno's own* beside it goes back to Meno's own folder. It can be changed only while no job waits or runs. A folder on this computer's own disk is best: a network or synced folder may lose a job's files as it runs.
- *Finished jobs' files*: how many finished jobs are kept, and how much they hold; *Clear* deletes them. With *Keep job folders once saved* off, a finished job's folder goes to the Trash (the Recycle Bin on Windows) once the workspace's saved file holds all of it.
- *Keep the computer awake while calculations run*.
- *Say a job is quiet after*: how many minutes a running job may write nothing before its step says so. Meno never ends a job for it.

Jobs go on when Meno closes, and those waiting start in turn. When the workspace is opened again, what the finished ones gave comes in.

## Watching a run {#watching}

Right-click a step: the first row of its menu is icons, among them a play button whose tip says *Run*, and *Run from here* beside it. Or right-click empty space for *Run all* ([Workflows](workflows#running)). Before a run, the frames of the sets a step will give say *Not run yet*. The step's card says how it is going:

- *Waiting*, with its place in the queue, as *Waiting · 2nd*.
- *Running*, with the time since it started, or how many of its jobs have ended, as *Running · 3 of 12*; and *no output for*, with the minutes, where a job has been quiet past *Say a job is quiet after*.
- *Done*, *Failed* with why, or *Stopped*.

*Show log*, on the step's right-click menu, opens its log in the column of texts on the right, following it while the job runs. For a step of several jobs, a list at the top of the column shows another, as *Job 2 of 12 · failed*. *Show files* shows the job's folder in Finder or File Explorer.

## Stopping {#stopping}

- On a running step's right-click menu, a stop button in place of the play button, its tip *Stop*, stops the whole step, and nothing of that run comes in.
- *Stop all*, on the right-click menu of empty space, stops every step that is running.
- *Stop this job*, the button beside that list in a step's log, stops the job shown alone. The step goes on and brings in what its other jobs gave; that job's molecules go out of the step's *Failed* exit, where a step puts what it could not do ([Where results go](workflows#results)).

A run's results come in as one step to undo. An undo takes them away; the jobs' files stay until you *Clear* them.

## What a molecule shows {#molecule}

A molecule in 3D from a calculation - a step's result, or an output opened from a file - has a chip under it. Shut, the chip says what the calculation was - its program and version, its method, its charge and multiplicity - and its energy, and, picked out in colour, any imaginary frequencies and how many warnings.

- Click the chip to open it: what the calculation found of the molecule, group by group; *How it was made*, folded until you open it; and *Warnings*, or *Could not read it* where a reader could not.
- Where a molecule has several frames, such as its conformers, the chip says which is shown and its energy above the lowest ([3D structures](3d#conformers)).
- Right-click the chip for *Copy*, which copies what it says as text, and, where it has energies, *Copy energies*, which copies them as a table.
- The lists the calculation gave, such as its vibrations, are on the molecule's right-click menu, each by its name. Choose one to open it under the molecule. An imaginary frequency is marked in it. Click a vibration's row to set the molecule moving in it, and click it again to bring the molecule to rest.
- *Show*, followed by the output's name, on the molecule's right-click menu, opens the output it was read from in the column of texts.

## Opening an output {#opening}

A calculation's output from disk is opened as any other file: *Open…*, or drop it on the window. A plugin added in Settings, *Plugins*, reads it, and its molecules come onto the page with the chip above ([Files](files#opening)). Where no plugin added reads it, Meno says so in the corner.

The workspace keeps the outputs its molecules were read from in its file. A workspace that keeps many can grow large ([Files](files#large)).
