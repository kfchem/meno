<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="site/assets/wordmark-dark.svg">
    <img src="site/assets/wordmark-light.svg" alt="Meno" height="44">
  </picture>
</h1>

A workspace for chemists. Draw a molecule, see it in three dimensions, look
through its conformers, run calculations on it, and keep the paper you are
reading beside it, all on one page. Meno is meant to make these one continuous
line of thought rather than separate tasks in separate tools - see
[what Meno is for](docs/PURPOSE.md).

Website: <https://kfchem.github.io/meno/>

**Status: pre-alpha.** The interface and the files Meno saves may change from
one version to the next.

## Download

Download Meno from the [latest release](https://github.com/kfchem/meno/releases/latest),
under *Assets*. Pick the file for your computer:

| Computer | File | Needs |
| --- | --- | --- |
| Windows | `Meno_<version>_x64-setup.exe` | Windows 10 or 11, 64-bit (x64) |
| Mac | `Meno_<version>_aarch64.dmg` | A Mac with Apple silicon (M1 or later), macOS 13 or later |

The other files in a release (`latest.json`, `Meno_aarch64.app.tar.gz` and the
`.sig` files) are what Meno downloads when it updates itself; you do not need
them. There is no build for Intel Macs or Linux yet.

### Windows

1. Download `Meno_<version>_x64-setup.exe` and open it.
2. If Windows says it protected your PC, choose *More info*, then *Run anyway*.
   Windows says this because Meno's installer is not yet signed with a
   certificate it knows.
3. Follow the installer. It installs Meno for your user account alone, so it
   needs no administrator's password.
4. Open Meno from the Start menu.

### Mac

1. Download `Meno_<version>_aarch64.dmg` and open it.
2. Drag Meno into the Applications folder.
3. Open Meno from Applications. The first time, macOS says it could not verify
   that Meno is free of malware. Choose *Done*.
4. Open System Settings, then Privacy & Security. Under Security, choose
   *Open Anyway* beside the line about Meno, and give your password when
   asked.
5. Open Meno again. If macOS asks once more, choose *Open Anyway*. It
   remembers this, so you do it once.

macOS asks because Meno is not yet notarised by Apple. Open Meno from
Applications rather than from the disk image: a Meno opened from the disk
image cannot update itself.

### Updates

The first time it starts, Meno asks whether it may keep itself up to date. If
you agree, it looks for a new version as it starts and every few hours,
downloads it in the background and installs it when you quit. *Restart now*
in the notice installs it at once. You can turn this on or off at any time in
Settings, Network, under *Keep Meno up to date*.

Meno connects to nothing without asking first, and shows every connection as
it is made. Click the globe at the top of the window to work offline: then
nothing goes out at all.

On a Mac, if Meno is in a folder your account cannot change (Applications, for
an account that is not an administrator), macOS asks for an administrator's
name and password as Meno quits with an update. If you cancel, Meno stays as it
was.

### Plugins and calculation programs

Some of Meno's work is done by plugins: chemistry from SMILES and 3D structures,
conformer searches, optimisations and energies, reading the outputs of
calculation programs. A plugin sets itself up the first time it is needed,
after Meno asks, by downloading what it needs into Meno's own folder. Settings,
Plugins lists them, and adds or removes them. Calculation programs you have
installed yourself are used where they are; Meno never downloads them.

### Uninstalling

- **Windows**: Settings, Apps, Installed apps, Meno, *Uninstall*. The
  uninstaller offers to delete Meno's data as well.
- **Mac**: drag Meno from Applications to the Bin.

Meno keeps its settings, plugins and calculation jobs in its own folder:
`%APPDATA%\com.kfchem.meno` on Windows and
`~/Library/Application Support/com.kfchem.meno` on a Mac. Delete that folder to
remove them too. Your own files are wherever you saved them.

## What Meno does

- **Drawing**: structures in the ACS 1996 style, drawn by pulling bonds out of
  atoms; chains across a honeycomb; labels and abbreviations, charges, R and S;
  Clean-up; reactions with arrows, "+" signs and their conditions written on
  the page.
- **Molecules in 3D**: a drawing raised into a 3D model beside it, turned under
  the pointer and measured; conformers with their energies; trajectories frame
  by frame.
- **Calculations**: workflows drawn on the page around the structures they work
  on, run as jobs on your computer, each step keeping its runs.
- **PDFs, pictures and texts** on the page beside the drawing: read a PDF in a
  column, take its words and figures out onto the page.
- **Files**: a workspace saves as one `.meno` file. Meno opens MOL, SD, RXN,
  XYZ and PDB files and SMILES, exports all but XYZ, and reads the outputs of
  many calculation programs through plugins
  ([the whole list](docs/ARCHITECTURE.md#file-format-support)). Structures
  copy into other programs as pictures that Meno can open again.

## Development

Prerequisites:

- [Node.js](https://nodejs.org/) 20+ and npm
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain) for the Tauri backend
- Platform build tools required by Tauri v2 — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

Setup and common commands:

```bash
npm install          # install frontend dependencies
node scripts/fetch-pdfium.mjs  # PDFium's library, pinned and checked, for the desktop app (docs/PDF.md)
npm run dev          # run the Vite dev server only (frontend, in a browser)
npm run tauri dev    # run the full desktop app (Rust + WebView)
npm run typecheck    # TypeScript typecheck only
npm run lint         # ESLint
npm test             # Vitest unit tests
npm run check:tauri  # Tauri crate/npm versions must match (tauri build fails otherwise)
npm run build        # tsc typecheck + production frontend build
npm run tauri build  # produce a desktop app bundle
```

Unit tests live next to the code as `*.test.ts(x)` and run in Node; they cover
pure logic only. The built app is checked with real pointer and keyboard input
by the harness in [`scripts/gui/`](scripts/gui/README.md), run by hand on
Windows and macOS.

Rust-side checks (run from `src-tauri/`):

```bash
cargo check   # typecheck the Tauri backend
cargo clippy  # lint the Tauri backend
cargo test    # run Rust tests
```

On Windows, compiling the Rust side also needs the MSVC build tools
("Desktop development with C++" in Visual Studio Build Tools).

Every text file has LF line endings, on Windows too: `.gitattributes` sees
to it, so git stores LF whatever an editor writes.

CI (`.github/workflows/ci.yml`) runs all of the above on every pull request:
typecheck, lint, tests and build on Ubuntu, and `cargo check` / `clippy` /
`test` on Windows. Releases are built by `.github/workflows/release.yml`
([`docs/RELEASING.md`](docs/RELEASING.md)). The website is in [`site/`](site/)
and is published to GitHub Pages by `.github/workflows/pages.yml`.

Further reading: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) (how the app
is structured, Tauri commands, supported file formats) and
[`docs/AUDIT-2026-09.md`](./docs/AUDIT-2026-09.md) (known issues and backlog).

## Known limitations

- Pre-alpha: a workspace saved by one version may not open the same way in a
  later one; the release notes say when that happens.
- Releases are built for Windows (x64) and Macs with Apple silicon only.
- The Windows installer is not code-signed, and the Mac app is signed ad hoc
  and not notarised, so each system asks once before opening it (see
  [Download](#download)). On a Mac, a permission given to Meno (to a protected
  folder, say) may be asked for again after an update.
- Some calculation plugins run only on some systems: the conformer search
  with CREST is not available on Windows, where *Conformers* uses RDKit alone
  ([`docs/WORKFLOWS.md`](docs/WORKFLOWS.md)).

## Disclaimer

Meno is provided "as is", without warranty of any kind, express or implied,
and its authors accept no liability for any loss or damage arising from its
use, as sections 7 and 8 of the Apache License 2.0 set out.

Meno is pre-alpha research software. The structures, 3D structures,
conformers, energies and other results it makes or reads may be wrong: check
them before relying on them. It is not meant for clinical, diagnostic,
regulatory or safety-critical use.

Plugins, and the calculation programs they run, are their own authors' work
under their own licences and terms; whether to install and use them is yours
to decide. Names of other software, systems and companies that appear here or
in Meno belong to their owners, and do not mean that they are affiliated with
Meno or endorse it.

## License

This repository is licensed under the **Apache License 2.0**. See [`LICENSE`](./LICENSE).

Meno's typefaces, IBM Plex Sans (upright and italic), IBM Plex Sans JP and IBM Plex Mono (`src/assets/fonts/`), are © IBM Corp. and licensed under the SIL Open Font License 1.1; see [`src-tauri/resources/licenses/IBM-Plex-OFL.txt`](./src-tauri/resources/licenses/IBM-Plex-OFL.txt), which the app carries with it. The font files are bundled unchanged, and carry the same notice in their own metadata.

The outlines Meno places Arial labels by before the system's own Arial has been read (`src/lib/chem/arial.ts`) are worked out from Arimo, © The Arimo Project Authors, licensed under the SIL Open Font License 1.1; see [`src-tauri/resources/licenses/Arimo-OFL.txt`](./src-tauri/resources/licenses/Arimo-OFL.txt). No font file is taken from Arial.

The wordmark's letters (`site/assets/wordmark*.svg`) are drawn from Orbitron, © The Orbitron Project Authors, licensed under the SIL Open Font License 1.1; see [`site/assets/fonts/Orbitron-OFL.txt`](./site/assets/fonts/Orbitron-OFL.txt). The website carries IBM Plex as the app does.

Meno reads and draws PDFs with PDFium, © The PDFium Authors, licensed under the BSD 3-Clause License (some files under the Apache License 2.0), as built by [`bblanchon/pdfium-binaries`](https://github.com/bblanchon/pdfium-binaries) (MIT). The app carries PDFium's library unchanged, and its licences and those of what it is built with - FreeType, HarfBuzz, ICU, libjpeg-turbo, OpenJPEG, libpng, zlib, Little CMS, Abseil, Anti-Grain Geometry, dragonbox, fast_float, simdutf and LLVM's libc - as `src-tauri/resources/licenses/PDFium-*`. This software is based in part on the work of the Independent JPEG Group. Portions of this software are copyright © The FreeType Project (www.freetype.org). All rights reserved.

## Acknowledgments

Thanks to all contributors and users who provided feedback and ideas from related communities.
