# Installing

Meno runs on Windows 10 and 11 (64-bit) and on a Mac with Apple silicon (M1 or later) and macOS 13 or later. It is free, and it keeps itself up to date once you let it.

## Download {#download}

Both downloads are on [Meno's website](/#download), which takes them from the project's [releases on GitHub](https://github.com/kfchem/meno/releases/latest):

- Windows: `Meno_<version>_x64-setup.exe`
- Mac: `Meno_<version>_aarch64.dmg`

The other files in a release are what Meno downloads when it updates itself; you do not need them. There is no build for Intel Macs or Linux.

## On Windows {#windows}

1. Download the installer. If Edge says the file is not commonly downloaded, choose *More actions* (the three dots beside the download), then *Keep*; if it asks again, *Show more*, then *Keep anyway*.
2. Open the installer. If Windows says it protected your PC, choose *More info*, then *Run anyway*.
3. The installer asks nothing. A small window shows while it installs Meno for your account alone, so it needs no administrator's password, and Meno opens when it is done.
4. Afterwards, open Meno from the Start menu or the desktop.

> Edge and Windows warn about the installer because it is not signed with a certificate they know.

## The first time on a Mac {#mac}

1. Open the disk image and drag Meno into Applications. On an account that is not an administrator's, macOS asks for an administrator's name and password to put it there.
2. Open Meno from Applications. The first time, macOS says it could not verify that Meno is free of malware, and does not open it. Close the message with *Done*; do not move Meno to the Bin.
3. Open System Settings, then *Privacy & Security*. Under *Security*, choose *Open Anyway* beside the line about Meno, and give your password when asked.
4. Open Meno again. If macOS asks once more, choose *Open Anyway*. It remembers this, so you do it once.

> macOS asks because Meno is not notarised by Apple. Open Meno from Applications, not from the disk image: a Meno opened from the disk image cannot update itself.

## The first question {#first-question}

The first time you do something in Meno - put a structure down, open a file, open Settings - it asks *Keep Meno up to date?* With *Allow and download*, it looks on GitHub for a newer version as it starts and every few hours, downloads it in the background and installs it when you quit. With *Not now*, it does none of this. You can change your mind at any time in Settings, *Network*, under *Keep Meno up to date*.

## Updates {#updates}

While Meno keeps itself up to date, a new version comes in the background and goes in when you quit; *Restart now* in its notice puts it in at once. On Windows it waits while calculation jobs are waiting or running, because installing would stop them: it goes in when you quit with none.

On a Mac, if Meno is in a folder your account cannot change (Applications, for an account that is not an administrator's), macOS asks for an administrator's name and password as Meno quits with an update. If you cancel, Meno stays as it was.

## The network {#network}

Meno connects to nothing without asking first, and shows every connection as it is made. Each question says what the connection is for and where it goes, and a yes is remembered until you take it back in Settings, *Network*. To work offline, turn on *Work offline* there, or click the network button at the top right of the window: then nothing goes out at all.

## Plugins {#plugins}

Some of Meno's work is done by plugins: the chemistry of SMILES and 3D structures, conformer searches, optimisations and energies, reading the outputs of calculation programs. A plugin sets itself up the first time it is needed, after Meno asks, by downloading what it needs into Meno's own folder. Settings, *Plugins* lists them, and adds or removes them. Calculation programs you have installed yourself are used where they are; Meno never downloads them.

## Where Meno keeps its files {#files}

- On a Mac: `~/Library/Application Support/Meno` holds the settings, the plugins and what they downloaded, and the calculation jobs; `~/Library/Caches/Meno` holds what Meno keeps of PDFs and downloaded ligand data.
- On Windows: `%APPDATA%\Meno` holds the settings, and `%LOCALAPPDATA%\Meno\data` the rest, which is large and belongs to this computer alone.

Your own files are wherever you saved them.

## Uninstalling {#uninstalling}

- On Windows: Settings, *Apps*, *Installed apps* (*Apps & features* on Windows 10), Meno, *Uninstall*. The uninstaller offers to delete Meno's data as well.
- On a Mac: drag Meno from Applications to the Bin. To remove its data too, delete the two folders [above](#files).
