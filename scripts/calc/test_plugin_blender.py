"""Tests for the Blender plugin's worker (src-tauri/resources/plugins/blender/worker.py).

The worker needs Python alone - Blender is run by Meno, not by it - so
these run anywhere; CI runs them:

    python3 -m unittest scripts/calc/test_plugin_blender.py

What Blender is given is checked against Blender's own manual
(docs.blender.org, Blender 5.2, "Command Line Arguments"). Where Blender is
installed - BLENDER names it, or it is where macOS usually has it - the
render script is run too, on a scene of one ball, and what it made looked
at; elsewhere that test is skipped.
"""

import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
FOLDER = ROOT / "src-tauri/resources/plugins/blender"
spec = importlib.util.spec_from_file_location("plugin_blender", FOLDER / "worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

SCENE = {"scene": "scene.gltf", "film": False, "width": 320, "height": 240, "frames": 1, "fps": 1}


def ask(op, **m):
    said = worker.answer(json.dumps({"id": 1, "op": op, **m}))
    return said


class Prepare(unittest.TestCase):
    def test_runs_blender_in_the_background_with_its_script_and_settings(self):
        said = ask("prepare", step="render", entries=[SCENE], options={}, cores=4)
        self.assertTrue(said["ok"], said)
        [job] = said["result"]["jobs"]
        self.assertEqual(job["program"], "blender")
        self.assertEqual(job["entries"], [0])
        args = job["args"]
        # (as Blender's manual has them: in the background, its factory settings, no sound, no network, the threads given, the script, then its settings after --)
        self.assertEqual(args[:4], ["-b", "--factory-startup", "-noaudio", "--offline-mode"])
        self.assertEqual(args[args.index("-t") + 1], "4")
        self.assertEqual(args[args.index("--python-exit-code") + 1], "1")
        self.assertLess(args.index("-P"), args.index("--"))
        self.assertEqual(args[args.index("-P") + 1], "render.py")
        self.assertEqual(args[-2:], ["--", "render.json"])
        files = {f["name"]: f["text"] for f in job["files"]}
        self.assertEqual(files["render.py"], (FOLDER / "render.py").read_text(encoding="utf-8"))
        settings = json.loads(files["render.json"])
        self.assertEqual(settings["out"], "picture.png")
        self.assertEqual((settings["width"], settings["height"], settings["engine"], settings["samples"]), (320, 240, "cycles", 128))
        self.assertEqual(job["reads"], [])

    def test_the_looks_shading_and_outlines_are_written_as_settings_from_the_entry(self):
        entry = {**SCENE, "shading": "toon", "band": 0.3, "outlines": "mixed", "outline": 4, "outline_colour": "white"}
        said = ask("prepare", step="render", entries=[entry], options={})
        settings = json.loads({f["name"]: f["text"] for f in said["result"]["jobs"][0]["files"]}["render.json"])
        self.assertEqual((settings["shading"], settings["band"], settings["outlines"], settings["outline"], settings["outline_colour"]), ("toon", 0.3, "mixed", 4, "white"))
        # (lit and not outlined, as before, where the entry says nothing)
        plain = ask("prepare", step="render", entries=[SCENE], options={})
        plain = json.loads({f["name"]: f["text"] for f in plain["result"]["jobs"][0]["files"]}["render.json"])
        self.assertEqual((plain["shading"], plain["outlines"]), ("lit", "none"))

    def test_declares_the_looks_it_makes(self):
        m = json.loads((FOLDER / "manifest.json").read_text(encoding="utf-8"))
        looks = m["roles"][0]["looks"]
        self.assertIn("cartoon", looks)
        self.assertIn("meno", looks)

    def test_a_film_is_written_as_one(self):
        said = ask("prepare", step="render", entries=[{**SCENE, "film": True, "frames": 240, "fps": 30}], options={"quality": "lossless", "background": "black"})
        settings = json.loads({f["name"]: f["text"] for f in said["result"]["jobs"][0]["files"]}["render.json"])
        self.assertEqual((settings["out"], settings["frames"], settings["fps"], settings["quality"], settings["background"]), ("film.mp4", 240, 30, "lossless", "black"))

    def test_refuses_what_it_cannot_do(self):
        for entry, options in [
            ({**SCENE, "scene": "../scene.gltf"}, {}),
            ({**SCENE, "scene": "scene.blend"}, {}),
            ({**SCENE, "width": 0}, {}),
            ({**SCENE, "width": 100000}, {}),
            ({**SCENE, "frames": 2.5}, {}),
            (SCENE, {"engine": "workbench"}),
            (SCENE, {"samples": 0}),
            (SCENE, {"background": "#ff0000"}),
            (SCENE, {"denoise": "yes"}),
            (SCENE, {"key": float("nan")}),
            (SCENE, {"softness": 120}),
            ({**SCENE, "shading": "sketch"}, {}),
            ({**SCENE, "outlines": "dotted"}, {}),
            ({**SCENE, "outline": 0}, {}),
            ({**SCENE, "outline": 50}, {}),
            ({**SCENE, "band": 0}, {}),
            ({**SCENE, "outline_colour": "#000000"}, {}),
        ]:
            said = ask("prepare", step="render", entries=[entry], options=options)
            self.assertFalse(said["ok"], (entry, options))
            self.assertTrue(said["error"].startswith("Blender: "))
        self.assertFalse(ask("prepare", step="optimise", entries=[SCENE], options={})["ok"])
        self.assertFalse(ask("prepare", step="render", entries=[], options={})["ok"])


class Collect(unittest.TestCase):
    def test_says_what_it_made(self):
        said = ask("collect", step="render", entries=[SCENE, {**SCENE, "film": True}], options={}, files={}, log="", ended="done")
        self.assertEqual(said["result"], {"made": [
            {"entry": 0, "file": "picture.png", "media": "image/png"},
            {"entry": 1, "file": "film.mp4", "media": "video/mp4"},
        ]})

    def test_says_why_it_failed(self):
        log = "Blender 5.2.2\nRead blend\nError: Python: Traceback ...\nrender.py: the scene has no camera\nBlender quit\n"
        said = ask("collect", step="render", entries=[SCENE], options={}, files={}, log=log, ended="failed")
        self.assertEqual(said["result"], {"why": "render.py: the scene has no camera"})


class Manifest(unittest.TestCase):
    def test_says_its_licence_and_carries_its_text(self):
        m = json.loads((FOLDER / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(m["licence"], "GPL-3.0-or-later")
        self.assertIn("GNU GENERAL PUBLIC LICENSE", (FOLDER / "LICENSE").read_text(encoding="utf-8"))
        self.assertIn("Version 3", (FOLDER / "LICENSE").read_text(encoding="utf-8"))
        for f in ("worker.py", "render.py"):
            self.assertTrue((FOLDER / f).read_text(encoding="utf-8").startswith("# SPDX-License-Identifier: GPL-3.0-or-later"), f)
        # (the options it declares: each id the worker reads)
        ids = {o["id"] for o in m["roles"][0]["options"]}
        self.assertEqual(ids, {"engine", "samples", "denoise", "gpu", "background", "colours", "key", "ambient", "softness", "quality"})


def blender():
    named = os.environ.get("BLENDER")
    for p in [named, "/Applications/Blender.app/Contents/MacOS/Blender", os.path.expanduser("~/Applications/Blender.app/Contents/MacOS/Blender"), shutil.which("blender")]:
        if p and os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


# one white ball before an orthographic camera, lit by a sun: glTF 2.0, written by hand
BALL = {
    "asset": {"version": "2.0"},
    "extensionsUsed": ["KHR_lights_punctual"],
    "scene": 0,
    "scenes": [{"nodes": [0, 1, 2], "extras": {"meno": {"ambientLight": 0.9}}}],
    "nodes": [
        {"mesh": 0},
        {"camera": 0, "translation": [0, 0, 5]},
        {"extensions": {"KHR_lights_punctual": {"light": 0}}, "rotation": [-0.3647052, 0.2798481, 0.1159169, 0.8804762]},
    ],
    "cameras": [{"type": "orthographic", "orthographic": {"xmag": 2, "ymag": 1.5, "znear": 0.01, "zfar": 10}}],
    "extensions": {"KHR_lights_punctual": {"lights": [{"type": "directional", "intensity": 1}]}},
    "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [0.8, 0.8, 0.8, 1], "metallicFactor": 0, "roughnessFactor": 1}}],
}


def ball_mesh():
    """A coarse sphere of radius 1, its buffer embedded."""
    import base64
    import math
    import struct
    rings, around = 8, 16
    pos = []
    for r in range(rings + 1):
        t = math.pi * r / rings
        for a in range(around + 1):
            p = 2 * math.pi * a / around
            pos += [math.sin(t) * math.cos(p), math.cos(t), -math.sin(t) * math.sin(p)]
    idx = []
    row = around + 1
    for r in range(rings):
        for a in range(around):
            q = r * row + a
            idx += [q, q + row, q + 1, q + 1, q + row, q + row + 1]
    data = struct.pack(f"<{len(pos)}f", *pos) + struct.pack(f"<{len(idx)}H", *idx)
    n = len(pos) // 3
    return {
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 0}, "indices": 1, "material": 0}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": n, "type": "VEC3", "min": [-1, -1, -1], "max": [1, 1, 1]},
            {"bufferView": 1, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
        ],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 4 * len(pos)}, {"buffer": 0, "byteOffset": 4 * len(pos), "byteLength": 2 * len(idx)}],
        "buffers": [{"byteLength": len(data), "uri": "data:application/octet-stream;base64," + base64.b64encode(data).decode()}],
    }


@unittest.skipUnless(blender(), "Blender is not installed here")
class Renders(unittest.TestCase):
    def test_renders_a_picture_on_white(self):
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / "scene.gltf").write_text(json.dumps({**BALL, **ball_mesh()}), encoding="utf-8")
            said = ask("prepare", step="render", entries=[SCENE], options={"samples": 4, "background": "white", "gpu": False})
            job = said["result"]["jobs"][0]
            for f in job["files"]:
                (pathlib.Path(d) / f["name"]).write_text(f["text"], encoding="utf-8")
            run = subprocess.run([blender(), *job["args"]], cwd=d, capture_output=True, text=True, timeout=600)
            self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
            self.assertIn("progress 1/1", run.stdout)
            png = (pathlib.Path(d) / "picture.png").read_bytes()
            self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
            # (its size: the PNG's header, width and height)
            self.assertEqual((int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")), (320, 240))


    def test_the_cartoon_look_outlines_a_ball_and_lights_it_in_one_band(self):
        # (white background; a ball of the base colour red, lit by Meno's key light: pixels of its outline are black, its lit part flat red, the rest of the ball darker)
        with tempfile.TemporaryDirectory() as d:
            scene = {**BALL, **ball_mesh()}
            scene["materials"] = [{"pbrMetallicRoughness": {"baseColorFactor": [1, 0, 0, 1], "metallicFactor": 0, "roughnessFactor": 1}}]
            (pathlib.Path(d) / "scene.gltf").write_text(json.dumps(scene), encoding="utf-8")
            entry = {**SCENE, "shading": "toon", "outlines": "mixed", "outline": 4}
            said = ask("prepare", step="render", entries=[entry], options={"samples": 4, "background": "white", "gpu": False})
            job = said["result"]["jobs"][0]
            for f in job["files"]:
                (pathlib.Path(d) / f["name"]).write_text(f["text"], encoding="utf-8")
            run = subprocess.run([blender(), *job["args"]], cwd=d, capture_output=True, text=True, timeout=600)
            self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
            png = (pathlib.Path(d) / "picture.png").read_bytes()
            width, height = int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")
            row = [png_pixel(png, x, height // 2) for x in range(width)]
            black = [p for p in row if max(p[:3]) < 40]
            self.assertTrue(black, "no outline pixel on the middle row")
            # (a ball of one colour in few bands: three colours - the white behind, the outline's black, the red's one band - make up
            # nearly the whole row, but for the edges' anti-aliasing)
            from collections import Counter
            top = sum(n for _, n in Counter(tuple(p[:3]) for p in row).most_common(3))
            self.assertGreater(top, 0.8 * width)

    def test_colours_a_surface_by_its_points_colours(self):
        # (a ball each of whose points is red, over a white material: COLOR_0 multiplies the base colour - glTF 3.9.2)
        import base64
        import struct
        mesh = ball_mesh()
        n = mesh["accessors"][0]["count"]
        red = struct.pack(f"<{4 * n}f", *([1.0, 0.0, 0.0, 1.0] * n))
        data = base64.b64decode(mesh["buffers"][0]["uri"].split(",", 1)[1]) + red
        mesh["buffers"][0] = {"byteLength": len(data), "uri": "data:application/octet-stream;base64," + base64.b64encode(data).decode()}
        mesh["bufferViews"].append({"buffer": 0, "byteOffset": len(data) - len(red), "byteLength": len(red)})
        mesh["accessors"].append({"bufferView": 2, "componentType": 5126, "count": n, "type": "VEC4"})
        mesh["meshes"][0]["primitives"][0]["attributes"]["COLOR_0"] = 2
        scene = {**BALL, **mesh, "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 1}}]}
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / "scene.gltf").write_text(json.dumps(scene), encoding="utf-8")
            said = ask("prepare", step="render", entries=[SCENE], options={"samples": 4, "background": "white", "gpu": False, "engine": "eevee"})
            job = said["result"]["jobs"][0]
            for f in job["files"]:
                (pathlib.Path(d) / f["name"]).write_text(f["text"], encoding="utf-8")
            run = subprocess.run([blender(), *job["args"]], cwd=d, capture_output=True, text=True, timeout=600)
            self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
            r, g, b = png_pixel((pathlib.Path(d) / "picture.png").read_bytes(), 160, 120)
            self.assertGreater(r, 2 * max(g, b), (r, g, b))


def png_pixel(png, x, y):
    """A pixel of an 8-bit RGB or RGBA PNG, as its specification lays one out (W3C PNG, 2nd ed.: IHDR, IDAT, filters 0-4)."""
    import zlib
    at, idat, width, height, kind = 8, b"", 0, 0, 0
    while at < len(png):
        length = int.from_bytes(png[at : at + 4], "big")
        tag, body = png[at + 4 : at + 8], png[at + 8 : at + 8 + length]
        if tag == b"IHDR":
            width, height, depth, kind = int.from_bytes(body[0:4], "big"), int.from_bytes(body[4:8], "big"), body[8], body[9]
            assert depth == 8 and kind in (2, 6), (depth, kind)
        elif tag == b"IDAT":
            idat += body
        at += 12 + length
    raw = zlib.decompress(idat)
    step = 3 if kind == 2 else 4
    stride = width * step
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(height):
        f, line = raw[i], bytearray(raw[i + 1 : i + 1 + stride])
        i += 1 + stride
        for k in range(stride):
            a = line[k - step] if k >= step else 0
            b, c = prev[k], (prev[k - step] if k >= step else 0)
            if f == 1:
                line[k] = (line[k] + a) & 255
            elif f == 2:
                line[k] = (line[k] + b) & 255
            elif f == 3:
                line[k] = (line[k] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[k] = (line[k] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    p = rows[y][x * step : x * step + 3]
    return p[0], p[1], p[2]


if __name__ == "__main__":
    unittest.main()
