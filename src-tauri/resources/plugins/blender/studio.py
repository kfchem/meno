# SPDX-License-Identifier: GPL-3.0-or-later
#
# The Blender plugin's studio for its film motions: the molecule, its finish, the studios (dark, and white), the camera and
# the finishing compositor, shared by every motion (motion_*.py).
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
"""The studio a film motion is made in (docs/RENDER.md, *Motions a renderer makes*).

Run by Blender, in its own Python, by render.py: executed in a namespace holding `CFG`, the motion's settings, before the
motion's own script (motion_<id>.py) is executed in the same namespace, which uses what this defines - the molecule's
objects (ATOMS, BONDS, ATOM_OBJ, BOND_OBJ), the easing functions, studio(), camera_at(), finish() and render().

The molecule is the one Meno wrote into the scene's extras (`meno.molecules`: each atom's element and place in ångströms,
the bonds between them), built here at 4 cm an ångström - the size of a product on a table - as the canvas shows it: the
scene's up is the studio's up, and what faces the canvas's viewer faces the camera at its start. Its finish is the motions'
own: each element's colour under a clear coat.

CFG: molecules, seconds (the film's), nominal (the motion's own length: its moments are timed in it, and played over the
film's length), frames, fps, mode ("once" or "loop"), width, height, samples, noise, bg ("dark" or "white"), out,
and the motion's own keys.
"""
import math
import os
import random

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

random.seed(CFG.get("seed", 3))
K = 0.04                     # metres per angstrom: the molecule is the size of a product on a table
FPS = CFG.get("fps", 30)
N = int(CFG["frames"])
LOOP = CFG.get("mode", "once") == "loop"
# (a motion's moments are timed in its own length, `nominal`, and played over the film's: a film shorter or longer than the
# motion plays it faster or slower, all of it - a loop is timed in the film's own length)
SCALE = (CFG["nominal"] / CFG["seconds"]) if CFG.get("nominal") and not LOOP else 1.0
CFG["seconds"] = CFG["seconds"] * SCALE

# --- easing ------------------------------------------------------------------

def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x

def lin(x, a, b):
    return clamp((x - a) / (b - a)) if b != a else float(x >= a)

def smooth(x):
    x = clamp(x); return x * x * (3 - 2 * x)

def smoother(x):
    x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10)

def in_out(x, p=3.0):
    x = clamp(x)
    return 0.5 * (2 * x) ** p if x < 0.5 else 1 - 0.5 * (2 - 2 * x) ** p

def out_c(x, p=3.0):
    x = clamp(x); return 1 - (1 - x) ** p

def in_c(x, p=3.0):
    x = clamp(x); return x ** p

def out_back(x, s=1.4):
    x = clamp(x) - 1; return 1 + (s + 1) * x ** 3 + s * x ** 2

def spring(x, freq=2.2, damp=5.0):
    """0 -> 1 with a damped overshoot; x in seconds after release."""
    if x <= 0: return 0.0
    return 1 - math.exp(-damp * x) * math.cos(2 * math.pi * freq * x)

def bump(x, a, b):
    """0 -> 1 -> 0 over [a, b], smooth."""
    if x <= a or x >= b: return 0.0
    u = (x - a) / (b - a); return math.sin(math.pi * u) ** 2

def tsec(f):
    """A frame's moment in the motion's own time, in seconds."""
    return (f - 1) / FPS * SCALE

# --- molecule ------------------------------------------------------------------

# each element's colour (linear) and radius (in ångströms) in the motions' finish: carbon near black, so its coat draws it
EL = {"C": ((0.010, 0.011, 0.013), 0.34), "H": ((0.62, 0.62, 0.64), 0.23), "N": ((0.012, 0.05, 0.62), 0.33),
      "O": ((0.62, 0.010, 0.006), 0.32), "S": ((0.85, 0.65, 0.05), 0.38), "Cl": ((0.05, 0.65, 0.05), 0.37),
      "F": ((0.25, 0.72, 0.10), 0.31), "Br": ((0.30, 0.03, 0.01), 0.39), "I": ((0.22, 0.01, 0.32), 0.42),
      "P": ((0.95, 0.30, 0.01), 0.37), "B": ((0.90, 0.45, 0.38), 0.33), "Si": ((0.55, 0.45, 0.35), 0.38)}
BOND_R = 0.105

# the molecules Meno wrote: the scene's up (+Y) is the studio's up (+Z), and the canvas's viewer (+Z) is where the camera
# starts (-Y): one set of atoms, the bonds of each kept to its own
ATOMS_IN, BONDS_IN = [], []
for mol_ in CFG["molecules"]:
    base_ = len(ATOMS_IN)
    for a in mol_["atoms"]:
        x, y, z = a["p"]
        ATOMS_IN.append({"el": a["el"], "p": Vector((x, -z, y))})
    for b in mol_["bonds"]:
        o_ = b.get("order", 1)
        # (a bond of an order the sticks have no drawing for - aromatic, say - is drawn single)
        BONDS_IN.append({"a": base_ + int(b["a"]), "b": base_ + int(b["b"]), "order": o_ if o_ in (1, 2, 3) else 1})
if not ATOMS_IN:
    raise SystemExit("studio.py: the scene holds no atoms to move")
heavy_ = [a["p"] for a in ATOMS_IN if a["el"] != "H"] or [a["p"] for a in ATOMS_IN]
centre = sum(heavy_, Vector()) / len(heavy_)
ATOMS = [{"el": a["el"], "p": (a["p"] - centre) * K} for a in ATOMS_IN]
if CFG.get("stand"):
    # (stood on the floor, where asked: its lowest atom just above z = 0 - so that every molecule of a change of molecules
    # stands on the same floor, and one piece's last frame is the next one's first)
    zlow_ = min(a["p"].z - EL.get(a["el"], (None, 0.34))[1] * K for a in ATOMS)
    for a in ATOMS: a["p"] = a["p"] - Vector((0, 0, zlow_ - CFG.get("float", 0.004)))
BONDS = BONDS_IN
NB = [[] for _ in ATOMS]
for i, b in enumerate(BONDS):
    NB[b["a"]].append(b["b"]); NB[b["b"]].append(b["a"])

def graph_dist(sources):
    d = [1e9] * len(ATOMS); q = list(sources)
    for s in sources: d[s] = 0
    while q:
        n = []
        for i in q:
            for j in NB[i]:
                if d[j] > d[i] + 1:
                    d[j] = d[i] + 1; n.append(j)
        q = n
    return d

# (its reach from its middle: where it stands on the floor, from the middle of its height)
MID = Vector((0, 0, 0.5 * (min(a["p"].z for a in ATOMS) + max(a["p"].z for a in ATOMS)))) if CFG.get("stand") else Vector()
RADIUS = max((a["p"] - MID).length for a in ATOMS) + 0.35 * K

# --- scene ------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS; sc.render.fps_base = 1
sc.frame_start, sc.frame_end = 1, N
sc.render.resolution_x, sc.render.resolution_y = CFG.get("width", 1920), CFG.get("height", 1080)
sc.render.resolution_percentage = CFG.get("percent", 100)
sc.render.engine = "CYCLES"
cy = sc.cycles
cy.samples = CFG.get("samples", 256)
cy.use_adaptive_sampling = True; cy.adaptive_threshold = CFG.get("noise", 0.008)
cy.use_denoising = True; cy.denoiser = "OPENIMAGEDENOISE"
cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"; cy.denoising_prefilter = "ACCURATE"
cy.max_bounces = 8; cy.diffuse_bounces = 3; cy.glossy_bounces = 4; cy.transmission_bounces = 8; cy.transparent_max_bounces = 16
cy.caustics_reflective = False; cy.caustics_refractive = False
cy.blur_glossy = 1.0
sc.render.use_motion_blur = CFG.get("blur", True)
sc.render.motion_blur_shutter = CFG.get("shutter", 0.5)
sc.render.motion_blur_position = "CENTER" if hasattr(sc.render, "motion_blur_position") else None
sc.view_settings.view_transform = CFG.get("view", "Khronos PBR Neutral" if CFG.get("bg") == "white" else "AgX")
sc.view_settings.look = CFG.get("grade", "AgX - Medium High Contrast") if sc.view_settings.view_transform == "AgX" else "None"
sc.view_settings.exposure = CFG.get("exposure", -2.2 if CFG.get("bg") == "white" else -0.7)
sc.render.film_transparent = False
sc.render.use_persistent_data = True

# (where it renders is render.py's to say, after this has reset Blender to its factory settings: the processor until then)
cy.device = "CPU"

# --- node helpers -----------------------------------------------------------------

def nnew(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n

def L(nt, a, sa, b, sb):
    nt.links.new(a.outputs[sa] if not isinstance(sa, str) or sa in a.outputs else a.outputs[sa], b.inputs[sb])

def math_(nt, op, a, b=None, c=None, clamp_=False):
    n = nnew(nt, "ShaderNodeMath", operation=op, use_clamp=clamp_)
    for i, x in enumerate((a, b, c)):
        if x is None: continue
        if isinstance(x, (int, float)): n.inputs[i].default_value = x
        else: nt.links.new(x, n.inputs[i])
    return n.outputs[0]

def attr(nt, name, kind="OBJECT"):
    return nnew(nt, "ShaderNodeAttribute", attribute_type=kind, attribute_name=name)

def time_value(nt):
    """Seconds since the film's start, as a node output (a driver on frame)."""
    v = nnew(nt, "ShaderNodeValue")
    fc = v.outputs[0].driver_add("default_value")
    fc.driver.expression = f"(frame - 1) / {FPS} * {SCALE}"
    return v.outputs[0]

def new_material(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL": nt.nodes.remove(n)
    return m, nt, next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")

def hero_bsdf(nt, colour_socket):
    """The hero finish: a lacquered, slightly translucent coat over the element colour."""
    pr = nnew(nt, "ShaderNodeBsdfPrincipled", Roughness=0.32, **{"Coat Weight": 1.0, "Coat Roughness": 0.035, "Specular IOR Level": 0.5})
    nt.links.new(colour_socket, pr.inputs["Base Color"])
    return pr

# --- the molecule's objects ------------------------------------------------------

COL = bpy.data.collections.new("molecule"); sc.collection.children.link(COL)
ROOT = bpy.data.objects.new("root", None); COL.objects.link(ROOT)
ROOT.rotation_mode = "XYZ"

def sphere_mesh(name, seg=96, rings=48):
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    return me

def cylinder_mesh(name, seg=48):
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=1.0, radius2=1.0, depth=2.0)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = abs(p.normal.z) < 0.5
    return me

SPHERE = sphere_mesh("sphere"); CYL = cylinder_mesh("cyl")

def colour(el):
    return EL.get(el, ((0.6, 0.3, 0.6), 0.34))[0]

ATOM_OBJ = []
for i, a in enumerate(ATOMS):
    ob = bpy.data.objects.new(f"atom{i:03d}", SPHERE); COL.objects.link(ob)
    r = EL.get(a["el"], (None, 0.34))[1] * K
    ob.location = a["p"]; ob.scale = (r, r, r); ob.parent = ROOT
    ob["col"] = colour(a["el"]); ob["rnd"] = random.random(); ob["idx"] = i; ob["r"] = r
    a["r"] = r
    ATOM_OBJ.append(ob)

def bond_frame(pa, pb):
    d = pb - pa
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return (pa + pb) / 2, q, d.length

def side_vector(b):
    """A direction across a double bond, in the plane of a neighbour."""
    a, c = b["a"], b["b"]
    pa, pc = ATOMS[a]["p"], ATOMS[c]["p"]; d = (pc - pa).normalized()
    for n in NB[a] + NB[c]:
        if n not in (a, c):
            v = ATOMS[n]["p"] - pa
            s = v - d * v.dot(d)
            if s.length > 1e-6: return s.normalized()
    s = d.cross(Vector((0, 0, 1)))
    return s.normalized() if s.length > 1e-6 else d.cross(Vector((1, 0, 0))).normalized()

BOND_OBJ = []      # one or two sticks per bond: (object, bond index, offset vector)
for bi, b in enumerate(BONDS):
    order = int(round(b["order"]))
    offs = [Vector()] if order == 1 else ([side_vector(b) * 0.13 * K, -side_vector(b) * 0.13 * K] if order == 2 else
                                         [Vector(), side_vector(b) * 0.2 * K, -side_vector(b) * 0.2 * K])
    rad = BOND_R * K * (1.0 if order == 1 else 0.62 if order == 2 else 0.5)
    for k, off in enumerate(offs):
        ob = bpy.data.objects.new(f"bond{bi:03d}-{k}", CYL); COL.objects.link(ob)
        ob.rotation_mode = "QUATERNION"; ob.parent = ROOT
        m, q, ln = bond_frame(ATOMS[b["a"]]["p"] + off, ATOMS[b["b"]]["p"] + off)
        ob.location = m; ob.rotation_quaternion = q; ob.scale = (rad, rad, ln / 2)
        ob["col"] = colour(ATOMS[b["a"]]["el"]); ob["colB"] = colour(ATOMS[b["b"]]["el"])
        ob["rnd"] = random.random(); ob["bond"] = bi; ob["rad"] = rad; ob["stick"] = 1.0
        BOND_OBJ.append((ob, bi, off))

def place_bond(ob, bi, off, pa, pb, f=None, grow=None):
    """Put a stick between two atom positions (and key it on frame f)."""
    b = BONDS[bi]
    m, q, ln = bond_frame(pa + off, pb + off)
    ob.location = m; ob.rotation_quaternion = q
    ob.scale = (ob["rad"], ob["rad"], max(ln / 2, 1e-5))
    if f is not None:
        ob.keyframe_insert("location", frame=f); ob.keyframe_insert("rotation_quaternion", frame=f); ob.keyframe_insert("scale", frame=f)

def hero_material(name="hero", extra=None):
    """The element colour per object (two-tone sticks split at their middle)."""
    m, nt, out = new_material(name)
    ca = attr(nt, "col"); cb = attr(nt, "colB")
    gen = nnew(nt, "ShaderNodeTexCoord")
    sep = nnew(nt, "ShaderNodeSeparateXYZ"); nt.links.new(gen.outputs["Object"], sep.inputs[0])
    is_b = math_(nt, "GREATER_THAN", sep.outputs["Z"], 0.0)
    isstick = attr(nt, "stick").outputs["Fac"]
    fac = math_(nt, "MULTIPLY", is_b, isstick)
    mix = nnew(nt, "ShaderNodeMix", data_type="RGBA")
    nt.links.new(fac, mix.inputs[0]); nt.links.new(ca.outputs["Color"], mix.inputs[6]); nt.links.new(cb.outputs["Color"], mix.inputs[7])
    pr = hero_bsdf(nt, mix.outputs[2])
    sh = pr.outputs[0]
    if extra:
        sh = extra(nt, sh, mix.outputs[2], pr)
    nt.links.new(sh, out.inputs["Surface"])
    return m

def assign(m, objs=None):
    """A material on the shared meshes, or on given objects alone (linked to the object)."""
    for me in (SPHERE, CYL):
        if not me.materials: me.materials.append(m)
    if objs is None:
        for me in (SPHERE, CYL): me.materials[0] = m
        return
    for ob in objs:
        ob.material_slots[0].link = "OBJECT"; ob.material_slots[0].material = m

# --- studio ------------------------------------------------------------------------

def area(name, size, power, colour, loc, target=Vector(), shape="RECTANGLE", size_y=None, spread=180):
    ld = bpy.data.lights.new(name, "AREA"); ld.shape = shape
    ld.size = size; ld.size_y = size_y if size_y else size; ld.energy = power; ld.color = colour
    ld.spread = math.radians(spread)
    ob = bpy.data.objects.new(name, ld); sc.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (target - Vector(loc)).to_track_quat("-Z", "Y")
    ob.visible_camera = False
    return ob

WHITE = CFG.get("bg") == "white"
# white: a paper sweep the camera sees ("visible"), or one that only catches shadows, for a background put under it or none
SWEEP = CFG.get("sweep", "catcher" if CFG.get("paper") == "transparent" else "visible")

def studio(dark=True, key=1.0, rim=1.0):
    if WHITE:
        return studio_white(key, rim)
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.0035, 0.0042, 0.006, 1) if dark else (0.6, 0.62, 0.66, 1)
    bg.inputs["Strength"].default_value = 1.0
    S = RADIUS
    lights = {
        "key": area("key", 1.4, 700 * key, (1.0, 0.95, 0.9), Vector((-1.4, -1.6, 1.3)) * (S / 0.25) ** 0.0, size_y=0.9),
        "fill": area("fill", 2.0, 120 * key, (0.85, 0.92, 1.0), Vector((1.8, -1.2, -0.3)), size_y=1.2),
        "top": area("top", 2.4, 260 * key, (1, 1, 1), Vector((0.0, -0.3, 1.9)), size_y=0.18),
        "rimR": area("rimR", 0.14, 1400 * rim, (0.45, 0.75, 1.0), Vector((1.3, 1.5, 0.5)), size_y=1.6),
        "rimL": area("rimL", 0.14, 1000 * rim, (1.0, 0.62, 0.35), Vector((-1.4, 1.4, 0.2)), size_y=1.6),
    }
    # the backdrop: a dark wall far behind, lit as a soft pool by its own emission (no light spill on the molecule)
    import bmesh
    me = bpy.data.meshes.new("backdrop"); bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6.0); bm.to_mesh(me); bm.free()
    bd = bpy.data.objects.new("backdrop", me); sc.collection.objects.link(bd)
    bd.location = (0, 3.2, 0); bd.rotation_euler = (math.radians(90), 0, 0)
    m, nt, out = new_material("backdrop")
    tc = nnew(nt, "ShaderNodeTexCoord"); gr = nnew(nt, "ShaderNodeTexGradient", gradient_type="SPHERICAL")
    mp = nnew(nt, "ShaderNodeMapping"); mp.inputs["Scale"].default_value = (0.42, 0.62, 1)
    mp.inputs["Location"].default_value = (0.0, 0.25, 0)
    nt.links.new(tc.outputs["Object"], mp.inputs[0]); nt.links.new(mp.outputs[0], gr.inputs[0])
    ramp = nnew(nt, "ShaderNodeValToRGB"); e = ramp.color_ramp.elements
    e[0].color = (0.0, 0.0, 0.0, 1); e[1].position = 1.0; e[1].color = CFG.get("pool", (0.045, 0.06, 0.085, 1))
    ramp.color_ramp.interpolation = "EASE"
    nt.links.new(gr.outputs["Fac"], ramp.inputs[0])
    em = nnew(nt, "ShaderNodeEmission", Strength=1.0); nt.links.new(ramp.outputs[0], em.inputs[0])
    # seen by the camera only: not in reflections, no light cast
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    bd.data.materials.append(m)
    bd.visible_glossy = False; bd.visible_diffuse = False; bd.visible_transmission = False; bd.visible_shadow = False
    if CFG.get("haze", 0):
        import bmesh
        me = bpy.data.meshes.new("haze"); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
        hz = bpy.data.objects.new("haze", me); sc.collection.objects.link(hz); hz.scale = (5, 6, 4); hz.location = (0, 0.4, 0)
        m, nt, out = new_material("haze")
        vs = nnew(nt, "ShaderNodeVolumeScatter", Density=CFG["haze"], Anisotropy=0.35)
        nt.links.new(vs.outputs[0], out.inputs["Volume"]); me.materials.append(m)
        cy.volume_step_rate = 4.0 if hasattr(cy, "volume_step_rate") else None
    return lights, bd

def studio_white(key=1.0, rim=1.0):
    """A high-key studio: a seamless white sweep (floor curving up into a wall behind), big soft lights, contact shadows."""
    import bmesh
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.55, 0.57, 0.6, 1); bg.inputs["Strength"].default_value = CFG.get("ambient", 0.12)
    zmin = min(a["p"].z - a["r"] for a in ATOMS)
    zf = zmin - CFG.get("float", 0.004)            # the floor, a little below the molecule
    yw, R = CFG.get("wall", 0.75), 0.45           # the wall behind, and the sweep's radius
    prof = [(-9.0, zf), (yw - R, zf)]
    for k in range(1, 24):
        a = math.pi / 2 * k / 24
        prof.append((yw - R + R * math.sin(a), zf + R - R * math.cos(a)))
    prof += [(yw, zf + R), (yw, zf + 9.0)]
    me = bpy.data.meshes.new("cyc"); bm = bmesh.new()
    left = [bm.verts.new((-9.0, y, z)) for y, z in prof]
    right = [bm.verts.new((9.0, y, z)) for y, z in prof]
    for i in range(len(prof) - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    cyc = bpy.data.objects.new("cyc", me); sc.collection.objects.link(cyc)
    m, nt, out = new_material("cyc")
    pr = nnew(nt, "ShaderNodeBsdfPrincipled", Roughness=0.85); pr.inputs["Base Color"].default_value = CFG.get("paper", (0.8, 0.8, 0.81, 1))
    nt.links.new(pr.outputs[0], out.inputs["Surface"]); me.materials.append(m)
    lights = {
        "key": area("key", 1.4, 700 * key, (1.0, 0.97, 0.94), Vector((-1.3, -1.4, 1.7)), size_y=0.9),
        "fill": area("fill", 2.0, 110 * key, (0.94, 0.97, 1.0), Vector((1.8, -1.2, -0.1)), size_y=1.2),
        "top": area("top", 2.4, 240 * key, (1, 1, 1), Vector((0.0, -0.3, 1.9)), size_y=0.18),
        "rimR": area("rimR", 0.14, 500 * rim, (0.85, 0.92, 1.0), Vector((1.3, 1.2, 0.5)), size_y=1.4),
        "rimL": area("rimL", 0.14, 350 * rim, (1.0, 0.9, 0.8), Vector((-1.3, 1.1, 0.3)), size_y=1.4),
    }
    if SWEEP == "catcher":
        # the sweep only catches shadows: the background itself is put under the render (finish), its colour a choice
        cyc.is_shadow_catcher = True
    else:
        # a real paper sweep, seen by the camera: a big soft source overhead pools light on the floor round the molecule and
        # falls off up the wall, the classic product-shot gradient; what the molecule casts - shadow, coloured light - lands on it
        sky = area("sky", CFG.get("sky_size", 0.8), CFG.get("sky", 330.0), (0.985, 1.0, 0.99), Vector((0.0, 0.15, zf + 1.6)), target=Vector((0.0, 0.35, zf)), size_y=1.4)
        sky.visible_glossy = False
        # (it lights the paper alone - Blender's light linking - so the molecule keeps its own key and fill, and still shadows the paper)
        paper = bpy.data.collections.new("paper"); paper.objects.link(cyc)
        sky.light_linking.receiver_collection = paper
        # (and the subject's lights light the subject alone: the paper's only light is the sky, so the shadow under the molecule
        # is the sky's, as dense as the molecule makes it, never filled in by the key)
        if CFG.get("subject_only", True):
            for ob in lights.values(): ob.light_linking.receiver_collection = COL
        lights["sky"] = sky
    return lights, cyc

# --- camera ----------------------------------------------------------------------------

CAM = bpy.data.cameras.new("cam"); CAM.lens = CFG.get("lens", 85); CAM.sensor_width = 36
# (the sensor across the frame's width, whatever its shape: the framing here takes the width's field as the lens and the
# sensor give it, the height's as the frame's shape makes it - Blender's own Auto puts the sensor across the longer side,
# the height of a portrait film, which would cut a tall molecule's ends; a landscape film is as it was)
CAM.sensor_fit = "HORIZONTAL"
CAM.clip_start = 0.05; CAM.clip_end = 50
CAMOB = bpy.data.objects.new("cam", CAM); sc.collection.objects.link(CAMOB); sc.camera = CAMOB
FOCUS = bpy.data.objects.new("focus", None); sc.collection.objects.link(FOCUS)
CAM.dof.use_dof = CFG.get("dof", True); CAM.dof.focus_object = FOCUS; CAM.dof.aperture_fstop = CFG.get("fstop", 4.0)
CAM.dof.aperture_blades = 7; CAM.dof.aperture_rotation = math.radians(12)

def fit_distance(margin=1.0):
    """The distance at which the molecule's widest extent fills `margin` of the frame's width (heights kept in too)."""
    hw = CAM.sensor_width / 2 / CAM.lens
    hh = hw * sc.render.resolution_y / sc.render.resolution_x
    w = max(abs(a["p"].x) + a["r"] for a in ATOMS); h = max(abs(a["p"].z) + a["r"] for a in ATOMS)
    return max(w / (hw * margin), h / (hh * margin))

def camera_at(f, yaw, pitch, dist, look=Vector(), roll=0.0, lens=None, fstop=None, focus=None):
    """Orbit camera: yaw about the vertical, pitch up, at a distance, looking at `look` (keyed on frame f)."""
    pitch = pitch + CFG.get("pitch_add", 18.0 if WHITE else 0.0)
    y, p = math.radians(yaw), math.radians(pitch)
    pos = look + Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p))) * dist
    CAMOB.location = pos
    q = (look - pos).to_track_quat("-Z", "Y")
    if roll: q = q @ Quaternion((0, 0, 1), math.radians(roll))
    CAMOB.rotation_mode = "QUATERNION"; CAMOB.rotation_quaternion = q
    CAMOB.keyframe_insert("location", frame=f); CAMOB.keyframe_insert("rotation_quaternion", frame=f)
    if lens is not None:
        CAM.lens = lens; CAM.keyframe_insert("lens", frame=f)
    if fstop is not None:
        CAM.dof.aperture_fstop = fstop; CAM.dof.keyframe_insert("aperture_fstop", frame=f)
    FOCUS.location = focus if focus is not None else look
    FOCUS.keyframe_insert("location", frame=f)

def linear_keys():
    for a in bpy.data.actions:
        for fc in all_fcurves(a):
            for k in fc.keyframe_points:
                k.interpolation = "LINEAR"

def all_fcurves(action):
    try:
        return list(action.fcurves)
    except AttributeError:
        out = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out += list(bag.fcurves)
        return out

# --- compositing -----------------------------------------------------------------------

def finish(bloom=0.12, streaks=0.0, dispersion=0.012, vignette=0.35, grain=0.012, threshold=5.0, glow_size=0.5):
    if WHITE:
        # high key: no bloom to speak of (glow washes out on white), no lens tint, a faint vignette
        bloom, streaks, dispersion, vignette, grain, threshold = CFG.get("white_bloom", 0.05), 0.0, 0.0, 0.07, 0.004, 9.0
    g = bpy.data.node_groups.new("finish", "CompositorNodeTree")
    g.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    n, l = g.nodes, g.links
    rl = n.new("CompositorNodeRLayers")
    img = rl.outputs["Image"]
    if WHITE and SWEEP == "catcher":
        sc.render.film_transparent = True
        if CFG.get("paper") != "transparent":
            ov = n.new("CompositorNodeAlphaOver")
            ov.inputs["Background"].default_value = tuple(CFG.get("paper_rgb", (9.5, 9.5, 9.5))) + (1.0,)
            l.new(img, ov.inputs["Foreground"]); img = ov.outputs["Image"]
    if bloom:
        gl = n.new("CompositorNodeGlare")
        gl.inputs["Type"].default_value = "Bloom"; gl.inputs["Quality"].default_value = "High"
        gl.inputs["Threshold"].default_value = threshold; gl.inputs["Strength"].default_value = bloom
        gl.inputs["Size"].default_value = glow_size; gl.inputs["Smoothness"].default_value = 0.4
        l.new(img, gl.inputs["Image"]); img = gl.outputs["Image"]
    if streaks:
        st = n.new("CompositorNodeGlare")
        st.inputs["Type"].default_value = "Streaks"; st.inputs["Quality"].default_value = "High"
        st.inputs["Threshold"].default_value = threshold * 2.5; st.inputs["Strength"].default_value = streaks
        st.inputs["Streaks"].default_value = 2; st.inputs["Streaks Angle"].default_value = 0.0; st.inputs["Fade"].default_value = 0.93
        l.new(img, st.inputs["Image"]); img = st.outputs["Image"]
    if dispersion:
        ld = n.new("CompositorNodeLensdist")
        ld.inputs["Dispersion"].default_value = dispersion; ld.inputs["Distortion"].default_value = 0.0
        l.new(img, ld.inputs["Image"]); img = ld.outputs["Image"]
    if vignette:
        el = n.new("CompositorNodeEllipseMask")
        el.inputs["Size"].default_value = (1.25, 1.25)
        bl = n.new("CompositorNodeBlur"); bl.inputs["Size"].default_value = (500, 500) if "Size" in bl.inputs else None
        l.new(el.outputs["Mask"], bl.inputs["Image"])
        mr = n.new("ShaderNodeMapRange"); mr.inputs["To Min"].default_value = 1 - vignette
        l.new(bl.outputs["Image"], mr.inputs["Value"])
        mx = n.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1.0
        l.new(img, mx.inputs[6]); l.new(mr.outputs["Result"], mx.inputs[7]); img = mx.outputs[2]
    if grain:
        nz = n.new("ShaderNodeTexNoise"); nz.noise_dimensions = "3D"
        nz.inputs["Scale"].default_value = 900.0; nz.inputs["Detail"].default_value = 0.0
        tv = n.new("CompositorNodeTime") if False else None
        mx = n.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "OVERLAY"; mx.inputs[0].default_value = grain * 8
        l.new(img, mx.inputs[6]); l.new(nz.outputs["Color"], mx.inputs[7]); img = mx.outputs[2]
    out = n.new("NodeGroupOutput"); l.new(img, out.inputs["Image"])
    sc.compositing_node_group = g; sc.render.use_compositing = True
    return g

# --- render --------------------------------------------------------------------------

def render():
    """Every frame, a 16-bit PNG in CFG's `out`, as f_0001.png on: the frames' paths, in order."""
    out = CFG["out"]; os.makedirs(out, exist_ok=True)
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_depth = "16"
    made = []
    for f in range(1, N + 1):
        p = os.path.join(out, f"f_{f:04d}.png")
        sc.frame_set(f)
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        made.append(p)
    return made
