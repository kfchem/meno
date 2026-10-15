# SPDX-License-Identifier: GPL-3.0-or-later
#
# The Blender plugin's looks: what the molecules of a picture are made of
# and the light they are in, for the looks that are more than a colour and a
# gloss (gold, silver, copper, a soap bubble, wood, marble, ...).
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
"""The looks render.py makes with materials of their own.

Run by Blender, in its own Python, imported by render.py from the job's
folder (the worker copies it beside render.py). Each look is a function that
fills one material's nodes - Blender's own shader nodes, by its manual
(docs.blender.org, Blender 5.2, Render > Shader Nodes) - given the colour
the molecule's element has (read from the shape's name, "ball #909090") and
whether the shape is a ball or a stick; and a lighting of its own: a world
that reflections find and, for the looks that reflect, three soft
rectangular light panels - neither seen by the camera, which sees only the
molecule over what the background is put under it.

The reflectances of the metals are the F0 values (linear) of Hoffman's
published table of metals ("Physically Based Shading", SIGGRAPH 2010
course): gold 1.00 0.71 0.29, silver 0.95 0.93 0.88, copper 0.95 0.64 0.54.
"""

import math

import bpy
import mathutils

IDS = (
    "gold", "silver", "copper", "bubble", "wood", "marble", "fur", "porcelain", "ice", "neon", "slime", "xray",
    "terracotta", "plush", "plasticine", "pearl",
)


# --- nodes -----------------------------------------------------------------

def node(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def link(nt, a, sa, b, sb):
    nt.links.new(a.outputs[sa], b.inputs[sb])


def principled(nt, **kw):
    return node(nt, "ShaderNodeBsdfPrincipled", **kw)


def lighten(c, t):
    return (c[0] + (1 - c[0]) * t, c[1] + (1 - c[1]) * t, c[2] + (1 - c[2]) * t, 1.0)


def maths(nt, op, a=None, b=None, clamp=False):
    n = node(nt, "ShaderNodeMath", operation=op, use_clamp=clamp)
    if isinstance(a, (int, float)):
        n.inputs[0].default_value = a
    elif a is not None:
        link(nt, *a, n, 0)
    if isinstance(b, (int, float)):
        n.inputs[1].default_value = b
    elif b is not None:
        link(nt, *b, n, 1)
    return n


def random_rotation(nt):
    """A Mapping node turning each object's coordinates by three random angles: its own pattern on each atom."""
    info = node(nt, "ShaderNodeObjectInfo")
    tc = node(nt, "ShaderNodeTexCoord")
    mp = node(nt, "ShaderNodeMapping")
    comb = node(nt, "ShaderNodeCombineXYZ")
    for i, k in enumerate((6.2832, 43.1, 71.7)):
        m = maths(nt, "MULTIPLY", (info, "Random"), k)
        f = maths(nt, "FRACT", (m, "Value"))
        t = maths(nt, "MULTIPLY", (f, "Value"), 6.2832)
        link(nt, t, "Value", comb, i)
    link(nt, tc, "Object", mp, "Vector")
    link(nt, comb, "Vector", mp, "Rotation")
    return mp, info


def grain_bump(nt, pr, scale, strength, detail=8.0, distortion=0.0):
    nz = node(nt, "ShaderNodeTexNoise", Scale=scale, Detail=detail, Distortion=distortion)
    b = node(nt, "ShaderNodeBump", Strength=strength, Distance=0.02)
    link(nt, nz, "Fac", b, "Height")
    link(nt, b, "Normal", pr, "Normal")


def rough_by_noise(nt, pr, rough, amp, scale=90.0):
    tc = node(nt, "ShaderNodeTexCoord")
    nz = node(nt, "ShaderNodeTexNoise", Scale=scale, Detail=6.0)
    mr = node(nt, "ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = rough - amp
    mr.inputs["To Max"].default_value = rough + amp
    link(nt, tc, "Object", nz, "Vector")
    link(nt, nz, "Fac", mr, "Value")
    link(nt, mr, "Result", pr, "Roughness")


def ramp_of(nt, stops, interpolation="LINEAR"):
    r = node(nt, "ShaderNodeValToRGB")
    r.color_ramp.interpolation = interpolation
    e = r.color_ramp.elements
    e[0].position, e[0].color = stops[0]
    e[1].position, e[1].color = stops[-1]
    for p, c in stops[1:-1]:
        e.new(p).color = c
    return r


def facing(nt, blend=0.5):
    """The surface's turn from the viewer: 1 facing it, 0 at the edge (Layer Weight's Facing)."""
    return node(nt, "ShaderNodeLayerWeight", Blend=blend)


# --- the looks (each fills a material's nodes: nt, out, colour, kind, options) ----

def metal(nt, out, f0, rough, amp, aniso=0.0, tarnish=0.0):
    pr = principled(nt, **{"Base Color": f0, "Metallic": 1.0})
    if tarnish:
        tc = node(nt, "ShaderNodeTexCoord")
        nz = node(nt, "ShaderNodeTexNoise", Scale=6.0, Detail=5.0, Distortion=1.0)
        link(nt, tc, "Object", nz, "Vector")
        mix = node(nt, "ShaderNodeMix", data_type="RGBA")
        mix.inputs[6].default_value = f0
        mix.inputs[7].default_value = (f0[0] * 0.6, f0[1] * 0.55, f0[2] * 0.55, 1)
        mr = node(nt, "ShaderNodeMapRange")
        mr.inputs[1].default_value, mr.inputs[2].default_value = 0.4, 0.7
        mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = 0.0, tarnish
        link(nt, nz, "Fac", mr, "Value")
        link(nt, mr, "Result", mix, 0)
        link(nt, mix, "Result", pr, "Base Color")
    rough_by_noise(nt, pr, rough, amp, 160.0 if aniso else 90.0)
    if aniso:
        pr.inputs["Anisotropic"].default_value = aniso
        tg = node(nt, "ShaderNodeTangent", direction_type="RADIAL", axis="Z")
        link(nt, tg, "Tangent", pr, "Tangent")
    nt.links.new(pr.outputs["BSDF"], out.inputs["Surface"])


GOLD, SILVER, COPPER = (1.00, 0.71, 0.29, 1), (0.95, 0.93, 0.88, 1), (0.95, 0.64, 0.54, 1)


def gold(nt, out, c, kind, o):
    metal(nt, out, GOLD, 0.25, 0.07)


def silver(nt, out, c, kind, o):
    if o.get("silver_finish", "mirror") == "satin":
        metal(nt, out, SILVER, 0.20, 0.05)
    else:
        metal(nt, out, SILVER, 0.10, 0.02)


def copper(nt, out, c, kind, o):
    if o.get("copper_finish", "brushed") == "tarnished":
        metal(nt, out, COPPER, 0.30, 0.07, tarnish=0.9)
    else:
        metal(nt, out, COPPER, 0.32, 0.06, aniso=0.7)


def bubble(nt, out, c, kind, o):
    """Almost clear: thin-film bands that swirl by a slow noise, in a faint colour so the clear body reads first, strongest at the rim; the studio's panels reflected."""
    tc = node(nt, "ShaderNodeTexCoord")
    nz = node(nt, "ShaderNodeTexNoise", Scale=2.5, Detail=3.0, Distortion=1.5)
    link(nt, tc, "Object", nz, "Vector")
    lw = facing(nt, 0.5)
    add = maths(nt, "ADD", (nz, "Fac"), (lw, "Facing"))
    sc = maths(nt, "MULTIPLY", (add, "Value"), 1.6)
    fr = maths(nt, "FRACT", (sc, "Value"))
    ramp = ramp_of(nt, [(0.0, (0.9, 0.35, 0.8, 1)), (0.2, (0.3, 0.5, 1.0, 1)), (0.4, (0.2, 0.9, 0.8, 1)), (0.6, (0.95, 0.9, 0.3, 1)),
                        (0.8, (1.0, 0.5, 0.3, 1)), (1.0, (0.9, 0.35, 0.8, 1))], "CARDINAL")
    link(nt, fr, "Value", ramp, "Fac")
    thin = node(nt, "ShaderNodeMix", data_type="RGBA")
    thin.inputs[0].default_value = 0.45
    thin.inputs[6].default_value = (1, 1, 1, 1)
    link(nt, ramp, "Color", thin, 7)
    gl = node(nt, "ShaderNodeBsdfGlossy", Roughness=0.0)
    link(nt, thin, "Result", gl, "Color")
    clear = node(nt, "ShaderNodeBsdfTransparent")
    inv = maths(nt, "SUBTRACT", 1.0, (lw, "Facing"), True)
    fac = node(nt, "ShaderNodeMath", operation="MULTIPLY_ADD", use_clamp=True)
    fac.inputs[1].default_value, fac.inputs[2].default_value = 0.9, 0.18
    link(nt, inv, "Value", fac, 0)
    mix = node(nt, "ShaderNodeMixShader")
    link(nt, fac, "Value", mix, "Fac")
    link(nt, clear, "BSDF", mix, 1)
    link(nt, gl, "BSDF", mix, 2)
    link(nt, mix, "Shader", out, "Surface")


# each species, from the wood's own look: dark, light, rings' scale, their distortion, roughness, its varnish's roughness, ring contrast
SPECIES = {
    "oak": ((0.42, 0.27, 0.13), (0.76, 0.60, 0.37), 2.4, 2.0, 0.55, 0.12),
    "walnut": ((0.10, 0.05, 0.025), (0.36, 0.21, 0.11), 3.2, 3.0, 0.45, 0.06),
    "cherry": ((0.10, 0.02, 0.01), (0.66, 0.26, 0.12), 2.2, 4.5, 0.4, 0.05),
    "maple": ((0.76, 0.63, 0.43), (0.93, 0.85, 0.66), 7.0, 1.0, 0.4, 0.05),
    "ebony": ((0.012, 0.010, 0.008), (0.09, 0.07, 0.06), 5.0, 1.5, 0.3, 0.04),
}


def wood_of(species):
    dark, light, scl, dist, rough, cr = SPECIES[species]

    def build(nt, out, c, kind, o):
        info = node(nt, "ShaderNodeObjectInfo")
        mp, _i = random_rotation(nt)
        if kind == "stick":  # (grain along the stick: rings round its axis)
            tc = node(nt, "ShaderNodeTexCoord")
            mp = node(nt, "ShaderNodeMapping")
            link(nt, tc, "Object", mp, "Vector")
        rs = node(nt, "ShaderNodeMath", operation="MULTIPLY_ADD")
        rs.inputs[1].default_value, rs.inputs[2].default_value = scl * 0.5, scl * 0.8
        link(nt, info, "Random", rs, 0)
        wv = node(nt, "ShaderNodeTexWave", wave_type="RINGS", rings_direction="Y", Distortion=dist, Detail=2.0)
        link(nt, mp, "Vector", wv, "Vector")
        link(nt, rs, "Value", wv, "Scale")
        ramp = ramp_of(nt, [(0.0, (*dark, 1)), (1.0, (*light, 1))])
        link(nt, wv, "Fac", ramp, "Fac")
        tone = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
        tone.inputs[0].default_value = 0.3
        tint = ramp_of(nt, [(0.0, (0.82, 0.76, 0.68, 1)), (1.0, (1.12, 1.06, 1.0, 1))])
        link(nt, info, "Random", tint, "Fac")
        link(nt, ramp, "Color", tone, 6)
        link(nt, tint, "Color", tone, 7)
        pr = principled(nt, Roughness=rough, **{"Coat Weight": 1.0, "Coat Roughness": cr})
        link(nt, tone, "Result", pr, "Base Color")
        link(nt, pr, "BSDF", out, "Surface")

    return build


def wood(nt, out, c, kind, o):
    species = o.get("wood", "oak")
    if species == "element":  # (marquetry: each element its own wood, bonds oak)
        mx, mn = max(c[:3]), min(c[:3])
        if kind == "stick":
            species = "oak"
        elif mx > 0.85 and mx - mn < 0.15:
            species = "maple"
        elif mx - mn < 0.15:
            species = "walnut"
        elif c[2] > c[0]:
            species = "ebony"
        else:
            species = "cherry"
    wood_of(species)(nt, out, c, kind, o)


def marble(nt, out, c, kind, o):
    pr = principled(nt, Roughness=0.08, **{"Coat Weight": 1.0, "Coat Roughness": 0.02, "Subsurface Weight": 0.5, "Subsurface Scale": 0.15,
                                           "Subsurface Radius": (1.0, 0.75, 0.55)})
    if o.get("marble", "carrara") == "swirl":
        mp, _i = random_rotation(nt)
        nz = node(nt, "ShaderNodeTexNoise", Scale=1.1, Detail=9.0, Roughness=0.6, Distortion=2.2)
        link(nt, mp, "Vector", nz, "Vector")
        ab = maths(nt, "ABSOLUTE", (maths(nt, "SUBTRACT", (nz, "Fac"), 0.5), "Value"))
        ramp = ramp_of(nt, [(0.0, (0.22, 0.20, 0.19, 1)), (0.1, (0.93, 0.89, 0.82, 1))], "EASE")
        link(nt, ab, "Value", ramp, "Fac")
        link(nt, ramp, "Color", pr, "Base Color")
    else:
        # one block: long soft veins running diagonally, laid in the molecule's own space (Geometry's Position), continuous across atoms and sticks
        geo = node(nt, "ShaderNodeNewGeometry")
        mp = node(nt, "ShaderNodeMapping")
        mp.inputs["Rotation"].default_value = (0.5, 0.2, 0.6)
        mp.inputs["Scale"].default_value = (3.0 / o.get("_size", 1.0),) * 3
        link(nt, geo, "Position", mp, "Vector")

        def veins(scale, dist):
            wv = node(nt, "ShaderNodeTexWave", wave_type="BANDS", bands_direction="DIAGONAL", Scale=scale, Distortion=dist, Detail=3.0)
            wv.inputs["Detail Scale"].default_value = 1.0
            wv.inputs["Detail Roughness"].default_value = 0.6
            link(nt, mp, "Vector", wv, "Vector")
            return maths(nt, "ABSOLUTE", (maths(nt, "SUBTRACT", (wv, "Fac"), 0.5), "Value"))

        a, b = veins(0.8, 4.5), veins(1.8, 6.0)
        ra = ramp_of(nt, [(0.0, (0.22, 0.22, 0.25, 1)), (0.14, (1, 1, 1, 1))], "EASE")
        rb = ramp_of(nt, [(0.0, (0.42, 0.42, 0.45, 1)), (0.09, (1, 1, 1, 1))], "EASE")
        link(nt, a, "Value", ra, "Fac")
        link(nt, b, "Value", rb, "Fac")
        both = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
        both.inputs[0].default_value = 1.0
        link(nt, ra, "Color", both, 6)
        link(nt, rb, "Color", both, 7)
        warm = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
        warm.inputs[0].default_value = 1.0
        warm.inputs[7].default_value = (0.98, 0.95, 0.90, 1)
        link(nt, both, "Result", warm, 6)
        link(nt, warm, "Result", pr, "Base Color")
    link(nt, pr, "BSDF", out, "Surface")


def porcelain(nt, out, c, kind, o):
    ao = node(nt, "ShaderNodeAmbientOcclusion", Distance=0.3)
    pr = principled(nt, Roughness=0.12, **{"Coat Weight": 1.0, "Coat Roughness": 0.02, "Subsurface Weight": 0.1, "Subsurface Scale": 0.04})
    mix = node(nt, "ShaderNodeMix", data_type="RGBA")
    mix.inputs[6].default_value = (0.50, 0.60, 0.82, 1.0)
    mix.inputs[7].default_value = (0.84, 0.90, 1.0, 1.0)
    link(nt, ao, "AO", mix, 0)
    link(nt, mix, "Result", pr, "Base Color")
    link(nt, pr, "BSDF", out, "Surface")


def ice(nt, out, c, kind, o):
    pr = principled(nt, Roughness=0.25, IOR=1.31, Alpha=0.6, **{"Base Color": (0.55, 0.78, 0.95, 1), "Transmission Weight": 0.5, "Coat Weight": 1.0,
                                                               "Coat Roughness": 0.0, "Emission Color": (0.4, 0.7, 1.0, 1), "Emission Strength": 0.15})
    link(nt, pr, "BSDF", out, "Surface")


def neon(nt, out, c, kind, o):
    """A lit tube: a saturated colour, strongest at the edges, so every edge glows; the bonds in their own cyan."""
    mx, mn = max(c[:3]), min(c[:3])
    if kind == "stick":
        col = (0.0, 0.85, 1.0, 1)
    elif mx - mn < 0.15:
        col = (0.75, 0.35, 1.0, 1) if mx > 0.9 else (0.0, 0.85, 1.0, 1)
    else:
        col = tuple((v - mn * 0.9) / max(mx - mn * 0.9, 1e-3) for v in c[:3]) + (1,)
    lw = facing(nt, 0.35)
    inv = maths(nt, "SUBTRACT", 1.0, (lw, "Facing"))
    strength = node(nt, "ShaderNodeMath", operation="MULTIPLY_ADD")
    strength.inputs[1].default_value, strength.inputs[2].default_value = 5.0, 1.0
    link(nt, inv, "Value", strength, 0)
    em = node(nt, "ShaderNodeEmission", Color=col)
    link(nt, strength, "Value", em, "Strength")
    link(nt, em, "Emission", out, "Surface")


def xray_of(dark):
    def build(nt, out, c, kind, o):
        """See-through film: every shape adds a layer, so overlaps add up; thinner in the middle, denser at the rim. Dark where dense on a light background, light on a dark one."""
        clear = node(nt, "ShaderNodeBsdfTransparent")
        lw = facing(nt, 0.3)
        em = node(nt, "ShaderNodeEmission", Color=(0.04, 0.10, 0.18, 1) if dark else (0.55, 0.85, 1.0, 1), Strength=1.0)
        inv = maths(nt, "SUBTRACT", 1.0, (lw, "Facing"))
        fac = node(nt, "ShaderNodeMath", operation="MULTIPLY_ADD", use_clamp=True)
        fac.inputs[1].default_value, fac.inputs[2].default_value = 0.4, 0.14
        link(nt, inv, "Value", fac, 0)
        mix = node(nt, "ShaderNodeMixShader")
        link(nt, fac, "Value", mix, "Fac")
        link(nt, clear, "BSDF", mix, 1)
        link(nt, em, "Emission", mix, 2)
        link(nt, mix, "Shader", out, "Surface")

    return build


def slime(nt, out, c, kind, o):
    """A jelly all through: the element colours, see-through, a soft glow inside; carbon a translucent grey-green."""
    mx, mn = max(c[:3]), min(c[:3])
    if kind == "stick":
        b = (0.3, 0.75, 0.65, 1)
    elif mx - mn < 0.15 and mx < 0.9:
        b = (0.42, 0.66, 0.50, 1)
    elif mx - mn < 0.15:
        b = (0.80, 0.93, 0.95, 1)
    else:
        b = tuple(min(1.0, max(0.0, (v - mn * 0.5) * 1.25)) for v in c[:3]) + (1,)
    pr = principled(nt, Roughness=0.08, IOR=1.35, Alpha=0.78, **{"Base Color": b, "Subsurface Weight": 0.6, "Subsurface Radius": (1.0, 1.0, 1.0),
                                                                "Subsurface Scale": 0.5, "Transmission Weight": 0.5, "Coat Weight": 1.0, "Coat Roughness": 0.0,
                                                                "Emission Color": b, "Emission Strength": 0.45})
    link(nt, pr, "BSDF", out, "Surface")


def terracotta(nt, out, c, kind, o):
    """Unglazed clay, one colour: dry, very rough, a fine grain, a little variation of tone."""
    nz = node(nt, "ShaderNodeTexNoise", Scale=14.0, Detail=4.0)
    mix = node(nt, "ShaderNodeMix", data_type="RGBA")
    mix.inputs[6].default_value = (0.36, 0.14, 0.08, 1)
    mix.inputs[7].default_value = (0.52, 0.23, 0.13, 1)
    link(nt, nz, "Fac", mix, 0)
    pr = principled(nt, Roughness=1.0, **{"Specular IOR Level": 0.15})
    link(nt, mix, "Result", pr, "Base Color")
    grain_bump(nt, pr, 400.0, 0.5, 3.0)
    link(nt, pr, "BSDF", out, "Surface")


def plush(nt, out, c, kind, o):
    """Velvet at a glance: a deep colour, a bright rim of pile all round every shape, the pile lying light and dark in patches."""
    nz = node(nt, "ShaderNodeTexNoise", Scale=18.0, Detail=4.0, Distortion=0.6)
    tc = node(nt, "ShaderNodeTexCoord")
    link(nt, tc, "Object", nz, "Vector")
    patch = ramp_of(nt, [(0.0, (0.5, 0.5, 0.5, 1)), (1.0, (1.2, 1.2, 1.2, 1))])
    link(nt, nz, "Fac", patch, "Fac")
    deep = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    deep.inputs[0].default_value = 0.7
    deep.inputs[6].default_value = (c[0] * 0.28, c[1] * 0.28, c[2] * 0.28, 1)
    link(nt, patch, "Color", deep, 7)
    pr = principled(nt, Roughness=1.0, **{"Sheen Weight": 0.5, "Sheen Roughness": 0.4, "Sheen Tint": lighten(c, 0.3), "Specular IOR Level": 0.1})
    link(nt, deep, "Result", pr, "Base Color")
    grain_bump(nt, pr, 700.0, 0.7, 2.0)
    lw = facing(nt, 0.5)
    inv = maths(nt, "SUBTRACT", 1.0, (lw, "Facing"))
    rim = maths(nt, "POWER", (inv, "Value"), 2.5)
    em = node(nt, "ShaderNodeEmission", Color=lighten(c, 0.35))
    s = maths(nt, "MULTIPLY", (rim, "Value"), 1.3)
    link(nt, s, "Value", em, "Strength")
    add = node(nt, "ShaderNodeAddShader")
    link(nt, pr, "BSDF", add, 0)
    link(nt, em, "Emission", add, 1)
    link(nt, add, "Shader", out, "Surface")


def plasticine(nt, out, c, kind, o):
    """Modelling clay in the element colours, pressed by hand: matte, a little subsurface, fingerprint ridges, a tool's long marks and fine grain, the tone streaked."""
    sat = tuple(min(1.0, max(0.0, 0.5 + (v - 0.5) * 1.15)) for v in c[:3])
    mp, _i = random_rotation(nt)
    streak = node(nt, "ShaderNodeTexNoise", Scale=3.0, Detail=2.0, Distortion=1.5)
    link(nt, mp, "Vector", streak, "Vector")
    tone = ramp_of(nt, [(0.0, (0.82, 0.82, 0.82, 1)), (1.0, (1.12, 1.12, 1.12, 1))])
    link(nt, streak, "Fac", tone, "Fac")
    col = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    col.inputs[0].default_value = 1.0
    col.inputs[6].default_value = (sat[0], sat[1], sat[2], 1)
    link(nt, tone, "Color", col, 7)
    pr = principled(nt, Roughness=0.8, **{"Subsurface Weight": 0.2, "Subsurface Scale": 0.05, "Subsurface Radius": (1.0, 0.6, 0.4), "Specular IOR Level": 0.3})
    link(nt, col, "Result", pr, "Base Color")
    ridges = node(nt, "ShaderNodeTexWave", wave_type="RINGS", Scale=14.0, Distortion=4.0, Detail=2.0)
    link(nt, mp, "Vector", ridges, "Vector")
    tool = node(nt, "ShaderNodeTexNoise", Scale=4.5, Detail=3.0, Distortion=1.5)
    link(nt, mp, "Vector", tool, "Vector")
    grain = node(nt, "ShaderNodeTexNoise", Scale=110.0, Detail=8.0)
    tc = node(nt, "ShaderNodeTexCoord")
    link(nt, tc, "Object", grain, "Vector")
    a1 = node(nt, "ShaderNodeMath", operation="MULTIPLY_ADD")
    a1.inputs[1].default_value = 0.8
    link(nt, ridges, "Fac", a1, 0)
    link(nt, tool, "Fac", a1, 2)
    a2 = node(nt, "ShaderNodeMath", operation="MULTIPLY_ADD")
    a2.inputs[1].default_value = 0.25
    link(nt, grain, "Fac", a2, 0)
    link(nt, a1, "Value", a2, 2)
    b = node(nt, "ShaderNodeBump", Strength=1.4, Distance=0.05)
    link(nt, a2, "Value", b, "Height")
    link(nt, b, "Normal", pr, "Normal")
    link(nt, pr, "BSDF", out, "Surface")


def pearl(nt, out, c, kind, o):
    """A pearl's cream white, darker at the rim, with a soft pink and green orient that moves with the angle of view; a deep gloss."""
    lw = facing(nt, 0.35)
    orient = ramp_of(nt, [(0.0, (0.88, 0.85, 0.78, 1)), (0.3, (0.62, 0.95, 0.74, 1)), (0.6, (1.0, 0.58, 0.76, 1)), (1.0, (0.72, 0.76, 1.0, 1))], "EASE")
    link(nt, lw, "Fresnel", orient, "Fac")
    base = node(nt, "ShaderNodeMix", data_type="RGBA")
    base.inputs[0].default_value = 1.0
    base.inputs[6].default_value = (0.93, 0.89, 0.82, 1)
    link(nt, orient, "Color", base, 7)
    rim = ramp_of(nt, [(0.0, (0.72, 0.68, 0.66, 1)), (0.6, (1, 1, 1, 1))])
    link(nt, lw, "Facing", rim, "Fac")
    dark = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    dark.inputs[0].default_value = 1.0
    link(nt, base, "Result", dark, 6)
    link(nt, rim, "Color", dark, 7)
    pr = principled(nt, Roughness=0.2, **{"Coat Weight": 1.0, "Coat Roughness": 0.04, "Subsurface Weight": 0.3, "Subsurface Scale": 0.1, "Sheen Weight": 0.4,
                                         "Sheen Roughness": 0.4, "Thin Film Thickness": 380.0, "Thin Film IOR": 1.5})
    link(nt, dark, "Result", pr, "Base Color")
    link(nt, dark, "Result", pr, "Sheen Tint")
    link(nt, pr, "BSDF", out, "Surface")


def fur(nt, out, c, kind, o):
    """The body's own material: matte in the colour; the hairs are added to the shape (hairs)."""
    pr = principled(nt, Roughness=1.0, **{"Base Color": c})
    link(nt, pr, "BSDF", out, "Surface")


def hairs(ob, c):
    """Short dense fur: hair particles of the element's colour, in a material of their own."""
    hair = bpy.data.materials.new("hair")
    hair.use_nodes = True
    nt = hair.node_tree
    nt.nodes.clear()
    hb = node(nt, "ShaderNodeBsdfHairPrincipled", parametrization="COLOR", Color=c, Roughness=0.6)
    o = node(nt, "ShaderNodeOutputMaterial")
    link(nt, hb, "BSDF", o, "Surface")
    ob.data.materials.append(hair)
    st = ob.modifiers.new("fur", "PARTICLE_SYSTEM").particle_system.settings
    st.type = "HAIR"
    st.count = 600
    st.hair_length = 0.1
    st.render_type = "PATH"
    st.child_type = "INTERPOLATED"
    st.rendered_child_count = 20
    st.material_slot = hair.name


# --- the lights: panels and a world for each look ---------------------------------

# looks that reflect their surroundings: their panels' strength, the world's strength and its darkest tone
STUDIO = {
    "gold": (1.0, 0.25, (0.05, 0.06, 0.08)),
    "silver": (1.0, 0.6, (0.35, 0.37, 0.40)),
    "copper": (0.6, 0.25, (0.12, 0.07, 0.05)),
    "bubble": (1.0, 1.1, (0.15, 0.10, 0.25)),
    "slime": (0.5, 0.5, (0.05, 0.06, 0.08)),
    "neon": (0.0, 0.3, (0.0, 0.0, 0.0)),
    "xray": (0.0, 0.5, (0.5, 0.5, 0.5)),
}
SOFT = (0.18, 0.5, (0.05, 0.06, 0.08))     # the looks that are mostly matte: dim panels, or a diffuse surface is over-exposed
MARBLE = (0.1, 0.5, (0.05, 0.06, 0.08))

BUILD = {
    "gold": gold, "silver": silver, "copper": copper, "bubble": bubble, "wood": wood, "marble": marble, "fur": fur, "porcelain": porcelain,
    "ice": ice, "neon": neon, "slime": slime, "terracotta": terracotta, "plush": plush, "plasticine": plasticine, "pearl": pearl,
}


def shape_of(ob):
    """What a shape is by its name (Meno names them "ball #909090", "stick #000000", "surface ..."), and its colour: linear RGB, or None."""
    name = ob.name.split(".")[0] if "." in ob.name and ob.name.rsplit(".", 1)[1].isdigit() else ob.name
    kind = name.split(" ")[0]
    colour = None
    if "#" in name:
        h = name.split("#")[1][:6]
        try:
            rgb = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
            colour = tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in rgb) + (1.0,)
        except ValueError:
            colour = None
    return kind, colour


def studio(scene, camera, look, meshes, dark_background):
    """The world and panels of a look: a gradient world, and - for the looks that reflect - three soft rectangular panels, none seen by the camera."""
    panels, strength, low = STUDIO.get(look, MARBLE if look == "marble" else SOFT)
    if look == "xray" and dark_background:
        strength, low = 0.5, (0.05, 0.06, 0.08)
    for o in [o for o in scene.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o)
    w = bpy.data.worlds.new("Meno studio")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.3, (*low, 1)
    e[1].position, e[1].color = 0.7, (1, 1, 1, 1)
    e.new(0.5).color = (0.8, 0.85, 0.9, 1)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Window"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
    centre = sum(pts, mathutils.Vector()) / len(pts)
    r = max((p - centre).length for p in pts) or 1.0
    cw = camera.matrix_world
    right, up, back = cw.col[0].xyz.normalized(), cw.col[1].xyz.normalized(), cw.col[2].xyz.normalized()
    warm = (1.0, 0.72, 0.52) if look == "copper" else (1.0, 1.0, 1.0)

    def panel(offset, size, energy, name):
        d = bpy.data.lights.new(name, "AREA")
        d.shape = "RECTANGLE"
        d.size, d.size_y = size
        d.energy = energy * panels
        d.color = warm
        o = bpy.data.objects.new(name, d)
        scene.collection.objects.link(o)
        o.location = centre + right * offset[0] * r + up * offset[1] * r + back * offset[2] * r
        o.rotation_euler = (centre - o.location).to_track_quat("-Z", "Y").to_euler()
        o.visible_camera = False

    if panels > 0:
        panel((-3.2, 2.4, 3.0), (6 * r, 3 * r), 2600 * r * r, "left")
        panel((3.5, 0.5, 2.0), (2 * r, 5 * r), 1800 * r * r, "right")
        panel((0.0, 4.5, 1.0), (7 * r, 1.5 * r), 2400 * r * r, "top")
    return r


def apply(scene, camera, look, options, background):
    """Gives the molecules the look's materials and the scene its lights; the render settings it needs set too. False: not a look of these."""
    if look not in IDS:
        return False
    o = dict(options)
    meshes = [ob for ob in scene.objects if ob.type == "MESH"]
    molecules = [ob for ob in meshes if shape_of(ob)[0] != "surface"]
    if not molecules:
        return True
    r = studio(scene, camera, look, molecules, background in ("black", "grey"))
    o["_size"] = r
    if look == "xray":
        build = xray_of(background == "white")
    else:
        build = BUILD[look]
    made = {}
    for ob in molecules:
        kind, colour = shape_of(ob)
        if colour is None:
            colour = (0.8, 0.8, 0.8, 1.0)
        key = (ob.data.name, kind)
        if ob.data.name in made:  # (shapes sharing one mesh share one material)
            continue
        m = bpy.data.materials.new(f"Meno {look}")
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        build(nt, out, colour, "stick" if kind == "stick" else "ball", o)
        if ob.data.materials:
            ob.data.materials[0] = m
        else:
            ob.data.materials.append(m)
        made[ob.data.name] = m
        if look == "fur":
            hairs(ob, colour)
    c = scene.cycles
    c.max_bounces, c.glossy_bounces, c.diffuse_bounces, c.transmission_bounces, c.transparent_max_bounces = 6, 4, 2, 4, 8
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02
    c.adaptive_min_samples = 8
    c.sample_clamp_indirect = 5.0
    return True


def settle_denoising(scene):
    c = scene.cycles
    if c.use_denoising:
        c.denoiser = "OPENIMAGEDENOISE"
        c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
        c.denoising_prefilter = "ACCURATE"
