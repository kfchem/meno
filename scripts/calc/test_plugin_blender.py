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
import math
import re
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
        decls = m["roles"][0]["looks"]
        looks = [l["id"] for l in decls]
        # (each declared in full: a label, a description, and parts or "own"; the canvas's look is Meno's, not declared)
        self.assertNotIn("meno", looks)
        self.assertEqual(len(set(looks)), len(looks))
        for l in decls:
            self.assertTrue(l["label"] and l["description"], l["id"])
            self.assertTrue(l.get("own") or l.get("parts"), l["id"])
        self.assertIn("cartoon", looks)
        for own in ("gold", "silver", "copper", "bubble", "wood", "marble", "clay", "porcelain", "slime", "neon", "xray", "fur"):
            self.assertIn(own, looks)
            self.assertIn(own, worker.LOOKS)

    def test_a_look_with_materials_of_its_own_carries_looks_py_and_its_choices(self):
        entry = {**SCENE, "look": "wood"}
        said = ask("prepare", step="render", entries=[entry], options={"wood": "cherry", "silver-finish": "satin", "marble": "swirl"})
        files = {f["name"]: f["text"] for f in said["result"]["jobs"][0]["files"]}
        self.assertIn("looks.py", files)
        settings = json.loads(files["render.json"])
        self.assertEqual((settings["look"], settings["wood"], settings["silver_finish"], settings["marble"]), ("wood", "cherry", "satin", "swirl"))
        refused = ask("prepare", step="render", entries=[{**SCENE, "look": "chrome"}], options={})
        self.assertFalse(refused["ok"])

    def test_a_film_is_written_as_one(self):
        said = ask("prepare", step="render", entries=[{**SCENE, "film": True, "frames": 240, "fps": 30}], options={"quality": "lossless", "background": "black"})
        settings = json.loads({f["name"]: f["text"] for f in said["result"]["jobs"][0]["files"]}["render.json"])
        self.assertEqual((settings["out"], settings["frames"], settings["fps"], settings["quality"], settings["background"]), ("film.mp4", 240, 30, "lossless", "black"))

    def test_the_data_folder_the_worker_runs_from_goes_to_the_job_for_what_is_kept(self):
        import types
        fake = types.SimpleNamespace(prefix="/somewhere/uv/plugin-blender/venv")
        real = worker.sys
        try:
            worker.sys = fake
            home = worker.plugin_home()
        finally:
            worker.sys = real
        # (only where that folder exists: a path that is not there gives none)
        self.assertIsNone(home)
        with tempfile.TemporaryDirectory() as d:
            venv = os.path.join(d, "plugin-blender", "venv")
            os.makedirs(venv)
            try:
                worker.sys = types.SimpleNamespace(prefix=venv)
                self.assertEqual(worker.plugin_home(), os.path.join(d, "plugin-blender"))
                said = ask("prepare", step="render", entries=[SCENE], options={})
            finally:
                worker.sys = real
            settings = json.loads({f["name"]: f["text"] for f in said["result"]["jobs"][0]["files"]}["render.json"])
            self.assertEqual(settings["probe_dir"], os.path.join(d, "plugin-blender"))

    def test_the_device_is_a_three_way_choice_automatic_by_default(self):
        m = json.loads((FOLDER / "manifest.json").read_text(encoding="utf-8"))
        device = next(o for o in m["roles"][0]["options"] if o["id"] == "device")
        self.assertEqual([c["value"] for c in device["choices"]], ["auto", "gpu", "cpu"])
        self.assertEqual(device["default"], "auto")
        for chosen in ("auto", "gpu", "cpu"):
            said = ask("prepare", step="render", entries=[SCENE], options={"device": chosen})
            settings = json.loads({f["name"]: f["text"] for f in said["result"]["jobs"][0]["files"]}["render.json"])
            self.assertEqual(settings["device"], chosen)
        none = ask("prepare", step="render", entries=[SCENE], options={})
        self.assertEqual(json.loads({f["name"]: f["text"] for f in none["result"]["jobs"][0]["files"]}["render.json"])["device"], "auto")
        self.assertFalse(ask("prepare", step="render", entries=[SCENE], options={"device": "tpu"})["ok"])

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


class Withdrawn(unittest.TestCase):
    """The liquid change and the ice look, withdrawn for now (docs/RENDER.md, *Decided*): no longer offered, and an ask for
    either - a step saved with it, say - is refused, saying so."""

    def test_neither_is_offered(self):
        m = json.loads((FOLDER / "manifest.json").read_text(encoding="utf-8"))
        self.assertNotIn("ice", [x["id"] for x in m["roles"][0]["looks"]])
        self.assertNotIn("change-liquid", [x["id"] for x in m["roles"][0]["motions"]])
        self.assertFalse((FOLDER / "motion_change_liquid.py").exists())

    def test_an_ask_for_either_is_refused(self):
        said = ask("prepare", step="render", entries=[{**SCENE, "look": "ice"}], options={})
        self.assertEqual((said["ok"], said["error"]), (False, "Blender: no look is called 'ice'."))
        said = ask("prepare", step="render", entries=[{**SCENE, "film": True, "frames": 60, "fps": 30, "motion": "change-liquid"}], options={})
        self.assertEqual((said["ok"], said["error"]), (False, "Blender: no motion is called 'change-liquid'."))


class Collect(unittest.TestCase):
    def test_says_what_it_made(self):
        said = ask("collect", step="render", entries=[SCENE, {**SCENE, "film": True}], options={}, files={}, log="", ended="done")
        self.assertEqual(said["result"], {"made": [
            {"entry": 0, "file": "picture.png", "media": "image/png"},
            {"entry": 1, "file": "film.mp4", "media": "video/mp4"},
        ]})

    def test_says_it_rendered_on_the_processor_only_where_the_graphics_processor_was_asked_for_and_not_found(self):
        fell = "Rendering on the processor (no graphics processor Blender can use)\nprogress 100/100\n"
        said = ask("collect", step="render", entries=[SCENE], options={}, files={}, log=fell, ended="done")
        self.assertEqual(said["result"]["note"], "Rendered on the processor")
        for log in ("Rendering on the graphics processor\n", "Rendering on the processor\n", ""):
            said = ask("collect", step="render", entries=[SCENE], options={}, files={}, log=log, ended="done")
            self.assertNotIn("note", said["result"])

    def test_says_why_it_failed(self):
        log = "Blender 5.2.2\nRead blend\nError: Python: Traceback ...\nrender.py: the scene has no camera\nBlender quit\n"
        said = ask("collect", step="render", entries=[SCENE], options={}, files={}, log=log, ended="failed")
        self.assertEqual(said["result"], {"why": "The scene has no camera"})

    def test_says_what_python_raised_not_blenders_own_last_words(self):
        # (as Blender 5.2.2 ends a script that raised, and - after a large render - what it did not free)
        tail = "Error: script failed, file: 'render.py', exiting.\nBlender 5.2.2 LTS\n\nBlender quit\n"
        leak = "Error: Not freed memory blocks: 21897, total unfreed memory 8815.848637 MB\n"
        raised = "Traceback (most recent call last):\n  File \"motion_assemble.py\", line 12, in <module>\nTypeError: 'NoneType' object is not subscriptable\n"
        for log in (raised + tail, raised + tail + leak):
            said = ask("collect", step="render", entries=[SCENE], options={}, files={}, log=log, ended="failed")
            self.assertEqual(said["result"], {"why": "TypeError: 'NoneType' object is not subscriptable"})
        # (a message of several lines, all of it, as one; an exception raised while another was handled, the last)
        many = "Traceback (most recent call last):\nKeyError: 'col'\n\nDuring handling of the above exception, another exception occurred:\n\nTraceback (most recent call last):\nValueError: the scene's molecule has no atoms\nsee its entry: entries[0]\n"
        said = ask("collect", step="render", entries=[SCENE], options={}, files={}, log=many + tail + leak, ended="failed")
        self.assertEqual(said["result"], {"why": "ValueError: the scene's molecule has no atoms see its entry: entries[0]"})
        # (the desk's probe: Blender's progress after what was raised is not part of it)
        probe = ("Traceback (most recent call last):\nRuntimeError: a stand-in\n"
                 "Fra:1 Mem:120.5M (Peak 140.2M) | Time:00:01.20 | Rendering 1 / 128 samples\n"
                 "Saved: '/Users/someone/Meno/jobs/x/work/frames/frame_0001.png'\n"
                 "Time: 00:01.84 (Saving: 00:00.03)\n"
                 "03:30.912  render           | Saved: 'frame_0002.png'\n"
                 "Info: Saved \"frame_0002.png\"\nWarning: a stand-in\nprogress 4/100\nRendering on the processor\n")
        said = ask("collect", step="render", entries=[SCENE], options={}, files={}, log=probe + tail + leak, ended="failed")
        self.assertEqual(said["result"], {"why": "RuntimeError: a stand-in"})
        # (Blender's own error, where Python raised none: said; its last words alone, said as they are)
        said = ask("collect", step="render", entries=[SCENE], options={}, files={}, log="Error: Cannot read file 'scene.gltf'\n" + tail + leak, ended="failed")
        self.assertEqual(said["result"], {"why": "Error: Cannot read file 'scene.gltf'"})
        said = ask("collect", step="render", entries=[SCENE], options={}, files={}, log=tail.split("\n")[0], ended="failed")
        self.assertEqual(said["result"], {"why": "Error: script failed, file: 'render.py', exiting."})


class RenderScriptNames(unittest.TestCase):
    """render.py runs only in Blender, so a name it never defines fails only there, at the line that uses it - on a computer
    whose path through it no test here takes (a motion's film where no graphics processor can be used, say)."""

    def test_render_py_uses_no_name_it_never_defines(self):
        import ast
        import builtins
        tree = ast.parse((FOLDER / "render.py").read_text(encoding="utf-8"))
        defined = set(dir(builtins)) | {"__file__"}
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                defined.add(node.name)
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                defined |= {(a.asname or a.name).split(".")[0] for a in node.names}
            elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
                defined.add(node.id)
            elif isinstance(node, ast.arg):
                defined.add(node.arg)
            elif isinstance(node, ast.ExceptHandler) and node.name:
                defined.add(node.name)
        used = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}
        self.assertEqual(sorted(used - defined), [])

    def test_its_fallback_lines_are_those_the_worker_reads(self):
        src = (FOLDER / "render.py").read_text(encoding="utf-8")
        self.assertIn(f"FELL_BACK = {worker.FELL_BACK!r}".replace("'", '"'), src)
        self.assertIn(f"FASTER = {worker.FASTER!r}".replace("'", '"'), src)


class FilmStrips(unittest.TestCase):
    """How the frames a film plays become the sequencer's image strips (render.py `strip_runs`): a strip reads every file from
    its first file's folder, so each run from one folder is a strip of its own."""

    @classmethod
    def setUpClass(cls):
        import ast
        tree = ast.parse((FOLDER / "render.py").read_text(encoding="utf-8"))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "strip_runs")
        ns = {"os": os}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), "render.py", "exec"), ns)
        cls.runs = staticmethod(ns["strip_runs"])

    def test_every_film_frame_is_its_own_file_across_folders_of_the_same_names(self):
        # (a film of pieces from three folders holding the very same names, one of them played twice and reversed: piece 1
        # forward, piece 2, piece 3's backward, its forward from its second, piece 4, piece 5's backward)
        d = lambda name: os.path.join("job", "frames", name)
        f = lambda folder, n: os.path.join(d(folder), f"f_{n:04d}.png")
        frames = ([f("melt-01", n) for n in (1, 2, 3)] + [f("reform-01", n) for n in (1, 2)] + [f("melt-02", n) for n in (3, 2, 1)]
                  + [f("melt-02", n) for n in (2, 3)] + [f("reform-02", n) for n in (1, 2)] + [f("melt-03", n) for n in (3, 2, 1)])
        runs = self.runs(frames)
        # (each film frame, as its strip plays it: its strip's folder, the name at its place in the strip)
        played = []
        for folder, names, start in runs:
            self.assertEqual(start, len(played) + 1)
            played += [os.path.join(folder, name) for name in names]
        self.assertEqual(played, frames)
        # (one run for melt 2 played backward then forward: one folder, its names in the order played)
        self.assertEqual([(os.path.basename(r[0]), r[1]) for r in runs][2], ("melt-02", ["f_0003.png", "f_0002.png", "f_0001.png", "f_0002.png", "f_0003.png"]))
        self.assertEqual(len(runs), 5)

    def test_a_film_of_one_folder_is_one_strip(self):
        frames = [os.path.join("job", "frames", f"f_{n:04d}.png") for n in (1, 2, 3, 2)]
        self.assertEqual(self.runs(frames), [(os.path.join("job", "frames"), ["f_0001.png", "f_0002.png", "f_0003.png", "f_0002.png"], 1)])


class ProgressStatistics(unittest.TestCase):
    """Blender's own time taken and time remaining, read off a statistics line (render.py `Progress.clocks`): the bar's smoothing."""

    @classmethod
    def setUpClass(cls):
        import re as _re
        src = (FOLDER / "render.py").read_text(encoding="utf-8")
        start = src.index("CLOCK = ")
        end = src.index("class Progress:")
        ns = {"re": _re}
        exec(src[start:end], ns)  # the two patterns, as written
        cls.clock = ns["CLOCK"]

    def test_reads_the_time_taken_and_remaining(self):
        text = "Time: 00:00.80 | Remaining: 00:35.42 | Mem: 20.1M | Sample 1/128"
        found = {m.group(1): (int(m.group(2) or 0) * 60 + int(m.group(3))) * 60 + float(m.group(4)) for m in self.clock.finditer(text)}
        self.assertAlmostEqual(found["Time"], 0.8)
        self.assertAlmostEqual(found["Remaining"], 35.42)

    def test_a_line_with_remaining_alone_gives_no_taken_and_the_class_measures_it_itself(self):
        import re as _re
        import time as _time
        import threading as _threading
        src = (FOLDER / "render.py").read_text(encoding="utf-8")
        start = src.index("CLOCK = ")
        end = src.index("def render(scene, s, folder):")
        said = []
        ns = {"re": _re, "time": _time, "threading": _threading, "say": said.append}
        exec(src[start:end], ns)
        progress = ns["Progress"](1)
        # (statistics mid-render, as Blender 5.2.2 prints them on a graphics processor: Remaining, never Time)
        self.assertEqual(progress.clocks("Remaining: 00:41.13 | Mem: 254M | Sample 1/128"), (None, 41.13))
        progress.begin_frame()
        _time.sleep(0.3)
        progress.stats("Remaining: 00:41.13 | Mem: 254M | Sample 1/128")
        self.assertIsNotNone(progress.anchor)
        taken = progress.anchor[1]
        self.assertGreater(taken, 0.25)
        self.assertAlmostEqual(progress.anchor[2], taken + 41.13, places=1)
        # (and the ticker, between the lines, goes on by the clock, never back, never to the end)
        _time.sleep(1.2)
        progress.end()
        marks = [int(m.group(1)) for line in said for m in [_re.match(r"progress (\d+)/100", line)] if m]
        self.assertEqual(marks, sorted(marks))
        self.assertLess(max(marks or [0]), 100)

    def test_reads_hours(self):
        m = [m for m in self.clock.finditer("Remaining: 1:02:03.5")][0]
        self.assertEqual((m.group(2), m.group(3), m.group(4)), ("1", "02", "03.5"))


class Manifest(unittest.TestCase):
    def test_says_its_licence_and_carries_its_text(self):
        m = json.loads((FOLDER / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(m["licence"], "GPL-3.0-or-later")
        self.assertIn("GNU GENERAL PUBLIC LICENSE", (FOLDER / "LICENSE").read_text(encoding="utf-8"))
        self.assertIn("Version 3", (FOLDER / "LICENSE").read_text(encoding="utf-8"))
        for f in ("worker.py", "render.py", "looks.py"):
            self.assertTrue((FOLDER / f).read_text(encoding="utf-8").startswith("# SPDX-License-Identifier: GPL-3.0-or-later"), f)
        # (the options it declares: each id the worker reads)
        ids = {o["id"] for o in m["roles"][0]["options"]}
        self.assertEqual(ids, {"engine", "samples", "denoise", "device", "background", "colours", "key", "ambient", "softness", "quality", "silver-finish", "copper-finish", "wood", "marble", "pile", "clay-colour", "porcelain-finish", "mode"})

    def test_its_motions_are_the_worker_s_each_with_its_script(self):
        m = json.loads((FOLDER / "manifest.json").read_text(encoding="utf-8"))
        declared = [x["id"] for x in m["roles"][0]["motions"]]
        self.assertEqual(set(declared), worker.MOTIONS)
        for mid in declared:
            self.assertTrue((FOLDER / worker.motion_script(mid)).read_text(encoding="utf-8").startswith("# SPDX-License-Identifier: GPL-3.0-or-later"), mid)
        for shared in ("studio.py", "change.py"):
            self.assertTrue((FOLDER / shared).read_text(encoding="utf-8").startswith("# SPDX-License-Identifier: GPL-3.0-or-later"), shared)
        # (Once or Loop is shown for its motions, and only for them)
        mode = next(o for o in m["roles"][0]["options"] if o["id"] == "mode")
        self.assertEqual(mode["when"], {"id": "motion", "in": declared})
        # (each says how short a film of it can be; a change, each change's; and Loop is the mode's)
        for x in m["roles"][0]["motions"]:
            self.assertIn("change" if x["id"].startswith("change-") else "film", x.get("shortest", {}), x["id"])
        self.assertEqual(m["roles"][0]["loopWhen"], {"id": "mode", "in": ["loop"]})


class Motions(unittest.TestCase):
    FILM = {**SCENE, "film": True, "frames": 60, "fps": 30, "motion": "pulse"}

    def test_a_motion_s_film_carries_its_script_and_the_studio(self):
        said = ask("prepare", step="render", entries=[self.FILM], options={"mode": "loop"})
        self.assertTrue(said["ok"], said)
        files = {f["name"]: f["text"] for f in said["result"]["jobs"][0]["files"]}
        self.assertEqual(files["studio.py"], (FOLDER / "studio.py").read_text(encoding="utf-8"))
        self.assertEqual(files["motion_pulse.py"], (FOLDER / "motion_pulse.py").read_text(encoding="utf-8"))
        self.assertNotIn("motion_scan.py", files)
        settings = json.loads(files["render.json"])
        self.assertEqual((settings["motion"], settings["mode"], settings["out"]), ("pulse", "loop", "film.mp4"))

    def test_a_change_of_molecules_carries_the_part_changes_share(self):
        said = ask("prepare", step="render", entries=[{**self.FILM, "motion": "change-ring"}], options={})
        files = {f["name"]: f["text"] for f in said["result"]["jobs"][0]["files"]}
        self.assertEqual(files["motion_change_ring.py"], (FOLDER / "motion_change_ring.py").read_text(encoding="utf-8"))
        self.assertEqual(files["change.py"], (FOLDER / "change.py").read_text(encoding="utf-8"))
        # (a motion of one molecule carries no such part)
        said = ask("prepare", step="render", entries=[self.FILM], options={})
        self.assertNotIn("change.py", {f["name"] for f in said["result"]["jobs"][0]["files"]})

    def test_meno_s_own_motions_carry_none(self):
        said = ask("prepare", step="render", entries=[{**SCENE, "film": True, "frames": 60, "fps": 30}], options={"mode": "loop"})
        files = {f["name"]: f["text"] for f in said["result"]["jobs"][0]["files"]}
        self.assertNotIn("studio.py", files)
        self.assertNotIn("motion", json.loads(files["render.json"]))

    def test_a_motion_it_does_not_make_or_a_mode_it_has_not_is_refused(self):
        self.assertFalse(ask("prepare", step="render", entries=[{**self.FILM, "motion": "wobble"}], options={})["ok"])
        self.assertFalse(ask("prepare", step="render", entries=[self.FILM], options={"mode": "forever"})["ok"])


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


# a small molecule for the motions: methylamine (C, N and five H), its atoms where Meno writes them, in angstroms
METHYLAMINE = {"atoms": [{"el": "C", "p": [-0.7, 0.0, 0.0]}, {"el": "N", "p": [0.75, 0.0, 0.0]}, {"el": "H", "p": [-1.1, 1.0, 0.0]},
                         {"el": "H", "p": [-1.1, -0.5, 0.87]}, {"el": "H", "p": [-1.1, -0.5, -0.87]}, {"el": "H", "p": [1.1, 0.95, 0.1]}, {"el": "H", "p": [1.1, -0.5, 0.8]}],
               "bonds": [{"a": 0, "b": 1, "order": 1}, {"a": 0, "b": 2, "order": 1}, {"a": 0, "b": 3, "order": 1}, {"a": 0, "b": 4, "order": 1}, {"a": 1, "b": 5, "order": 1}, {"a": 1, "b": 6, "order": 1}]}


# and another, for a change of molecules: methanol (C, O and four H)
METHANOL = {"atoms": [{"el": "C", "p": [-0.7, 0.0, 0.0]}, {"el": "O", "p": [0.7, 0.0, 0.0]}, {"el": "H", "p": [-1.1, 1.0, 0.0]},
                      {"el": "H", "p": [-1.1, -0.5, 0.87]}, {"el": "H", "p": [-1.1, -0.5, -0.87]}, {"el": "H", "p": [1.05, 0.9, 0.0]}],
            "bonds": [{"a": 0, "b": 1, "order": 1}, {"a": 0, "b": 2, "order": 1}, {"a": 0, "b": 3, "order": 1}, {"a": 0, "b": 4, "order": 1}, {"a": 1, "b": 5, "order": 1}]}


@unittest.skipUnless(blender(), "Blender is not installed here")
class MotionsRender(unittest.TestCase):
    """Each motion built and rendered, tiny: 64x36, 4 samples, a few frames - on the dark studio and the white, Once; and a cycle's Loop."""

    def film(self, motion, background, mode="once", frames=5, molecules=(METHYLAMINE,), fails=False):
        with tempfile.TemporaryDirectory() as d:
            scene = {**BALL, **ball_mesh(), "scenes": [{"nodes": [0, 1, 2], "extras": {"meno": {"ambientLight": 0.9, "molecules": list(molecules)}}}]}
            (pathlib.Path(d) / "scene.gltf").write_text(json.dumps(scene), encoding="utf-8")
            # (a frame a second: each film as long as its motion's shortest, in a few frames)
            entry = {"scene": "scene.gltf", "film": True, "width": 64, "height": 36, "frames": frames, "fps": 1, "motion": motion}
            said = ask("prepare", step="render", entries=[entry], options={"samples": 4, "background": background, "mode": mode, "device": "cpu"})
            self.assertTrue(said["ok"], said)
            job = said["result"]["jobs"][0]
            for f in job["files"]:
                (pathlib.Path(d) / f["name"]).write_text(f["text"], encoding="utf-8")
            run = subprocess.run([blender(), *job["args"]], cwd=d, capture_output=True, text=True, timeout=900)
            if fails:
                self.assertNotEqual(run.returncode, 0)
                return worker.why_of(run.stdout + run.stderr)
            self.assertEqual(run.returncode, 0, run.stdout[-3000:] + run.stderr[-2000:])
            self.assertIn("progress 100/100", run.stdout)
            mp4 = (pathlib.Path(d) / "film.mp4").read_bytes()
            self.assertEqual(mp4[4:8], b"ftyp")
            return len(list((pathlib.Path(d) / "frames").glob("**/f_*.png")))

    def test_every_motion_on_both_studios(self):
        for motion in sorted(m for m in worker.MOTIONS if not m.startswith("change-")):
            for background in ("black", "white"):
                with self.subTest(motion=motion, background=background):
                    self.assertEqual(self.film(motion, background), 5)

    def test_every_change_of_molecules_on_both_studios_once_and_as_a_loop(self):
        for motion in sorted(m for m in worker.MOTIONS if m.startswith("change-")):
            for background, mode, frames in (("black", "once", 4), ("white", "loop", 6)):
                with self.subTest(motion=motion, background=background, mode=mode):
                    # (Once: one change, methylamine to methanol; Loop: and back - every frame rendered, in two pieces)
                    rendered = self.film(motion, background, mode, frames, molecules=(METHYLAMINE, METHANOL))
                    self.assertEqual(rendered, frames)

    def test_a_change_of_one_molecule_says_it_needs_two(self):
        why = self.film("change-ring", "white", molecules=(METHYLAMINE,), fails=True)
        self.assertEqual(why, "A change of molecules needs two molecules or more, rendered together")

    def test_a_portrait_film_keeps_a_tall_molecule_whole(self):
        # (a chain standing up the canvas, in a frame twice as tall as wide: Blender's Auto would put the sensor across the
        # height, and the studio's framing - which takes it across the width - would cut the chain's ends off at the top and
        # the bottom. The frame's top and bottom rows: paper, not carbon)
        chain = {"atoms": [{"el": "C", "p": [0.6 * (i % 2), 1.3 * i - 7.0, 0.0]} for i in range(12)],
                 "bonds": [{"a": i, "b": i + 1, "order": 1} for i in range(11)]}
        with tempfile.TemporaryDirectory() as d:
            scene = {**BALL, **ball_mesh(), "scenes": [{"nodes": [0, 1, 2], "extras": {"meno": {"ambientLight": 0.9, "molecules": [chain]}}}]}
            (pathlib.Path(d) / "scene.gltf").write_text(json.dumps(scene), encoding="utf-8")
            entry = {"scene": "scene.gltf", "film": True, "width": 48, "height": 96, "frames": 3, "fps": 1, "motion": "pulse"}
            said = ask("prepare", step="render", entries=[entry], options={"samples": 4, "background": "white", "device": "cpu"})
            job = said["result"]["jobs"][0]
            for f in job["files"]:
                (pathlib.Path(d) / f["name"]).write_text(f["text"], encoding="utf-8")
            run = subprocess.run([blender(), *job["args"]], cwd=d, capture_output=True, text=True, timeout=900)
            self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
            probe = ("import bpy, numpy as np\n"
                     "im = bpy.data.images.load('frames/f_0002.png'); W, H = im.size\n"
                     "x = np.empty(W * H * 4, np.float32); im.pixels.foreach_get(x); x = x.reshape(H, W, 4)[..., :3].mean(axis=2)\n"
                     "print('EDGES', float(x[:3].min()), float(x[-3:].min()), float(x.min()))\n")
            look = subprocess.run([blender(), "-b", "--factory-startup", "--python-expr", probe], cwd=d, capture_output=True, text=True, timeout=300)
            bottom, top, darkest = (float(v) for v in re.search(r"^EDGES (\S+) (\S+) (\S+)$", look.stdout, re.M).groups())
            # (the chain is in the frame, dark; its rows nearest the frame's edges are the paper's, as light as it is)
            self.assertLess(darkest, 0.3)
            self.assertGreater(min(top, bottom), 0.6, (top, bottom, darkest))

    def test_a_cycle_renders_half_and_plays_it_back(self):
        # (assemble loops as a cycle: 8 frames played, 5 rendered - forward, then back)
        self.assertEqual(self.film("assemble", "black", "loop", frames=8), 5)
        # (pulse loops of itself: every frame rendered)
        self.assertEqual(self.film("pulse", "white", "loop", frames=6), 6)


@unittest.skipUnless(blender(), "Blender is not installed here")
class Renders(unittest.TestCase):
    def test_renders_a_picture_on_white(self):
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / "scene.gltf").write_text(json.dumps({**BALL, **ball_mesh()}), encoding="utf-8")
            said = ask("prepare", step="render", entries=[SCENE], options={"samples": 4, "background": "white", "device": "cpu"})
            job = said["result"]["jobs"][0]
            for f in job["files"]:
                (pathlib.Path(d) / f["name"]).write_text(f["text"], encoding="utf-8")
            run = subprocess.run([blender(), *job["args"]], cwd=d, capture_output=True, text=True, timeout=600)
            self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
            self.assertIn("progress 100/100", run.stdout)
            # (never back: each line at least the one before)
            marks = [int(m) for m in re.findall(r"^progress (\d+)/100$", run.stdout, re.M)]
            self.assertEqual(marks, sorted(marks))
            self.assertGreater(len(marks), 2, "the samples moved it")
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
            said = ask("prepare", step="render", entries=[entry], options={"samples": 4, "background": "white", "device": "cpu"})
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

    def test_a_look_with_materials_of_its_own_keeps_each_elements_colour(self):
        # (two balls named as Meno names a shape, one red, one blue, in the clay look with element colours: the left reads red and the right blue - not both the one grey a shared material gives)
        mesh = ball_mesh()
        scene = {**BALL, **mesh}
        scene["meshes"] = [{**mesh["meshes"][0], "name": "ball #FF0000"}, {**mesh["meshes"][0], "name": "ball #0000FF"}]
        scene["materials"] = [{"pbrMetallicRoughness": {"baseColorFactor": [0.8, 0.8, 0.8, 1], "metallicFactor": 0, "roughnessFactor": 1}}]
        scene["nodes"] = [
            {"name": "ball #FF0000", "mesh": 0, "translation": [-1, 0, 0]},
            {"name": "ball #0000FF", "mesh": 1, "translation": [1, 0, 0]},
            {"camera": 0, "translation": [0, 0, 5]},
            BALL["nodes"][2],
        ]
        scene["scenes"] = [{"nodes": [0, 1, 2, 3], "extras": {"meno": {"ambientLight": 0.9}}}]
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / "scene.gltf").write_text(json.dumps(scene), encoding="utf-8")
            said = ask("prepare", step="render", entries=[{**SCENE, "look": "clay"}], options={"clay-colour": "elements", "samples": 16, "background": "white", "device": "cpu"})
            job = said["result"]["jobs"][0]
            for f in job["files"]:
                (pathlib.Path(d) / f["name"]).write_text(f["text"], encoding="utf-8")
            run = subprocess.run([blender(), *job["args"]], cwd=d, capture_output=True, text=True, timeout=600)
            self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
            png = (pathlib.Path(d) / "picture.png").read_bytes()
            r1, g1, b1 = png_pixel(png, 110, 120)[:3]
            r2, g2, b2 = png_pixel(png, 210, 120)[:3]
            self.assertGreater(r1, 2 * max(g1, b1), (r1, g1, b1))
            self.assertGreater(b2, 2 * max(r2, g2), (r2, g2, b2))

    def run_job(self, d, options, probe_file=None):
        (pathlib.Path(d) / "scene.gltf").write_text(json.dumps({**BALL, **ball_mesh()}), encoding="utf-8")
        said = ask("prepare", step="render", entries=[{**SCENE, "width": 160, "height": 120}], options={"samples": 4, "background": "white", **options})
        job = said["result"]["jobs"][0]
        files = {f["name"]: f["text"] for f in job["files"]}
        settings = json.loads(files["render.json"])
        if probe_file:
            settings["probe_file"] = probe_file
        files["render.json"] = json.dumps(settings)
        for name, text in files.items():
            (pathlib.Path(d) / name).write_text(text, encoding="utf-8")
        run = subprocess.run([blender(), *job["args"]], cwd=d, capture_output=True, text=True, timeout=900)
        self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
        return run.stdout

    def test_the_automatic_choice_times_the_two_once_and_keeps_the_faster(self):
        with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as k:
            cache = os.path.join(k, "device-probe.json")
            first = self.run_job(d, {"device": "auto"}, cache)
            if "no graphics processor Blender can use" in first:
                self.skipTest("no graphics processor here to time against the processor")
            self.assertIn("Checking which is faster...", first)
            kept = json.load(open(cache))
            self.assertEqual(len(kept), 1)
            entry = next(iter(kept.values()))
            self.assertIn(entry["device"], ("gpu", "cpu"))
            self.assertGreater(entry["cpu"], 0)
            self.assertGreater(entry["gpu"], 0)
            # (the second render takes what was kept, and does not time again)
            second = self.run_job(d, {"device": "auto"}, cache)
            self.assertNotIn("Checking which is faster...", second)
            self.assertIn("as timed before", second)
            expected = "Rendering on the graphics processor" if entry["device"] == "gpu" else "Rendering on the processor (the faster one here)"
            self.assertIn(expected, second)

    def test_a_motion_s_film_left_to_choose_takes_the_faster_as_timed(self):
        # (a picture times the two and keeps the faster; that kept, a motion's film on the same computer takes it - here the
        # processor, as if it were the faster - and says so, as the card reads it: never the graphics processor for being there)
        with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as k:
            cache = os.path.join(k, "device-probe.json")
            first = self.run_job(d, {"device": "auto"}, cache)
            if "no graphics processor Blender can use" in first:
                self.skipTest("no graphics processor here to time against the processor")
            kept = json.load(open(cache))
            json.dump({key: {**v, "device": "cpu"} for key, v in kept.items()}, open(cache, "w"))
            # (a motion of one molecule, and a change of molecules - a Loop of two pieces, each in a Blender of its own)
            for motion, molecules in (("pulse", [METHYLAMINE]), ("change-ring", [METHYLAMINE, METHANOL])):
                with self.subTest(motion=motion):
                    out = self.motion_film(motion, molecules, "auto", cache)
                    self.assertIn("as timed before", out)
                    self.assertIn(worker.FASTER, out)
                    self.assertNotIn("Rendering on the graphics processor", out)
                    if motion.startswith("change-"):
                        self.assertEqual(re.findall(r"^Change \d of \d: .*$", out, re.M), ["Change 1 of 2: on the processor", "Change 2 of 2: on the processor"])
                    entry = {"scene": "scene.gltf", "film": True, "width": 64, "height": 36, "frames": 4, "fps": 30, "motion": motion}
                    said = ask("collect", step="render", entries=[entry], options={}, files={}, log=out, ended="done")
                    self.assertEqual(said["result"]["note"], "Rendered on the processor")

    def motion_film(self, motion, molecules, device, probe_file=None):
        """A Loop of a motion, tiny, as Meno runs it: its log."""
        with tempfile.TemporaryDirectory() as m:
            scene = {**BALL, **ball_mesh(), "scenes": [{"nodes": [0, 1, 2], "extras": {"meno": {"ambientLight": 0.9, "molecules": molecules}}}]}
            (pathlib.Path(m) / "scene.gltf").write_text(json.dumps(scene), encoding="utf-8")
            entry = {"scene": "scene.gltf", "film": True, "width": 64, "height": 36, "frames": 6, "fps": 1, "motion": motion}
            said = ask("prepare", step="render", entries=[entry], options={"samples": 4, "background": "white", "device": device, "mode": "loop"})
            job = said["result"]["jobs"][0]
            files = {f["name"]: f["text"] for f in job["files"]}
            if probe_file:
                files["render.json"] = json.dumps({**json.loads(files["render.json"]), "probe_file": probe_file})
            for name, text in files.items():
                (pathlib.Path(m) / name).write_text(text, encoding="utf-8")
            run = subprocess.run([blender(), *job["args"]], cwd=m, capture_output=True, text=True, timeout=900)
            self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
            return run.stdout

    def test_every_piece_of_a_change_on_the_graphics_processor_has_its_devices(self):
        # (each piece's studio resets Blender, its Cycles preferences with it: the graphics processor's devices enabled again in
        # every piece - a later one on none would render on the processor, its log still saying the graphics processor)
        out = self.motion_film("change-ring", [METHYLAMINE, METHANOL], "gpu")
        if worker.FELL_BACK in out:
            self.skipTest("no graphics processor here")
        self.assertEqual(re.findall(r"^Change \d of \d: .*$", out, re.M), ["Change 1 of 2: on the graphics processor", "Change 2 of 2: on the graphics processor"])

    def test_the_processor_choice_never_times_and_says_so(self):
        with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as k:
            cache = os.path.join(k, "device-probe.json")
            out = self.run_job(d, {"device": "cpu"}, cache)
            self.assertNotIn("Checking which is faster", out)
            self.assertIn("Rendering on the processor", out)
            self.assertFalse(os.path.exists(cache))

    def test_a_film_moves_its_progress_by_its_frames_samples_and_never_back(self):
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / "scene.gltf").write_text(json.dumps({**BALL, **ball_mesh()}), encoding="utf-8")
            said = ask("prepare", step="render", entries=[{**SCENE, "film": True, "frames": 3, "fps": 3, "width": 64, "height": 48}], options={"samples": 8, "background": "white", "device": "cpu"})
            job = said["result"]["jobs"][0]
            for f in job["files"]:
                (pathlib.Path(d) / f["name"]).write_text(f["text"], encoding="utf-8")
            run = subprocess.run([blender(), *job["args"]], cwd=d, capture_output=True, text=True, timeout=600)
            self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
            marks = [int(m) for m in re.findall(r"^progress (\d+)/100$", run.stdout, re.M)]
            self.assertEqual(marks, sorted(marks))
            # (a third done after the first frame, two thirds after the second: not only at the frames' ends)
            self.assertTrue(any(30 <= m <= 40 for m in marks), marks)
            self.assertTrue(any(60 <= m <= 70 for m in marks), marks)
            self.assertEqual(marks[-1], 100)
            self.assertIn("Rendering on the processor", run.stdout)

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
            said = ask("prepare", step="render", entries=[SCENE], options={"samples": 4, "background": "white", "device": "cpu", "engine": "eevee"})
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
