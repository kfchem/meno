# SPDX-License-Identifier: GPL-3.0-or-later
#
# The Blender plugin's render script: a picture or a film of the scene
# Meno wrote, rendered by Blender.
#
# Copyright (C) 2026 Meno contributors
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option)
# any later version. It is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
# Public License, in this folder's LICENSE, for more details.
"""Renders the scene Meno wrote - glTF 2.0 - as a picture or a film.

Run by Blender, in its own Python, as the job the plugin's worker prepared
(worker.py): Blender in the background, with its factory settings, this
script, and after "--" the job's settings, a JSON file in the job's folder:

    blender -b --factory-startup -noaudio --offline-mode --python-exit-code 1 -P render.py -- render.json

It is under the GPL, as a script using Blender's Python API is: a program
of its own, apart from Meno, which it speaks to only through the files in
the job's folder and its arguments (docs/PLUGINS.md, *Licences*).

What it does, by Blender's own manual and API reference (docs.blender.org,
Blender 5.2): it empties Blender's scene, takes in the glTF scene with
Blender's glTF importer (its camera, its key light, its materials - their
extensions too - and, for a film, its animation), lights the world evenly
as Meno's light all round is, sets the render engine, its samples and
noise removal, the colour transform and the background, and renders the
picture, or each frame of the film into a video - saying how far it is, a
line at a time: "progress <done>/<all>".

The settings (all checked by the worker that wrote them):

    scene       the glTF file's name, in the job's folder
    out         the name to write: a picture's (PNG) or a film's (MP4)
    film        a film, not a picture
    width, height, frames, fps
    engine      "cycles" or "eevee"
    samples, denoise, gpu
    background  "transparent", "white", "black" or "grey"
    colours     "neutral", "agx" or "standard"
    key, ambient   the key light's and the light all round's strengths, as factors of Meno's
    softness    how soft the shadows are: the key light's width, in degrees
    quality     a film's: "high", "medium" or "lossless"
    look        the look's name; those with materials and light of their own (looks.py) are made by it
    silver_finish, copper_finish, wood, marble   the choices that adjust them
    shading     "lit", as a renderer lights it, or "toon": each material a Toon BSDF in the colour it had,
                lit in one band - `band` its size - which Cycles draws as a band, without noise removal
    outlines    "none", "thin" (Freestyle's lines, one pixel), "outer" (the picture's silhouette grown
                by `outline` pixels) or "mixed" (both); `outline_colour`: "black", "white" or "grey"
"""

import glob
import json
import math
import os
import sys

import bpy

sys.path.insert(0, os.getcwd())
import looks  # noqa: E402 - beside this script, in the job's folder

# What a factor of 1 of Meno's lights is, in Blender's units: Meno's key
# light, a sun of this many watts a square metre; its light all round, a
# world this bright.
SUN_STRENGTH = 3.0
WORLD_STRENGTH = 0.6

OUTLINES = {"black": (0.0, 0.0, 0.0), "white": (1.0, 1.0, 1.0), "grey": (0.5, 0.5, 0.5)}
BACKGROUNDS = {"white": (1.0, 1.0, 1.0), "black": (0.0, 0.0, 0.0), "grey": (0.5, 0.5, 0.5)}
TRANSFORMS = {"neutral": "Khronos PBR Neutral", "agx": "AgX", "standard": "Standard"}
QUALITIES = {"high": "HIGH", "medium": "MEDIUM", "lossless": "PERC_LOSSLESS"}
GPUS = ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI")


def say(line):
    print(line, flush=True)


def settings_of():
    argv = sys.argv
    if "--" not in argv or argv.index("--") + 1 >= len(argv):
        raise SystemExit("render.py: no settings given")
    with open(argv[argv.index("--") + 1], encoding="utf-8") as f:
        return json.load(f)


def empty_scene():
    """Blender's factory scene, emptied: nothing of its own in what is rendered."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def take_in(scene, path, fps):
    """The glTF scene, taken in by Blender's importer - at the film's rate, so that its keys' seconds fall on its frames."""
    scene.render.fps = fps
    scene.render.fps_base = 1.0
    bpy.ops.import_scene.gltf(filepath=path)


def camera_of(scene, gltf):
    """The camera Meno placed, orthographic, seeing what Meno framed: as wide as its frame (twice glTF's xmag), the picture its shape."""
    cams = [o for o in scene.objects if o.type == "CAMERA"]
    if not cams:
        raise SystemExit("render.py: the scene has no camera")
    cam = cams[0]
    ortho = gltf["cameras"][0]["orthographic"]
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "HORIZONTAL"
    cam.data.ortho_scale = 2 * ortho["xmag"]
    cam.data.clip_start = ortho["znear"]
    cam.data.clip_end = ortho["zfar"]
    scene.camera = cam


def light(scene, s, ambient):
    """The key light as Meno's, as strong as asked and as soft; the world lit evenly, as Meno's light all round. What is behind is left transparent: the background is put under it afterwards (`assemble`), as it is asked for."""
    for o in scene.objects:
        if o.type == "LIGHT" and o.data.type == "SUN":
            o.data.energy = SUN_STRENGTH * s["key"]
            o.data.angle = math.radians(s["softness"])
    world = bpy.data.worlds.new("Meno")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    lit = nodes.new("ShaderNodeBackground")
    lit.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    lit.inputs["Strength"].default_value = WORLD_STRENGTH * ambient * s["ambient"]
    world.node_tree.links.new(lit.outputs["Background"], out.inputs["Surface"])
    scene.render.film_transparent = True


def toon(scene, s):
    """Toon shading: each material's surface a Toon BSDF in the colour the material had - its colour attribute's, where it took one - lit in one band, `band` its size; a surface that let light through still does, by its alpha (Blender's manual, Shader Nodes > Toon BSDF)."""
    for mat in bpy.data.materials:
        if mat.node_tree is None:
            continue
        nt = mat.node_tree
        principled = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if principled is None or out is None:
            continue
        toon_node = nt.nodes.new("ShaderNodeBsdfToon")
        toon_node.component = "DIFFUSE"
        toon_node.inputs["Size"].default_value = s["band"]
        toon_node.inputs["Smooth"].default_value = 0.0
        colour = principled.inputs["Base Color"]
        if colour.links:
            nt.links.new(colour.links[0].from_socket, toon_node.inputs["Color"])
        else:
            toon_node.inputs["Color"].default_value = colour.default_value
        surface = toon_node.outputs["BSDF"]
        alpha = principled.inputs["Alpha"]
        if alpha.links or alpha.default_value < 1.0:
            clear = nt.nodes.new("ShaderNodeBsdfTransparent")
            mix = nt.nodes.new("ShaderNodeMixShader")
            if alpha.links:
                nt.links.new(alpha.links[0].from_socket, mix.inputs["Fac"])
            else:
                mix.inputs["Fac"].default_value = alpha.default_value
            nt.links.new(clear.outputs["BSDF"], mix.inputs[1])
            nt.links.new(toon_node.outputs["BSDF"], mix.inputs[2])
            surface = mix.outputs["Shader"]
        nt.links.new(surface, out.inputs["Surface"])


def lines(scene, s):
    """Outlines. Freestyle (Blender's manual, Render > Freestyle) draws the shapes' silhouettes, borders and creases: every line at one pixel - "thin" - or, where the outer edge is thick, the inner lines at one pixel. The outer edge - "outer", "mixed" - is the picture's own silhouette grown by the width, in the outline's colour, under the picture: one edge round the molecule, however its shapes overlap, which Freestyle's own external contour is not (it is each shape's)."""
    colour = OUTLINES[s["outline_colour"]]
    if s["outlines"] in ("thin", "mixed"):
        scene.render.use_freestyle = True
        scene.render.line_thickness_mode = "ABSOLUTE"
        scene.render.line_thickness = 1.0
        layer = scene.view_layers[0]
        layer.use_freestyle = True
        sets = layer.freestyle_settings.linesets
        lineset = sets[0] if len(sets) else sets.new("Meno outline")
        lineset.linestyle = bpy.data.linestyles.new("Meno outline")
        lineset.select_silhouette = True
        lineset.select_border = True
        lineset.select_crease = True
        lineset.linestyle.color = colour
        lineset.linestyle.thickness = 1.0
    if s["outlines"] in ("outer", "mixed"):
        group = bpy.data.node_groups.new("Meno outline", "CompositorNodeTree")
        group.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        nodes, links = group.nodes, group.links
        seen = nodes.new("CompositorNodeRLayers")
        grown = nodes.new("CompositorNodeDilateErode")
        grown.inputs["Size"].default_value = int(round(s["outline"]))
        shape = nodes.new("CompositorNodeSetAlpha")
        shape.inputs["Image"].default_value = (colour[0], colour[1], colour[2], 1.0)
        over = nodes.new("CompositorNodeAlphaOver")
        out = nodes.new("NodeGroupOutput")
        links.new(seen.outputs["Alpha"], grown.inputs["Mask"])
        links.new(grown.outputs["Mask"], shape.inputs["Alpha"])
        links.new(shape.outputs["Image"], over.inputs["Background"])
        links.new(seen.outputs["Image"], over.inputs["Foreground"])
        links.new(over.outputs["Image"], out.inputs["Image"])
        scene.compositing_node_group = group
        scene.render.use_compositing = True


def gpu_ready():
    """Whether Blender has a graphics processor to render on, as its Cycles preferences say: the first kind it has, all of its devices on."""
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in GPUS:
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        found = [d for d in prefs.devices if d.type == kind]
        if found:
            for d in prefs.devices:
                d.use = d.type == kind
            return True
    return False


def engine(scene, s):
    # (the cartoon look's band is the Toon BSDF's: Cycles draws it as one, and its noise is not removed, which would soften the band's edge)
    if s["shading"] == "toon":
        scene.render.engine = "CYCLES"
        scene.cycles.samples = s["samples"]
        scene.cycles.use_denoising = False
        scene.cycles.device = "GPU" if s["gpu"] and gpu_ready() else "CPU"
        return
    if s["engine"] == "eevee":
        scene.render.engine = "BLENDER_EEVEE"
        scene.eevee.taa_render_samples = s["samples"]
        return
    scene.render.engine = "CYCLES"
    scene.cycles.samples = s["samples"]
    scene.cycles.use_denoising = s["denoise"]
    scene.cycles.device = "GPU" if s["gpu"] and gpu_ready() else "CPU"


def own_look(scene, s):
    """A look with materials and light of its own (looks.py): Cycles, the world and panels it brings, its materials on the molecules; what reflections find is never seen by the camera."""
    scene.render.engine = "CYCLES"
    scene.cycles.samples = s["samples"]
    scene.cycles.use_denoising = s["denoise"] and s["shading"] != "toon"
    scene.cycles.device = "GPU" if s["gpu"] and gpu_ready() else "CPU"
    camera = scene.camera
    looks.apply(scene, camera, s["look"], {k: s[k] for k in ("silver_finish", "copper_finish", "wood", "marble")}, s["background"])
    looks.settle_denoising(scene)
    scene.render.film_transparent = True


def output(scene, s):
    """What is rendered: its size, its colours as asked, each frame a PNG with its transparency."""
    scene.render.resolution_x = s["width"]
    scene.render.resolution_y = s["height"]
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = TRANSFORMS[s["colours"]]
    scene.view_settings.look = "None"
    image = scene.render.image_settings
    image.media_type = "IMAGE"
    image.file_format = "PNG"
    image.color_mode = "RGBA"
    image.color_depth = "8"


def frames_of(scene, count):
    """The film's frames: from where its keys begin, as many as Meno made."""
    first = None
    for o in scene.objects:
        ad = o.animation_data
        if ad and ad.action:
            start = ad.action.frame_range[0]
            first = start if first is None else min(first, start)
    first = int(round(first if first is not None else scene.frame_start))
    scene.frame_start = first
    scene.frame_end = first + count - 1


def render(scene, s, folder):
    """Each frame rendered, saying how far it is: the frames' files, in order."""
    if not s["film"]:
        scene.render.filepath = os.path.join(folder, "frame.png")
        say("progress 0/1")
        bpy.ops.render.render(write_still=True)
        say("progress 1/1")
        return [os.path.join(folder, "frame.png")]
    frames_of(scene, s["frames"])
    done = [0]

    def each(_scene, _depsgraph=None):
        done[0] += 1
        say(f"progress {done[0]}/{s['frames']}")

    bpy.app.handlers.render_post.append(each)
    scene.render.filepath = os.path.join(folder, "frames", "####")
    say(f"progress 0/{s['frames']}")
    bpy.ops.render.render(animation=True)
    made = sorted(glob.glob(os.path.join(folder, "frames", "*.png")))
    if len(made) != s["frames"]:
        raise SystemExit(f"render.py: Blender rendered {len(made)} of {s['frames']} frames")
    return made


def assemble(frames, s, folder):
    """
    The frames rendered, put over the background asked for - in the
    colours they were rendered in, so that white is white - and written:
    a picture, a PNG; a film, an MP4 (H.264), a video having no
    transparency (a film asked for on a transparent background is put on
    white). Done by Blender's sequencer, in a scene of its own.
    """
    out = os.path.join(folder, s["out"])
    background = s["background"]
    if s["film"] and background == "transparent":
        background = "white"
    if background == "transparent":
        os.replace(frames[0], out)
        return
    made = bpy.data.scenes.new("Assembled")
    made.render.resolution_x = s["width"]
    made.render.resolution_y = s["height"]
    made.render.resolution_percentage = 100
    made.render.fps = s["fps"]
    made.render.fps_base = 1.0
    made.frame_start = 1
    made.frame_end = len(frames)
    # (the frames' colours as they are: no transform over them again)
    made.view_settings.view_transform = "Standard"
    made.view_settings.look = "None"
    made.render.use_sequencer = True
    made.render.use_compositing = False
    strips = made.sequence_editor_create().strips
    under = strips.new_effect(name="Background", type="COLOR", channel=1, frame_start=1, length=len(frames))
    under.color = BACKGROUNDS[background]
    over = strips.new_image(name="Rendered", filepath=frames[0], channel=2, frame_start=1)
    for f in frames[1:]:
        over.elements.append(os.path.basename(f))
    over.blend_type = "ALPHA_OVER"
    image = made.render.image_settings
    if s["film"]:
        image.media_type = "VIDEO"
        image.file_format = "FFMPEG"
        image.color_mode = "RGB"
        ff = made.render.ffmpeg
        ff.format = "MPEG4"
        ff.codec = "H264"
        ff.constant_rate_factor = QUALITIES[s["quality"]]
        ff.ffmpeg_preset = "GOOD"
        ff.audio_codec = "NONE"
        stem = os.path.join(folder, "film-")
        made.render.filepath = stem
        say("Making the film")
        bpy.ops.render.render(animation=True, scene=made.name)
        # (Blender names a video after its frames: it is given the name Meno asked for)
        videos = sorted(glob.glob(stem + "*.mp4"))
        if not videos:
            raise SystemExit("render.py: Blender wrote no film")
        os.replace(videos[-1], out)
    else:
        image.media_type = "IMAGE"
        image.file_format = "PNG"
        image.color_mode = "RGB"
        image.color_depth = "8"
        made.render.filepath = out
        bpy.ops.render.render(write_still=True, scene=made.name)


def main():
    s = settings_of()
    folder = os.getcwd()
    scene_path = os.path.join(folder, s["scene"])
    with open(scene_path, encoding="utf-8") as f:
        gltf = json.load(f)
    meno = (gltf.get("scenes") or [{}])[0].get("extras", {}).get("meno", {})
    scene = empty_scene()
    take_in(scene, scene_path, s["fps"])
    scene = bpy.context.scene
    camera_of(scene, gltf)
    light(scene, s, float(meno.get("ambientLight", 1.0)))
    engine(scene, s)
    if s["look"] in looks.IDS:
        own_look(scene, s)
    if s["shading"] == "toon":
        toon(scene, s)
    lines(scene, s)
    output(scene, s)
    assemble(render(scene, s, folder), s, folder)
    say(f"Rendered {s['out']}")


main()
