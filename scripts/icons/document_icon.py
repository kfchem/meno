"""Makes the icons of the files Meno opens from their SVG sources.

    python3 scripts/icons/document_icon.py

A Meno workspace file's (.meno), in src-tauri/icons/document/: a sheet with
its corner folded, carrying Meno's mark (the app icon's arc and dot, as
site/assets/favicon.svg draws it) - `meno-document.svg`, and
`meno-document-small.svg`, bolder, for 16 to 32 pixels. And each format Meno
can be made the default app for (src-tauri/src/opened.rs, OPENED_WITH), in
src-tauri/icons/formats/: Meno's sheet and mark with the format's short name
on a band, which overhangs the sheet's sides by the same share of the sheet's
width in both (about 6%: never ending just short of them) - `<name>.svg` and
`<name>-small.svg`, their words drawn as
outlines first (scripts/icons/outline_text.swift), so they are drawn the
same wherever this runs. Each size is drawn by the Tauri CLI's own `tauri
icon` (`--png`), the macOS icon put together by the system's `iconutil`
(macOS only), and the Windows icon written here: an ICO whose images are
PNGs, as Windows Vista and later read them. What it writes, beside the
sources: `<name>.icns` and `<name>.ico`.
"""

import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
DOCUMENT = ROOT / "src-tauri" / "icons" / "document"
FORMATS = ROOT / "src-tauri" / "icons" / "formats"
SMALL = (16, 24, 32)
LARGE = (48, 64, 128, 256, 512, 1024)
# the sizes a macOS iconset holds, by its file names
ICONSET = {
    "icon_16x16.png": 16, "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32, "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128, "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256, "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512, "icon_512x512@2x.png": 1024,
}
# the sizes the Windows icon holds
ICO = (16, 24, 32, 48, 64, 128, 256)


def drawn(svg, sizes, into):
    """Each size of `svg` drawn as a PNG in `into` by `tauri icon`: its path, by size."""
    subprocess.run(["npx", "--no-install", "tauri", "icon", str(svg), "-o", str(into), "--png", ",".join(map(str, sizes))], cwd=ROOT, check=True, capture_output=True)
    return {n: into / f"{n}x{n}.png" for n in sizes}


def ico(pngs):
    """An ICO file of PNG images (ICONDIR, then an ICONDIRENTRY for each, then the PNGs)."""
    sizes = sorted(pngs)
    head = struct.pack("<HHH", 0, 1, len(sizes))
    offset = 6 + 16 * len(sizes)
    entries, data = b"", b""
    for n in sizes:
        png = pngs[n].read_bytes()
        # (a width or height of 256 is written as 0)
        entries += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(png), offset + len(data))
        data += png
    return head + entries + data


def made(here, name, tmp):
    """`<name>.ico` and, on macOS, `<name>.icns` in `here`, from `<name>-small.svg` and `<name>.svg` there."""
    tmp = tmp / name
    pngs = {**drawn(here / f"{name}-small.svg", SMALL, tmp / "small"), **drawn(here / f"{name}.svg", LARGE, tmp / "large")}
    (here / f"{name}.ico").write_bytes(ico({n: pngs[n] for n in ICO}))
    if sys.platform == "darwin":
        iconset = tmp / f"{name}.iconset"
        iconset.mkdir()
        for file, n in ICONSET.items():
            shutil.copy(pngs[n], iconset / file)
        subprocess.run(["/usr/bin/iconutil", "-c", "icns", str(iconset), "-o", str(here / f"{name}.icns")], check=True)
    else:
        print(f"not on macOS: {name}.icns left as it is (iconutil is macOS's)")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        made(DOCUMENT, "meno-document", tmp)
        for svg in sorted(FORMATS.glob("*.svg")):
            if not svg.stem.endswith("-small"):
                made(FORMATS, svg.stem, tmp)


if __name__ == "__main__":
    main()
