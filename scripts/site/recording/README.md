# Recording the website's pictures

The kit that made the website's first picture (`site/frames/hero.avif`) and the story's five films (`site/frames/<chapter>.mp4`, `<chapter>-s.mp4`, `<chapter>.avif`). Every picture is taken from Meno itself: the GUI harness drives the app, and a window recorder captures it.

The scenarios' clicks were measured on Meno as built from main on 2026-10-10, in a 1280x800 window on a 2x display. Since then the menus, the workflow look and other parts of the app have changed, so expect to measure the clicks again before the films can be redone.

## What is here

| Path | What it is |
| --- | --- |
| `scenarios/scratch-l10-page.ps1` | Builds the page of natural products. A rough paclitaxel is cleaned up among six others (strychnine, morphine, quinine, artemisinin, epothilone B, PGF2alpha); the page is saved to `$env:L10_SAVE`. |
| `scenarios/scratch-l10-hero.ps1` | Builds the first picture: cholesterol drawn, then its 3D structure, both fitted to the window. |
| `scenarios/scratch-l10-rec13.ps1` | Records chapters 1-3 in one take: draw a chain with OH, step back to the page, go into paclitaxel, raise it into 3D and turn it, go closer and run along its conformers. |
| `scenarios/scratch-l10-rec4.ps1` | Records chapter 4: paclitaxel alone; three steps wired out of it (Conformers, Choose one, Optimise); run, then fit. |
| `scenarios/scratch-l10-rec5.ps1` | Records chapter 5: the sample paper read in its column, its figure taken out onto the page. |
| `work/page2.meno`, `work/page.meno` | The pages the recordings opened: `page2.meno` for chapters 1-3, `page.meno` (an earlier layout of the same page) for chapter 5. |
| `paper/taxol-paper.html` | The sample paper's source. It was written for the website, and its first line says so. |
| `SOURCES.md` | Where each structure's SMILES comes from. |
| `tools/winrec.swift` | Records Meno's window as numbered JPEG frames with ScreenCaptureKit. It writes `frames.csv` (frame and time), and stops on time or when `STOP` appears in its folder. |
| `tools/cut.py` | Picks the frames between two of a scenario's marks (`marks.csv`), optionally skipping some stretches. |
| `tools/framekit.swift` | Thins stills to a short hold, then thins the rest evenly. With `FRAMEKIT_LIST_ONLY=1` it writes only the list (`chosen.txt`); otherwise it writes AVIF stills, which is how the posters and the first picture are made. |
| `tools/thin.py` | Thins a list evenly to at most N frames. |
| `tools/framevid.swift` | Encodes a list of frames as H.264 MP4 for seeking by scroll, with a keyframe every N frames. |
| `tools/imgdiff.swift` | Counts the pixels that differ between two screenshots. The recording scenarios use it to check that the view is the measured one before they click. |
| `tools/psnr.swift` | Compares each frame of a film with its recorded source frame. `TOP=1` measures the title bar instead. |
| `tools/grab.swift` | Saves JPEG stills at fractions of a film's length, for looking at frames by eye. |
| `tools/rangeserver.py` | A static server that answers Range requests, as GitHub Pages does. Python's `http.server` does not, and without Range requests the films cannot seek. |
| `tools/cdp.mjs` | Drives headless Chrome over CDP through the story and reports each film's state. A hidden browser pane runs no animation frames, so it cannot test the page. |
| `tools/gui.sh` | Runs one harness scenario at 1280x800 under the shared GUI lock (`~/.meno-gui.lock`), with `settings.json` backed up first. |
| `tools/build.sh` | Compiles the Swift tools into `$MENO_REC/bin`. |

## What it needs

- A Mac with Xcode's command line tools (`swiftc`), PowerShell (`pwsh`), Node 22 and Google Chrome (or set `CHROME` to another Chromium).
- The GUI harness set up as `scripts/gui` describes. `winrec` runs under the same process, so that process needs Screen Recording permission.
- Meno built from main, with the RDKit and xTB plugins added (chapters 2-4 use them).

## Making the pictures again

All output goes to `$MENO_REC`, a folder outside the repository: the recordings come to about 1 GB.

```bash
export MENO_REC=~/meno-rec
scripts/site/recording/tools/build.sh
cp scripts/site/recording/scenarios/*.ps1 scripts/gui/scenarios/
```

Remove the copies from `scripts/gui/scenarios/` when you are done.

### 1. The sample paper

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer --print-to-pdf=$MENO_REC/taxol-sample-paper.pdf "file://$PWD/scripts/site/recording/paper/taxol-paper.html"
```

### 2. The pages (only if `work/*.meno` no longer open)

Meno keeps no compatibility with older saved files, so a later Meno may not open them. In that case, make the page again and save it over both. Then check chapter 5's clicks, because they were measured on the earlier layout.

```bash
L10_SAVE=$PWD/scripts/site/recording/work/page2.meno scripts/site/recording/tools/gui.sh scratch-l10-page $MENO_REC/runs/page
```

### 3. The recordings

```bash
G=scripts/site/recording/tools/gui.sh
$G scratch-l10-rec13 $MENO_REC/runs/rec13
$G scratch-l10-rec4 $MENO_REC/runs/rec4
$G scratch-l10-rec5 $MENO_REC/runs/rec5
```

- **Output:** each take writes `$MENO_REC/r13`, `r4` or `r5`, containing the frames (`00001.jpg`...), `frames.csv` and `marks.csv`.
- **Measuring the view:**
  - The first run of rec13 and rec4 saves its view as `$MENO_REC/ref-*-body.png`.
  - Look at that run's screenshots (`runs/<take>/`) and check that the clicks land where they should.
  - Later runs stop before clicking if their view differs from it.
- **Wheel zoom:** it is only reproducible with 1.5 s or more between notches and swipes, because a wheel within 250 ms of a swipe continues it as a pan. The scenarios keep that spacing.
- **Recording indicator:** macOS draws one where the window's buttons are. `framekit` and `framevid` paste the window's real title-bar corner, and its rounded corners, from a harness screenshot (`REF` below).
- **Quick Add:** `Add-L10Smiles` in the page and hero scenarios places it as the app does low on the canvas, clamped by its tallest panel (268.5 CSS px when measured). Measure this again if Quick Add changes.

### 4. Frame lists for each chapter

The cut points are the takes' marks. The published films used these frame numbers from the 2026-10-10 takes; with new takes, use the marks:

| Chapter | Frames | Published as |
| --- | --- | --- |
| draw | `cut.py $MENO_REC/r13 draw 3d` | frames 41-660 |
| 3d | `cut.py $MENO_REC/r13 3d closer` | frames 679-1305 |
| conformers | `cut.py $MENO_REC/r13 closer end` | frames 1305-1682 |
| calculate | `cut.py $MENO_REC/r4 select end panel1,placed1 panel2,placed2 panel3,placed3` | Quick Add's lists of plugins are cut out; framekit is run with `FRAMEKIT_MOVED=12` |
| read | `cut.py $MENO_REC/r5 START end` | |

```bash
T=scripts/site/recording/tools; B=$MENO_REC/bin; REF=$MENO_REC/runs/rec13/01-empty.png
mkdir -p $MENO_REC/L/draw
FRAMEKIT_LIST_ONLY=1 $B/framekit $REF $MENO_REC/L/draw 1280 0.5 240 $(python3 $T/cut.py $MENO_REC/r13 draw 3d)
python3 $T/thin.py $MENO_REC/L/draw/chosen.txt 160 > $MENO_REC/L/draw/c160.txt
```

### 5. Films, posters and the first picture

The arguments are: out, width, bit/s, keyframe interval, fps, REF and frames. Each film gets its full cut and its phone cut:

```bash
$B/framevid site/frames/draw.mp4 1280 1100000 15 30 $REF $(cat $MENO_REC/L/draw/c160.txt)
$B/framevid site/frames/draw-s.mp4 960 800000 15 30 $REF $(cat $MENO_REC/L/draw/c160.txt)
```

| Film | 1280x800 | Phone cut, 960x600 |
| --- | --- | --- |
| draw, 3d, calculate | 1100000 | 800000 |
| conformers | 1600000 | 1200000 |
| read | 2200000 | 1600000 |

The conformers and read films need more bit/s because there the whole picture moves at once. With less, the encoder blurs the tab's name and smears the paper's lines.

Each poster is the film's first frame, and the first picture is the hero run's fitted view:

```bash
FRAMEKIT_MOVED=999999 $B/framekit $REF $MENO_REC/P/draw 1280 0.6 1 $(head -1 $MENO_REC/L/draw/chosen.txt) && cp $MENO_REC/P/draw/001.avif site/frames/draw.avif
$T/gui.sh scratch-l10-hero $MENO_REC/runs/hero
H=$MENO_REC/runs/hero/03-both.png; FRAMEKIT_MOVED=999999 $B/framekit $H $MENO_REC/P/hero 1600 0.7 1 $H && cp $MENO_REC/P/hero/001.avif site/frames/hero.avif
```

### 6. Checks

- `$B/psnr site/frames/conformers.mp4 $MENO_REC/L/conformers/c160.txt` gives the mean and the worst frames.
  - The published films measure 39-48 dB on average.
  - Where blur was visible, raising the bitrate to about 40 dB removed it.
  - Look at the worst frames by eye: `$B/grab <film> <prefix> <fraction>...`.
- `python3 $T/rangeserver.py <built site> 4813`, then `node $T/cdp.mjs http://127.0.0.1:4813/ <out dir> 1280 800 0` (and `390 844 0` for a phone, `1280 800 1` for dark). This checks that each chapter's film loads and follows the scroll.
- `node scripts/site/release.mjs site <built site>` makes the built site, as the Pages workflow does.
