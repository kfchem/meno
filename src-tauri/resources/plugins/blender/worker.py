# SPDX-License-Identifier: GPL-3.0-or-later
#
# The Blender interface's worker. Copyright (C) 2026 Meno contributors.
# Under the GNU General Public License, version 3 or later: see this
# folder's LICENSE.
"""The Blender interface's worker: pictures and films of molecules in 3D, rendered by Blender.

A plugin's worker (docs/PLUGINS.md, docs/RENDER.md), run in an environment
of its own - Python alone, no package. Blender itself is a program
installed separately, under its own licence: never fetched or shipped by
Meno, found where it is usually installed, where the system finds
programs, or where the chemist located it (the manifest's `installed`).
One JSON object per line each way, as every plugin's:

    {"id": 4, "op": "prepare", "step": "render", "entries": [{"scene": "scene.gltf", "film": false, "width": 2400, "height": 1600, "frames": 1, "fps": 1}], "options": {...}, "cores": 8}
    {"id": 4, "ok": true, "result": {"jobs": [{"entries": [0], "program": "blender", "args": [...], "files": [...], "reads": []}]}}
    {"id": 5, "op": "collect", "step": "render", "entries": [...], "options": {...}, "files": {}, "log": "...", "ended": "done"}
    {"id": 5, "ok": true, "result": {"made": [{"entry": 0, "file": "picture.png", "media": "image/png"}]}}

It fills the role Render, and runs nothing itself: `prepare` writes each
job's settings and its script, render.py, which Blender runs in its own
Python - beside the scene Meno writes into the job's folder (each entry's
`scene`) - and says the command Meno runs, apart from Meno, in the job's
folder; `collect` says what the job made - a picture, a PNG, or a film,
an MP4 - or, where it failed, why. One job for each entry.

Blender is run as its manual says (docs.blender.org, Blender 5.2,
"Command Line Arguments"): in the background (-b), with its factory
settings and none of the chemist's own (--factory-startup), no sound
(-noaudio), never reaching the network (--offline-mode), as many threads
as Meno gives the job (-t), exiting with an error where the script fails
(--python-exit-code), running render.py (-P), its settings after "--".

It keeps nothing between requests, and reaches no network.
"""

import json
import math
import os
import re
import sys

VERSION = "0.2.0"
PROGRAM = "blender"
SCRIPT = "render.py"
SETTINGS = "render.json"
PICTURE = "picture.png"
FILM = "film.mp4"

ENGINES = {"cycles", "eevee"}
BACKGROUNDS = {"transparent", "white", "black", "grey"}
COLOURS = {"neutral", "agx", "standard"}
QUALITIES = {"high", "medium", "lossless"}
# a scene's file's name: a plain name in the job's folder
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.gltf$")


class Refused(Exception):
    """What was asked cannot be done: said, not thrown."""


def whole(v, what, least, most):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v != int(v):
        raise Refused(f"{what} is not a whole number")
    if not least <= v <= most:
        raise Refused(f"{what} must be from {least} to {most}")
    return int(v)


def number(v, what, least, most):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise Refused(f"{what} is not a number")
    if not least <= v <= most:
        raise Refused(f"{what} must be from {least} to {most}")
    return float(v)


def one_of(v, what, among):
    if v not in among:
        raise Refused(f"no {what} is called {v!r}")
    return v


def switch(v, what):
    if not isinstance(v, bool):
        raise Refused(f"{what} is neither on nor off")
    return v


def settings_of(entry, options):
    """A render's settings, as render.py reads them: what Meno asked for, and the options chosen, each checked."""
    if not isinstance(entry, dict):
        raise Refused("an entry is not a scene")
    scene = entry.get("scene")
    if not isinstance(scene, str) or not NAME.match(scene):
        raise Refused("a scene has no name a job's file can have")
    film = switch(entry.get("film", False), "Whether it is a film")
    return {
        "scene": scene,
        "out": FILM if film else PICTURE,
        "film": film,
        "width": whole(entry.get("width"), "The width", 16, 8192),
        "height": whole(entry.get("height"), "The height", 16, 8192),
        "frames": whole(entry.get("frames", 1), "The frames", 1, 3600),
        "fps": whole(entry.get("fps", 1), "The frames a second", 1, 120),
        "engine": one_of(options.get("engine", "cycles"), "engine", ENGINES),
        "samples": whole(options.get("samples", 128), "The samples", 1, 4096),
        "denoise": switch(options.get("denoise", True), "Noise removal"),
        "gpu": switch(options.get("gpu", True), "The graphics processor"),
        "background": one_of(options.get("background", "transparent"), "background", BACKGROUNDS),
        "colours": one_of(options.get("colours", "neutral"), "colour transform", COLOURS),
        "key": number(options.get("key", 1), "The key light", 0, 10),
        "ambient": number(options.get("ambient", 1), "The light all round", 0, 10),
        "softness": number(options.get("softness", 10), "The shadows' softness", 0, 90),
        "quality": one_of(options.get("quality", "high"), "film quality", QUALITIES),
    }


def script_text():
    """render.py, as this plugin carries it: copied into the job's folder, so that the job holds all it runs."""
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), SCRIPT), encoding="utf-8") as f:
        return f.read()


def op_prepare(m):
    if m.get("step") != "render":
        raise Refused(f"this plugin does no {m.get('step')!r}")
    options = m.get("options") or {}
    cores = m.get("cores")
    threads = whole(cores, "The cores", 1, 1024) if cores is not None else 0
    jobs = []
    for i, entry in enumerate(m.get("entries") or []):
        settings = settings_of(entry, options)
        args = ["-b", "--factory-startup", "-noaudio", "--offline-mode"]
        if threads:
            args += ["-t", str(threads)]
        args += ["--python-exit-code", "1", "-P", SCRIPT, "--", SETTINGS]
        jobs.append({
            "entries": [i],
            "program": PROGRAM,
            "args": args,
            "files": [
                {"name": SCRIPT, "text": script_text()},
                {"name": SETTINGS, "text": json.dumps(settings, indent=1) + "\n"},
            ],
            "reads": [],
        })
    if not jobs:
        raise Refused("nothing came in")
    return {"jobs": jobs}


def why_of(log):
    """Why Blender stopped, as it says: its last line that says error, else its last."""
    lines = [line.strip() for line in log.splitlines() if line.strip()]
    for line in reversed(lines):
        if re.search(r"\berror\b|render\.py:", line, re.I):
            return line
    return lines[-1] if lines else "Blender said nothing"


def op_collect(m):
    if m.get("step") != "render":
        raise Refused(f"this plugin does no {m.get('step')!r}")
    if m.get("ended") != "done":
        return {"why": why_of(m.get("log") or "")}
    made = []
    for i, entry in enumerate(m.get("entries") or []):
        film = isinstance(entry, dict) and entry.get("film") is True
        made.append({"entry": i, "file": FILM if film else PICTURE, "media": "video/mp4" if film else "image/png"})
    return {"made": made}


OPS = {"prepare": op_prepare, "collect": op_collect}


def answer(line):
    try:
        m = json.loads(line)
    except ValueError:
        return {"ok": False, "error": "not JSON"}
    op = OPS.get(m.get("op"))
    try:
        if op is None:
            raise Refused(f"no such request: {m.get('op')!r}")
        return {"id": m.get("id"), "ok": True, "result": op(m)}
    except Refused as e:
        return {"id": m.get("id"), "ok": False, "error": f"Blender: {e}."}
    except Exception as e:  # noqa: BLE001 - said, not thrown: the worker keeps answering
        return {"id": m.get("id"), "ok": False, "error": f"Blender: {e}"}


def main():
    print(json.dumps({"event": "ready", "version": VERSION}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
