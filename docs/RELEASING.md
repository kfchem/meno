# Releasing Meno

A release is a draft on the project's GitHub Releases, built by
`.github/workflows/release.yml` from a tag. The Menos already installed
look for `latest.json` there (`src-tauri/src/update.rs`) and update
themselves - so nothing reaches them until the draft is published.

## Once: the updater's signing key

Every update is signed, and an installed Meno installs only what its
public key (`plugins.updater.pubkey` in `src-tauri/tauri.conf.json`)
checks. The private key is the maintainer's, and stays out of the
repository.

1. Make the key pair, choosing a password when asked:

   ```bash
   npx tauri signer generate -w "$HOME/.tauri/meno-updater.key"
   ```

   This writes the private key (`meno-updater.key`) and the public key
   (`meno-updater.key.pub`).
2. Keep the private key and its password somewhere safe, with a copy
   elsewhere. Losing them means the Menos installed can no longer be
   updated: they would have to be installed again by hand. (A new key can
   be brought in by an update signed with the old one, which carries the
   new public key.)
3. On GitHub, under Settings › Secrets and variables › Actions, add two
   repository secrets: `TAURI_SIGNING_PRIVATE_KEY` (the private key file's
   contents) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (its password).
4. Put the public key file's contents in `plugins.updater.pubkey`.

This is not code signing (Authenticode, Apple's Developer ID): without
that, Windows' SmartScreen warns about an installer downloaded for the
first time, and macOS will not open Meno until it is let through once
(see The Mac, below). Updates themselves are checked with the updater's
key, whether or not the apps are code-signed, and code signing can be
taken up, or dropped, at any release.

## The workflows' actions, pinned

Every action the workflows use (`.github/workflows/*.yml`) is pinned to a
full commit, its version in a comment beside it -
`uses: tauri-apps/tauri-action@<sha> # v0.6.2` - never a tag, which can be
moved to other code: the release workflow hands tauri-action the updater's
signing key. To take up a newer version, take its commit from the action's
own repository - `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`, and, where
that names a tag object, `gh api repos/<owner>/<repo>/git/tags/<sha>` for the
commit it is on - read what changed between the two, and put the commit and
its version in every workflow that uses it, in a change of its own.

## Each release

Builds carry PDFium's library (docs/PDF.md): `node scripts/fetch-pdfium.mjs`
fetches it at the release pinned there, checks its SHA-256 and puts it in
`src-tauri/pdfium/<system>/` - the CI and the release workflow run it
before building, and a build on a computer of one's own needs it once.

1. On a branch: raise the version, the same in both `package.json` and
   `src-tauri/Cargo.toml` (the app takes its version from `package.json`),
   bring the third-party notices up to date (`npm run notices`, see
   *Third-party notices*, below), and merge it into `main` as usual. Before that, see which files Meno
   carries no longer since the last release, and add each to the Windows
   installer's hook (see *What an installed Meno does*, below) - each the
   installer carried, that is, as `bundle.resources` in
   `src-tauri/tauri.windows.conf.json` picks them (a plugin's
   `requirements.in` is not among them):

   ```bash
   git diff --name-status --diff-filter=DR "$(git describe --tags --abbrev=0)" -- src-tauri/resources
   ```
2. Tag `main` with the version, prefixed `v`, and push the tag:

   ```bash
   git tag v0.2.0 origin/main
   git push origin v0.2.0
   ```

   The workflow refuses a tag that is not the version in both files.
3. The workflow builds the Windows installer (NSIS, per user) and its
   update, then the Mac's disk image and its update, signs the updates,
   and puts them all on a **draft** release with `latest.json`, which
   names an update for each (`windows-x86_64`, `darwin-aarch64`). The Mac
   job waits for the Windows one: each reads `latest.json`, adds its own
   and puts it back whole. Each job then checks that its update's
   signature names the version it is released as (see below).
4. If the run passed: try the draft's installers, write the release notes on
   the release page if you like, and publish it. The Menos installed find it
   the next time they look - shortly after they start, and once a day while
   they run. Never publish the draft of a run that failed. (Editing the
   notes does not change `latest.json`, whose `notes` were written as the
   workflow ran; Meno does not show them for now.)
5. Publishing also rebuilds the website (`.github/workflows/pages.yml`):
   its download buttons, the version and the files' sizes come from the
   release just published. If the release's files are ever named
   otherwise, change `ASSETS` in `scripts/site/release.mjs` to match.

An installed Meno checks more than the signature itself: the signature's
trusted comment must carry the version `latest.json` announces
(`requireSignedVersion` in `tauri.conf.json`), so that an older release
cannot be passed off as a newer one. The Tauri CLI writes that version
from 2.12 on; an update signed without it is refused by every Meno from
0.1.1 on, which is what each job's last step guards against.

## Third-party notices

Meno carries the licences of the software by others it is built with, in
`src-tauri/resources/licenses/`, and shows them in Settings (General,
*Licences*). Most are files of their own, written by hand: PDFium's and
those of what it is built with (`PDFium-*`, docs/PDF.md), pdfium-render's,
the typefaces' (IBM Plex, Arimo) and ACCeL's. The rest are in one file,
`THIRD-PARTY-NOTICES.txt`, which `npm run notices`
(`scripts/licenses/notices.mjs`) writes - offline, from what is on this
computer:

- **The npm packages in Meno's window**: the app is built as `npm run
  build` builds it, into a folder of its own (`dist/` is left alone), and
  every module that goes into its output - the workers' too, and the style
  sheets Tailwind's come in by - is put down to the package it is in.
  Vite's and Rolldown's helpers that the build writes in are theirs.
  A package that is installed but not in the output (a type package, a
  build tool, one whose code is shaken out) is not named.
- **The Rust crates built into Meno's program**: what a build for each
  system Meno is built for links (`TARGETS`: the Mac on Apple silicon and
  Intel, and 64-bit Windows) - `cargo tree --offline -e normal --target`,
  Meno's normal dependencies and theirs, proc-macros among them, not build
  scripts' or tests', with features unified as a build unifies them - and
  the systems taken together. (Not `cargo metadata`'s graph: it turns on
  every feature any user of a crate asks for, build scripts' and tests'
  among them, and so names crates no build links.)

For each: its name, version and licence as its manifest gives them, where
its source is kept, and every licence and notice file at the top of its
folder (`LICENSE*`, `LICENCE*`, `COPYING*`, `NOTICE*`, `COPYRIGHT*`,
`UNLICENSE*`), in full; a text already given is named, not repeated. A
crate under a licence that asks for its source to be offered (the MPL 2.0:
cssparser, selectors and others) also says where: its repository, and its
version on crates.io. A crate with no licence file of its own is given its
licence's standard text only where it comes with another crate here and
names no one (the Apache License 2.0's, the MPL 2.0's), and says where it
was taken from. One under a licence whose text carries its authors' own
copyright line (MIT, BSD) is given the text its repository holds, read
from its published page at the commit its version was published from (the
crate's `.cargo_vcs_info.json`) - a text read as documentation is, never a
package or archive fetched - kept in `scripts/licenses/upstream/` and named,
with where and when it was read, in `scripts/licenses/upstream.json`; so is
the licence of what such a crate carries without its licence (Microsoft's
WebView2 SDK, whose loader webview2-com-sys links in on Windows). The
script lists what it gave as it runs, with every licence that asks more
than a notice; the test fails while any crate has no text, or a text read
is for a version no longer built in.

Run it when a dependency changes, and before each release. Beside the
notices it writes `scripts/licenses/bundled.json` - each package's name,
version and licence, and the crates in `Cargo.lock` that are not built in -
which `scripts/licenses/notices.test.mjs` checks, in `npm test`:

- it builds the window again and fails if the npm packages in it, their
  versions or licences are not those recorded, or if `package-lock.json`
  installs another version of one;
- it fails if `Cargo.lock` holds a crate, or a version of one, that is
  neither recorded as built in nor as left out - any crate added, removed
  or updated;
- it fails if a package recorded has no notice in the file.

What it cannot see: a crate already in `Cargo.lock` that a change of
features or of systems brings into the program or takes out of it, with
the lock unchanged (Cargo's graph is not worked out in the test, as the
frontend job has neither Cargo nor the crates' sources); and code by others
copied into Meno's own sources or carried in a package's files without its
own licence file, which the notices' head and `NOTES` in the script give
by hand.

## The Windows installer

The installer is Tauri's default NSIS template with Meno's changes
(`src-tauri/windows/installer.nsi`, named as `bundle.windows.nsis.template`
in `tauri.windows.conf.json`; the changes are listed at its top and marked
where they are):

- Opened, it asks nothing. One small window - no title bar, the corners
  and shadow Windows 11 gives a window it is asked to round, Meno's
  wordmark, a bar in Meno's colours and *Installing Meno…* - shows while
  it installs Meno for the user (where Meno was, or `%LOCALAPPDATA%\Meno`),
  then says *Starting Meno…* and opens it. In the taskbar it is *Meno*,
  with Meno's icon (`installerIcon`).
- An installation already there is installed over, as an update is,
  not uninstalled first; a desktop shortcut is made, as the finish page
  used to by default.
- If Meno is running, it asks to close it before its window shows;
  declined, it ends having done nothing. If installing stops part way (a
  file that cannot be written, and *Abort* chosen), it says Meno could not
  be installed and ends - the window has no button to close it by.
- Quiet runs - an update's `/S /UPDATE`, with `/R` and `/ARGS` to start
  Meno again - show nothing and do what Tauri's do. The uninstaller is
  Tauri's, its page asking whether to delete Meno's data included.

The wordmark is drawn from `site/assets/wordmark-light.svg` into bitmaps,
one for each display scale (`src-tauri/windows/installer/logo-*.bmp`, by
`pwsh scripts/icons/installer-logo.ps1` on Windows); a new wordmark means
running it again.

The template names the tauri-cli whose default it was made from, and
`npm run check:tauri` fails when `@tauri-apps/cli` is another version: take
the default `installer.nsi` of both versions from Tauri's repository
(`crates/tauri-bundler/src/bundle/windows/nsis/`, at each version's tag),
carry what changed between them into Meno's, and change the version at its
top. Then build the installer and try it: opened, over an earlier Meno and
as an update (`/S /UPDATE`), and uninstalled.

## The Mac

The workflow builds Meno for Apple silicon only. Meno carries no `uv`: it
fetches the build pinned for the computer it runs on (`src-tauri/src/tools.rs`),
so an Intel build would need only its own runner.

It is signed **ad hoc** (`signingIdentity: "-"`, in the job's arguments),
the whole bundle, and not with Apple's Developer ID, which the project has
not taken up. Without that the bundle would carry only the linker's
signature on its executable, and macOS would not open a Meno downloaded
that way at all ("“Meno” is damaged and can't be opened"), short of
clearing its quarantine in a terminal.

Signed ad hoc, as seen on macOS 26 (with a local update standing in for
a release's):

- **The first time**, macOS will not open it: "“Meno” Not Opened - Apple
  could not verify “Meno” is free of malware...", with *Done* and *Move to
  Trash*. Apple's way to let it through, since macOS 15 (a right-click ›
  Open no longer does it): drag Meno from the disk image into
  Applications and open it there, choose *Done*, then in System Settings ›
  Privacy & Security choose *Open Anyway* for Meno, give the password
  asked for, and open it. Once is enough.
- **Updates** are not asked about: Meno downloads them itself, so macOS
  does not take them for something from the internet (the app put in
  place carries no quarantine). The app is replaced where it is as Meno
  quits, or restarts into it, and opens as before.
- **Where Meno cannot write** to the folder it is in - a user who is not
  an administrator, with Meno in Applications - macOS asks for an
  administrator's name and password as Meno quits with an update; cancelled,
  Meno stays as it was. Meno opened straight from the disk image cannot
  replace itself; nor, perhaps, one opened from Downloads without being
  moved first, which macOS may run from a read-only copy.
- An ad hoc signature changes with every build, so a permission macOS
  keeps for Meno (a protected folder, say) may be asked for again after an
  update. A Developer ID signature would keep them.

### Taking up Apple's signing

1. Join the Apple Developer Program (99 USD a year in 2026) and, as the
   account holder, make a *Developer ID Application* certificate; export
   it with its key as a `.p12`.
2. For notarization, make an App Store Connect API key (Users and Access ›
   Integrations), or an app-specific password for the Apple Account.
3. Add repository secrets for the job's `env`: `APPLE_CERTIFICATE` (the
   `.p12`, base64), `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD` (any,
   for the build's own keychain) and `APPLE_SIGNING_IDENTITY`; and
   `APPLE_API_ISSUER`, `APPLE_API_KEY` and the key file (written out for
   `APPLE_API_KEY_PATH`) - or `APPLE_ID`, `APPLE_PASSWORD` and
   `APPLE_TEAM_ID`.
4. Take `"macOS":{"signingIdentity":"-"}` out of the job's arguments.

`tauri build` then signs Meno with the certificate and has Apple notarize
it; macOS opens it without asking, and keeps its permissions across
updates. The `uv` inside is already signed and notarized by its makers.

## What an installed Meno does

- It looks only when the user has allowed it (the `app-update` purpose,
  asked once) and Meno is not offline; each connection is shown and
  recorded like any other (`docs/ARCHITECTURE.md`, The network).
- A newer version is downloaded in the background and checked against the
  public key; it is installed as Meno quits (on Windows, the NSIS
  installer, quietly; on a Mac, the app replaced where it is), or at once
  through a restart the user asks for. On Windows not while jobs wait or
  run: the installer ends every process of Meno.exe, the jobs' runners
  among them, so the update waits - the notice and Settings say for how
  many - and goes in at a quit with none, downloaded again after the next
  start.
- On Windows, the installer registers Meno's class for Office again (its
  `--register-ole` hook), so structures in documents keep opening in the
  Meno installed.
- On Windows, an installer over an earlier version leaves the files that
  version had and this one has not; its hook (`src-tauri/windows/hooks.nsh`)
  deletes those, each by name - since 0.1.8, the uv, RDKit lock and
  chemistry worker 0.1.6 and before carried; since 0.1.9, the Gaussian
  input plugin's files 0.1.7 carried (`resources\plugins\gaussian-input`,
  its folder too, once empty). **A release that stops carrying a file
  adds it there.** (A Mac's app is replaced whole.)
- On Windows, the installer it ran stays in the temporary folder
  (`%TEMP%\Meno-<version>-updater-…`, some 17 MB), since Meno has ended
  by then; the next Meno to start takes it away, once it is ten minutes
  old. A Mac leaves nothing behind: Meno itself unpacks the update and
  puts it in place, and the temporary folders it used go with it.
