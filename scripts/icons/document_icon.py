"""Makes the icon of a Meno workspace file (.meno) from its SVG sources.

    python3 scripts/icons/document_icon.py

The sources, in src-tauri/icons/document/, are Meno's own: a sheet with its
corner folded, carrying Meno's mark (the app icon's arc and dot, as
site/assets/favicon.svg draws it) - `meno-document.svg`, and
`meno-document-small.svg`, bolder, for 16 to 24 pixels. Each size is drawn
by the Tauri CLI's own `tauri icon` (`--png`), the macOS icon put together
by the system's `iconutil` (macOS only), and the Windows icon written
here: an ICO whose images are PNGs, as Windows Vista and later read them.
What it writes, beside the sources: `meno-document.icns` and
`meno-document.ico`.
"""

import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = ROOT / "src-tauri" / "icons" / "document"
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
    subprocess.run(["npx", "tauri", "icon", str(svg), "-o", str(into), "--png", ",".join(map(str, sizes))], cwd=ROOT, check=True, capture_output=True)
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


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        pngs = {**drawn(HERE / "meno-document-small.svg", SMALL, tmp / "small"), **drawn(HERE / "meno-document.svg", LARGE, tmp / "large")}
        (HERE / "meno-document.ico").write_bytes(ico({n: pngs[n] for n in ICO}))
        if sys.platform == "darwin":
            iconset = tmp / "meno-document.iconset"
            iconset.mkdir()
            for name, n in ICONSET.items():
                shutil.copy(pngs[n], iconset / name)
            subprocess.run(["/usr/bin/iconutil", "-c", "icns", str(iconset), "-o", str(HERE / "meno-document.icns")], check=True)
        else:
            print("not on macOS: meno-document.icns left as it is (iconutil is macOS's)")


if __name__ == "__main__":
    main()
