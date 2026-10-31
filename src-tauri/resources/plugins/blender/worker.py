# SPDX-License-Identifier: GPL-3.0-or-later
#
# The Blender plugin's worker. Copyright (C) 2026 Meno contributors.
# Under the GNU General Public License, version 3 or later: see this
# folder's LICENSE.
"""The Blender plugin's worker: pictures and films of molecules in 3D, rendered by Blender.

A plugin's worker (docs/PLUGINS.md, docs/RENDER.md), run in an environment
of its own - Python alone, no package. Blender itself, under its own
licence, is Meno's own copy of its official build, fetched beside the
environment as the plugin is set up (the manifest's `downloads`); a job
runs it from there.
One JSON object per line each way, as every plugin's:

    {"id": 4, "op": "prepare", "step": "render", "entries": [{"scene": "scene.gltf", "film": false, "width": 2400, "height": 1600, "frames": 1, "fps": 1}], "options": {...}, "cores": 8}
    {"id": 4, "ok": true, "result": {"jobs": [{"entries": [0], "program": "blender", "args": [...], "files": [...], "reads": []}]}}
    {"id": 5, "op": "collect", "step": "render", "entries": [...], "options": {...}, "files": {}, "log": "...", "ended": "done"}
    {"id": 5, "ok": true, "result": {"made": [{"entry": 0, "file": "picture.png", "media": "image/png"}]}}

It fills the role Render, and runs nothing itself: `prepare` writes each
job's settings and its script, render.py, which Blender runs in its own
Python - beside the scene Meno writes into the job's folder (each entry's
`scene`), and, for a film of one of its motions (the entry's `motion`),
the studio they share (studio.py) and the motion's own script
(motion_<id>.py) - and says the command Meno runs, apart from Meno, in the
job's folder; `collect` says what the job made - a picture, a PNG, or a film,
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

VERSION = "0.6.5"
PROGRAM = "blender"
SCRIPT = "render.py"
LOOKS_SCRIPT = "looks.py"
SETTINGS = "render.json"
PICTURE = "picture.png"
# the line render.py logs where the graphics processor was asked for and none was found
FELL_BACK = "Rendering on the processor (no graphics processor Blender can use)"
FASTER = "Rendering on the processor (the faster one here)"
FILM = "film.mp4"

ENGINES = {"cycles", "eevee"}
DEVICES = {"auto", "gpu", "cpu"}
BACKGROUNDS = {"transparent", "white", "black", "grey"}
COLOURS = {"neutral", "agx", "standard"}
QUALITIES = {"high", "medium", "lossless"}
SHADINGS = {"lit", "toon"}
OUTLINES = {"none", "thin", "outer", "mixed"}
OUTLINE_COLOURS = {"black", "white", "grey"}
# a scene's file's name: a plain name in the job's folder
# the looks render.py (looks.py) makes with materials of its own
OWN_LOOKS = {"gold", "silver", "copper", "bubble", "wood", "marble", "fur", "porcelain", "neon", "slime", "xray", "clay"}
LOOKS = {"meno"} | OWN_LOOKS
FINISHES = {"silver-finish": {"mirror", "satin"}, "copper-finish": {"brushed", "tarnished"}}
WOODS = {"oak", "walnut", "cherry", "maple", "ebony", "element"}
MARBLES = {"carrara", "swirl"}
PILES = {"long", "short"}
CLAYS = {"terracotta", "elements"}
PORCELAINS = {"porcelain", "pearl"}
# the film motions this plugin makes (the manifest's `motions`), each a script of its own beside the studio they share
MOTIONS = {"reveal", "pulse", "assemble", "scan", "dissolve", "change-ring", "change-scan", "change-shatter"}
# (its changes of molecules: one molecule becoming the next, piece by piece - each with the part they share beside it)
CHANGE_SCRIPT = "change.py"
MODES = {"once", "loop"}
STUDIO_SCRIPT = "studio.py"
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


def plugin_home():
    """The plugin's data folder, where its environment (`venv`) and its files (`files`, Blender's own) are: the folder holding the environment this worker runs in. None where it is run some other way (a test)."""
    prefix = os.path.abspath(sys.prefix)
    if os.path.basename(prefix) == "venv" and os.path.isdir(os.path.dirname(prefix)):
        return os.path.dirname(prefix)
    return None


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
        "device": one_of(options.get("device", "auto"), "device", DEVICES),
        # (where what is learned of this computer is kept: the plugin's data folder, which this worker knows)
        **({"probe_dir": plugin_home()} if plugin_home() else {}),
        "background": one_of(options.get("background", "transparent"), "background", BACKGROUNDS),
        "colours": one_of(options.get("colours", "neutral"), "colour transform", COLOURS),
        "key": number(options.get("key", 1), "The key light", 0, 10),
        "ambient": number(options.get("ambient", 1), "The light all round", 0, 10),
        "softness": number(options.get("softness", 10), "The shadows' softness", 0, 90),
        "quality": one_of(options.get("quality", "high"), "film quality", QUALITIES),
        # (how it is shaded and outlined: the look's, which Meno gives with the entry)
        "shading": one_of(entry.get("shading", "lit"), "shading", SHADINGS),
        "band": number(entry.get("band", 0.5), "The lit band's size", 0.05, 1),
        "outlines": one_of(entry.get("outlines", "none"), "outlines", OUTLINES),
        "outline": number(entry.get("outline", 3), "The outline's width", 0.5, 20),
        "outline_colour": one_of(entry.get("outline_colour", "black"), "outline colour", OUTLINE_COLOURS),
        # (the look's name, and the choices that adjust it)
        "look": one_of(entry.get("look", "meno"), "look", LOOKS),
        "silver_finish": one_of(options.get("silver-finish", "mirror"), "silver finish", FINISHES["silver-finish"]),
        "copper_finish": one_of(options.get("copper-finish", "brushed"), "copper finish", FINISHES["copper-finish"]),
        "wood": one_of(options.get("wood", "oak"), "wood", WOODS),
        "marble": one_of(options.get("marble", "carrara"), "marble pattern", MARBLES),
        "pile": one_of(options.get("pile", "long"), "pile", PILES),
        "clay_colour": one_of(options.get("clay-colour", "terracotta"), "clay colour", CLAYS),
        "porcelain_finish": one_of(options.get("porcelain-finish", "porcelain"), "porcelain finish", PORCELAINS),
        # (a film's motion, where it is one of this plugin's: none for Meno's own, keyed into the scene; Once or Loop)
        **({"motion": one_of(entry["motion"], "motion", MOTIONS), "mode": one_of(entry.get("mode", "once"), "mode", MODES)} if film and entry.get("motion") is not None else {}),
    }


def script_text(name=SCRIPT):
    """A script, as this plugin carries it (render.py, looks.py): copied into the job's folder, so that the job holds all it runs."""
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), name), encoding="utf-8") as f:
        return f.read()


def motion_script(motion):
    """A motion's own script: motion_<id>.py, a change's dash an underscore (motion_change_ring.py)."""
    return f"motion_{motion.replace('-', '_')}.py"


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
                {"name": LOOKS_SCRIPT, "text": script_text(LOOKS_SCRIPT)},
                # (a motion's script and the studio it is made in, where the film is one of this plugin's motions)
                *([{"name": STUDIO_SCRIPT, "text": script_text(STUDIO_SCRIPT)}, {"name": motion_script(settings["motion"]), "text": script_text(motion_script(settings["motion"]))}] if "motion" in settings else []),
                *([{"name": CHANGE_SCRIPT, "text": script_text(CHANGE_SCRIPT)}] if settings.get("motion", "").startswith("change-") else []),
                {"name": SETTINGS, "text": json.dumps(settings, indent=1) + "\n"},
            ],
            "reads": [],
        })
    if not jobs:
        raise Refused("nothing came in")
    return {"jobs": jobs}


# (Blender's own last words as it quits: "Error: script failed" and "Error: Not freed memory blocks")
BLENDER_OWN = re.compile(r"^Error: (script failed|Not freed memory blocks)", re.I)
# (an exception Python raised, as its traceback ends: its kind, then what it says - "TypeError: ...")
RAISED = re.compile(r"^[A-Za-z_][\w.]*(Error|Exception|Exit)\b: ")


# (where what was raised has been said in full: Blender's own words after it - its last, its version as it quits, "Blender
# quit" - or a line of its progress as it renders - "Fra:", "Saved:", "Time:", a line it stamps with the time, info and
# warnings - or of render.py's own: "progress 3/100", "Rendering on ...", "Making the film", "Rendered ...")
SAID_AFTER = re.compile(
    r"^(Error: (script failed|Not freed memory blocks)|Blender |Traceback |progress \d+/\d+$|Fra:|Saved:|Time:|Info:|Warning:"
    r"|\d+:\d+(\.\d+)?\s|Rendering |Making the film|Rendered )",
    re.I,
)


def why_of(log):
    """Why Blender stopped, as it says: the last that render.py said as it stopped ("render.py: ...", said without the
    script's name, which is no word for the person) or that Python raised - all of it, a message of several lines as
    one - else its last line that says error, else its last; never Blender's own last words as it quits, "Error:
    script failed" and "Error: Not freed memory blocks"."""
    lines = [line.strip() for line in log.splitlines() if line.strip()]
    told = [line for line in lines if not BLENDER_OWN.match(line)]
    for k in range(len(lines) - 1, -1, -1):
        if "render.py:" in lines[k] or RAISED.match(lines[k]):
            first = re.sub(r"^.*?render\.py:\s*", "", lines[k]) if "render.py:" in lines[k] else lines[k]
            whole = [first[:1].upper() + first[1:]]
            for more in lines[k + 1:]:
                if SAID_AFTER.match(more):
                    break
                whole.append(more)
            return " ".join(whole)
    for line in reversed(told):
        if re.search(r"\berror\b", line, re.I):
            return line
    return told[-1] if told else (lines[-1] if lines else "Blender said nothing")


def op_collect(m):
    if m.get("step") != "render":
        raise Refused(f"this plugin does no {m.get('step')!r}")
    if m.get("ended") != "done":
        return {"why": why_of(m.get("log") or "")}
    made = []
    for i, entry in enumerate(m.get("entries") or []):
        film = isinstance(entry, dict) and entry.get("film") is True
        made.append({"entry": i, "file": FILM if film else PICTURE, "media": "video/mp4" if film else "image/png"})
    result = {"made": made}
    # (the graphics processor asked for, and Blender fell back to the processor: said once, which the card may show - nothing where it rendered on the graphics processor or was not asked to)
    if FELL_BACK in (m.get("log") or "") or FASTER in (m.get("log") or ""):
        result["note"] = "Rendered on the processor"
    return result


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
