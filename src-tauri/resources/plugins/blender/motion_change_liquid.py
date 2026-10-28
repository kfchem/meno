# SPDX-License-Identifier: GPL-3.0-or-later
#
# The Blender plugin's change of molecules "liquid". Copyright (C) 2026 Meno contributors.
# Under the GNU General Public License, version 3 or later: see this folder's LICENSE.
"""Liquid: each molecule melts, from the top down, into a pool of molten gold on the paper (Mantaflow, its liquid as viscous
as honey); a pool draws itself up into one round drop and spreads out again as the next molecule's pool, which rises into
that molecule - its melt played backwards. A film of it is made in stages (render.py): each molecule's melt (`stage`
"melt": baked, rendered, its pool's last surface kept), then each change between two pools (`stage` "reform").

Every melt ends with the camera just where every other one does, framing a pool as large as the largest molecule's: a melt
played backwards, and a reform, meet it there. Executed by render.py in the namespace studio.py has filled, with the
stage's settings in CFG; it renders every frame.
"""
import bmesh
import time

import numpy as np

# (the liquid's settings: viscous molten gold on the white studio, its grid as fine as the film's width asks)
for k_, v_ in {"res": max(48, min(256, int(round(192 * CFG.get("width", 1920) / 1920)))), "mesh_scale": 2, "smooth_pos": 8,
               "smooth_neg": 8, "pradius": 1.5, "melt_span": 2.0, "pour": 3, "viscosity": 0.4, "molten_metal": True,
               "no_glow": True, "molten_rgb": (1.0, 0.71, 0.29, 1), "molten_rough": 0.08, "trans": 0.0, "sss": 0.0,
               "post_smooth": (0.8, 8), "post_subsurf": 1, "squat": 0.42}.items():
    CFG.setdefault(k_, v_)
FPSM = FPS / SCALE
# (the domain the liquid runs in: wide enough for the widest molecule's pool; the camera's last place frames it)
REACH = max(0.42, 1.35 * CFG.get("reach", 8.0) * K)
CFG["dom_w"], CFG["dom_d"] = REACH, REACH * 0.76
Z_POOL = 0.07 * REACH / 0.42
END_YAW, END_PITCH = 2.0, 10.0           # (where every melt's camera ends, and each reform's stays)

def pool_distance(margin=0.94):
    """The least distance at which all the domain's floor - all a pool can cover - and a pool's height over it are in the
    frame, from where every melt ends (the camera's yaw and pitch then, the studio's pitch added): the largest molecule's
    pool, however far it spreads, is never cut."""
    hw = CAM.sensor_width / 2 / CAM.lens; hh = hw * sc.render.resolution_y / sc.render.resolution_x
    y, pt = math.radians(END_YAW), math.radians(END_PITCH + CFG.get("pitch_add", 18.0 if WHITE else 0.0))
    look = Vector((0, 0, Z_POOL)); away = Vector((math.sin(y) * math.cos(pt), -math.cos(y) * math.cos(pt), math.sin(pt)))
    W, D, H = CFG["dom_w"], CFG["dom_d"], 0.12 * REACH
    corners = [Vector((sx * W, sy * D, z)) for sx in (-1, 1) for sy in (-1, 1) for z in (0.0, H)]
    def inside(d):
        pos = look + away * d
        inv = (look - pos).to_track_quat("-Z", "Y").to_matrix().inverted()
        for c in corners:
            q = inv @ (c - pos)
            if q.z >= 0 or abs(q.x / -q.z) > hw * margin or abs(q.y / -q.z) > hh * margin:
                return False
        return True
    lo, hi = 0.2 * REACH, 40.0 * REACH
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        lo, hi = (lo, mid) if inside(mid) else (mid, hi)
    return hi

D_POOL = pool_distance()

def fit(atoms, look_z, margin=0.62):
    hw = CAM.sensor_width / 2 / CAM.lens; hh = hw * sc.render.resolution_y / sc.render.resolution_x
    w = max(abs(a["p"].x) + a["r"] for a in atoms); h = max(abs(a["p"].z - look_z) + a["r"] for a in atoms)
    return max(w / (hw * margin), h / (hh * margin))

def pool_camera(f, e, d0=D_POOL, z0=Z_POOL):
    """The camera, `e` of the way from the molecule's framing (`d0`, looking at `z0`) to the pool's, where every melt ends."""
    camera_at(f, -6.0 + (END_YAW + 6.0) * e, 8.0 + (END_PITCH - 8.0) * e, d0 + (D_POOL - d0) * e, look=Vector((0, 0, z0 + (Z_POOL - z0) * e)), fstop=CFG.get("fstop", 5.0))

if CFG["stage"] == "melt":
    T = CFG["seconds"]
    T_HEAT, T_MELT = CFG.get("heat_at", 0.3), CFG.get("melt_at", 1.2)
    M = int(round(T_MELT * FPSM)) + 1                     # the first frame of the liquid
    zmin = min(a["p"].z - a["r"] for a in ATOMS); ztop = max(a["p"].z + a["r"] for a in ATOMS)
    zf = zmin - CFG.get("float", 0.004)

    MOLTEN = CFG.get("molten_rgb", (0.9, 0.42, 0.06, 1) if WHITE else (0.08, 0.02, 0.01, 1))

    def heat_shader(nt, sh, col, pr):
        """The solid heats before it melts: its colour goes to the molten colour (and, on dark, it glows from within)."""
        Tm = time_value(nt)
        geo_ = nnew(nt, "ShaderNodeNewGeometry"); spz = nnew(nt, "ShaderNodeSeparateXYZ"); nt.links.new(geo_.outputs["Position"], spz.inputs[0])
        # (each part's own melt time, by its height: the heat runs ahead of it by the lead)
        lead = T_MELT - T_HEAT
        due = math_(nt, "ADD", math_(nt, "MULTIPLY", math_(nt, "DIVIDE", math_(nt, "SUBTRACT", ztop, spz.outputs["Z"]), ztop - zmin + 1e-6), CFG.get("melt_span", 2.4)), T_MELT)
        h = math_(nt, "DIVIDE", math_(nt, "SUBTRACT", Tm, math_(nt, "SUBTRACT", due, lead)), lead, None, True)
        h = math_(nt, "POWER", h, 1.6)
        hot = molten_bsdf(nt, glow=h)
        mx = nnew(nt, "ShaderNodeMixShader"); nt.links.new(h, mx.inputs[0]); nt.links.new(sh, mx.inputs[1]); nt.links.new(hot, mx.inputs[2])
        return mx.outputs[0]

    def molten_bsdf(nt, glow=None):
        """Molten glass or hot wax: on white a glossy amber that light passes into; on dark near-black glass glowing orange from within."""
        pr = nnew(nt, "ShaderNodeBsdfPrincipled", Roughness=0.06, IOR=1.45, **{"Coat Weight": 0.6, "Coat Roughness": 0.02})
        pr.inputs["Base Color"].default_value = MOLTEN
        pr.inputs["Roughness"].default_value = CFG.get("molten_rough", 0.06)
        pr.inputs["Transmission Weight"].default_value = CFG.get("trans", 0.25 if WHITE else 0.0)
        if CFG.get("molten_metal"): pr.inputs["Metallic"].default_value = 1.0
        if WHITE or CFG.get("no_glow"):
            pr.inputs["Subsurface Weight"].default_value = CFG.get("sss", 0.6 if WHITE else 0.0)
            pr.inputs["Subsurface Radius"].default_value = (0.012, 0.006, 0.002)
            return pr.outputs[0]
        lw = nnew(nt, "ShaderNodeLayerWeight", Blend=0.4)
        core = math_(nt, "POWER", lw.outputs["Facing"], 2.0)            # brightest where seen face on: a glow from inside
        k = math_(nt, "MULTIPLY", core, CFG.get("glow", 1.4))
        if glow is not None: k = math_(nt, "MULTIPLY", k, glow)
        bb = nnew(nt, "ShaderNodeBlackbody"); bb.inputs["Temperature"].default_value = CFG.get("kelvin", 1250.0)
        em = nnew(nt, "ShaderNodeEmission"); nt.links.new(bb.outputs[0], em.inputs["Color"]); nt.links.new(k, em.inputs["Strength"])
        ad = nnew(nt, "ShaderNodeAddShader"); nt.links.new(pr.outputs[0], ad.inputs[0]); nt.links.new(em.outputs[0], ad.inputs[1])
        return ad.outputs[0]

    assign(hero_material(extra=heat_shader))
    lights, cyc = studio()

    # --- the melt runs from the top down, in bands of height: each band, as its time comes, becomes liquid of its own exact volume
    # (a flow for one frame) and stops being solid (its collider switched off); the bands below hold, so what has melted drapes over
    # them, strings between them and drips off them
    NB = CFG.get("bands", 10); SPAN = CFG.get("melt_span", 2.4)
    def band_of(z): return min(NB - 1, int((ztop - z) / (ztop - zmin + 1e-6) * NB))
    def frame_of(b): return M + int(round(b * SPAN / NB * FPSM))
    pad = CFG.get("pad", 0.0015)
    FAT, BFAT = CFG.get("fat", 1.6), CFG.get("bfat", 2.5)      # heated, it softens and swells: the liquid starts from the swollen shape
    geo = [bmesh.new() for _ in range(NB)]
    # (the colliders are the solid as drawn, a little thinner: the swollen liquid of a band must not start inside a neighbour's
    # collider, where the solver takes it away)
    SOL = CFG.get("solid_k", 0.9)
    sgeo = [bmesh.new() for _ in range(NB)]
    for a in ATOMS:
        a["band"] = band_of(a["p"].z)
        bmesh.ops.create_icosphere(geo[a["band"]], subdivisions=3, radius=a["r"] * FAT + pad, matrix=Matrix.Translation(a["p"]))
        bmesh.ops.create_icosphere(sgeo[a["band"]], subdivisions=2, radius=a["r"] * SOL, matrix=Matrix.Translation(a["p"]))
    for ob, bi, off in BOND_OBJ:
        ob["band"] = band_of(ob.location.z)
        bmesh.ops.create_cone(geo[ob["band"]], cap_ends=True, segments=16, radius1=ob["rad"] * BFAT + pad, radius2=ob["rad"] * BFAT + pad, depth=ob.scale.z * 2,
                              matrix=Matrix.Translation(ob.location) @ ob.rotation_quaternion.to_matrix().to_4x4())
        bmesh.ops.create_cone(sgeo[ob["band"]], cap_ends=True, segments=10, radius1=ob["rad"] * SOL, radius2=ob["rad"] * SOL, depth=ob.scale.z * 2 * 0.8,
                              matrix=Matrix.Translation(ob.location) @ ob.rotation_quaternion.to_matrix().to_4x4())
    for ob in ATOM_OBJ: ob["band"] = ATOMS[ob["idx"]]["band"]
    for b in range(NB):
        if not geo[b].verts: continue
        fb = frame_of(b)
        for role in ("flow", "solid"):
            me = bpy.data.meshes.new(f"{role}{b}"); (geo if role == "flow" else sgeo)[b].to_mesh(me)
            o = bpy.data.objects.new(f"{role}{b}", me); sc.collection.objects.link(o); o.hide_render = True
            mf = o.modifiers.new("Fluid", "FLUID")
            if role == "flow":
                # (inflow, switched on for a few frames: a "geometry" flow seeds only a sim's first frame, so later bands would add nothing)
                mf.fluid_type = "FLOW"; fs = mf.flow_settings; fs.flow_type = "LIQUID"; fs.flow_behavior = "INFLOW"; fs.flow_source = "MESH"
                fs.surface_distance = 0.0; fs.volume_density = 1.0
                for f, on in ((1, False), (fb - 1, False), (fb, True), (fb + CFG.get("pour", 2), True), (fb + CFG.get("pour", 2) + 1, False)):
                    fs.use_inflow = on; fs.keyframe_insert("use_inflow", frame=max(1, f))
            else:
                mf.fluid_type = "EFFECTOR"; es = mf.effector_settings; es.effector_type = "COLLISION"; es.surface_distance = 0.0
                for f, on in ((1, True), (fb - 2, True), (fb - 1, False)):
                    es.use_effector = on; es.keyframe_insert("use_effector", frame=max(1, f))
        geo[b].free(); sgeo[b].free()

    # --- the domain: the paper its floor, room to pool and to drip
    W_, Dp = CFG.get("dom_w", 0.42), CFG.get("dom_d", 0.32)
    dm = bpy.data.meshes.new("domain"); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(dm); bm.free()
    dom = bpy.data.objects.new("domain", dm); sc.collection.objects.link(dom)
    H_ = ztop + 0.06 - zf
    dom.location = (0, 0, zf + H_ / 2); dom.scale = (2 * W_, 2 * Dp, H_)
    md = dom.modifiers.new("Fluid", "FLUID"); md.fluid_type = "DOMAIN"
    ds = md.domain_settings; ds.domain_type = "LIQUID"; ds.resolution_max = CFG.get("res", 96)
    ds.use_mesh = True; ds.mesh_scale = CFG.get("mesh_scale", 1); ds.use_speed_vectors = True
    ds.mesh_smoothen_pos = CFG.get("smooth_pos", 2); ds.mesh_smoothen_neg = CFG.get("smooth_neg", 2)
    ds.particle_radius = CFG.get("pradius", 1.0)
    ds.use_viscosity = True; ds.viscosity_value = CFG.get("viscosity", 1.0)
    ds.surface_tension = CFG.get("tension", 0.0)
    ds.time_scale = CFG.get("time_scale", 0.8) * SCALE
    ds.cache_directory = CFG["cache"]; ds.cache_type = "ALL"
    ds.cache_frame_start = M; ds.cache_frame_end = CFG.get("bake_to", N)
    m_l, nt_l, out_l = new_material("molten")
    nt_l.links.new(molten_bsdf(nt_l), out_l.inputs["Surface"]); dm.materials.append(m_l)
    # (the solver's mesh keeps the steps of its grid, which a mirror finish shows as blocks: smoothed - its volume kept - and subdivided)
    if CFG.get("post_smooth"):
        lam_, reps_ = CFG["post_smooth"]
        sm_ = dom.modifiers.new("smooth", "LAPLACIANSMOOTH"); sm_.lambda_factor = float(lam_); sm_.iterations = int(reps_)
        sm_.use_volume_preserve = True; sm_.use_normalized = True
    if CFG.get("post_subsurf"):
        ss_ = dom.modifiers.new("subsurf", "SUBSURF"); ss_.levels = ss_.render_levels = int(CFG["post_subsurf"])
    # the liquid is seen from its first frame; the solid until then
    dom.hide_render = True; dom.keyframe_insert("hide_render", frame=1)
    dom.hide_render = False; dom.keyframe_insert("hide_render", frame=M)
    # the swelling, keyed on the solid: from its drawn size to the liquid's first shape, over the heat's lead before its band melts
    for ob in ATOM_OBJ + [b[0] for b in BOND_OBJ]:
        fb = frame_of(ob["band"]); f0 = fb - int(round((T_MELT - T_HEAT) * FPSM))
        s0 = ob.scale.copy()
        for f in [1] + list(range(max(2, f0), fb + 1)):
            g = smooth(lin(f, f0, fb))
            k = 1 + ((FAT if "idx" in ob else BFAT) - 1) * g
            ob.scale = (s0.x * k, s0.y * k, s0.z) if "idx" not in ob else (s0.x * k, s0.y * k, s0.z * k)
            ob.keyframe_insert("scale", frame=f)
        for fc in all_fcurves(ob.animation_data.action):
            for kp in fc.keyframe_points: kp.interpolation = "BEZIER"
    for ob in COL.objects:
        if ob.type != "MESH" or "band" not in ob: continue
        ob.hide_render = False; ob.keyframe_insert("hide_render", frame=1)
        ob.hide_render = True; ob.keyframe_insert("hide_render", frame=frame_of(ob["band"]))
    if WHITE and "paper" in bpy.data.collections and CFG.get("subject_only", True):
        # (the liquid is the subject now: the subject's lights light it)
        COL.objects.link(dom)
    cyc.modifiers.new("collision", "COLLISION")

    Z_A = 0.5 * (min(a["p"].z for a in ATOMS) + max(a["p"].z for a in ATOMS))
    D_MOL = fit(ATOMS, Z_A)
    for f in range(1, N + 1):
        pool_camera(f, smoother(lin(tsec(f), 0.0, T)), D_MOL, Z_A)
    linear_keys()

    sc.frame_start, sc.frame_end = 1, N
    t0 = time.time()
    if not CFG.get("skip_bake"):
        with bpy.context.temp_override(object=dom, active_object=dom, selected_objects=[dom], scene=sc):
            bpy.ops.fluid.bake_all()
    print(f"BAKED {time.time() - t0:.0f}s", flush=True)
    if True:
        # the pool as it is drawn at the melt's last frame - every point where the camera sees it, its faces as they are -
        # kept, for the reforms that carry on from it
        sc.frame_set(N)
        ev = dom.evaluated_get(bpy.context.evaluated_depsgraph_get()); me_ = ev.to_mesh()
        co_ = np.empty(len(me_.vertices) * 3, np.float32); me_.vertices.foreach_get("co", co_)
        mw = np.array(ev.matrix_world, np.float64)
        co_ = (co_.reshape(-1, 3).astype(np.float64) @ mw[:3, :3].T + mw[:3, 3]).astype(np.float32).ravel()
        lp_ = np.empty(len(me_.loops), np.int32); me_.loops.foreach_get("vertex_index", lp_)
        st_ = np.empty(len(me_.polygons), np.int32); me_.polygons.foreach_get("loop_start", st_)
        tt_ = np.empty(len(me_.polygons), np.int32); me_.polygons.foreach_get("loop_total", tt_)
        sm_ = np.empty(len(me_.polygons), bool); me_.polygons.foreach_get("use_smooth", sm_)
        os.makedirs(CFG["out"], exist_ok=True)
        np.savez(CFG["pool"], co=co_, loops=lp_, starts=st_, totals=tt_, smooth=sm_)
        ev.to_mesh_clear()
        print(f"KEPT the pool at frame {N}: {len(co_) // 3} points", flush=True)
    finish(bloom=0.6, threshold=2.0, glow_size=0.6)
    render()


else:
    T = CFG["seconds"]
    GATHER = CFG.get("gather", 0.42)     # the share of the piece in which A's pool draws up into the drop
    HOLD = CFG.get("hold", 0.16)         # the share it sits as the drop, wobbling
    MOLTEN = CFG.get("molten_rgb", (1.0, 0.71, 0.29, 1))

    for ob in list(COL.objects):
        ob.hide_render = True

    def pool(path, name):
        """A pool as its melt drew it: an object of its mesh, world coordinates, its faces smooth where they were."""
        d = np.load(path)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(d["co"]) // 3); me.vertices.foreach_set("co", d["co"])
        me.loops.add(len(d["loops"])); me.loops.foreach_set("vertex_index", d["loops"])
        me.polygons.add(len(d["starts"])); me.polygons.foreach_set("loop_start", d["starts"]); me.polygons.foreach_set("loop_total", d["totals"])
        me.update(calc_edges=True); me.validate()
        me.polygons.foreach_set("use_smooth", d["smooth"].astype(bool))
        ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
        return ob, d["co"].reshape(-1, 3).astype(np.float64)

    PA, ca = pool(CFG["pools"][0], "poolA")
    PB, cb = pool(CFG["pools"][1], "poolB")

    def volume(path):
        """The liquid a pool holds: its faces fanned into triangles, the signed volumes they close with the origin summed."""
        d = np.load(path); co = d["co"].reshape(-1, 3).astype(np.float64); lp = d["loops"]; st = d["starts"]; tt = d["totals"]
        v = 0.0
        for k in range(1, int(tt.max()) - 1):
            has = tt > k + 1
            a, b, c = co[lp[st[has]]], co[lp[st[has] + k]], co[lp[st[has] + k + 1]]
            v += float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum()) / 6.0
        return abs(v)

    # --- the drop: half a flattened ellipsoid on the paper, where the two pools are, holding their liquid between them
    FLOOR = min(ca[:, 2].min(), cb[:, 2].min())
    both = np.vstack([ca, cb])
    C = Vector((float(both[:, 0].mean()), float(both[:, 1].mean()), FLOOR))
    VA, VB = volume(CFG["pools"][0]), volume(CFG["pools"][1]); V = 0.5 * (VA + VB)
    SQ = CFG.get("squat", 0.55)                                           # its height against its radius
    R = (V / (2.0 / 3.0 * math.pi * SQ)) ** (1.0 / 3.0)
    RZ = R * SQ
    print(f"REFORM pools {VA * 1e6:.1f} and {VB * 1e6:.1f} cm3, drop radius {R * 1000:.1f} mm, height {RZ * 1000:.1f} mm", flush=True)

    def on_drop(co, main, inner=1.0):
        """Each point of a pool moved on to the drop, along its direction from the drop's middle: a point on the paper to the
        drop's rim, one above it to the drop's top; a drop of another part than the pool's main one just inside (hidden)."""
        d = co - np.array([C.x, C.y, C.z])
        d[:, 2] = np.maximum(d[:, 2], 0.0)
        q = np.sqrt((d[:, 0] / R) ** 2 + (d[:, 1] / R) ** 2 + (d[:, 2] / RZ) ** 2)
        q = np.maximum(q, 1e-9)
        k = np.where(main, inner, inner * 0.94)
        out = np.array([C.x, C.y, C.z]) + d / q[:, None] * k[:, None]
        out[:, 2] = np.maximum(out[:, 2], FLOOR)
        return out

    def main_part(ob):
        """Which of a pool's points are in its largest piece (its drops apart from it are not)."""
        me = ob.data; n = len(me.vertices); parent = list(range(n))
        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]; x = parent[x]
            return x
        for e in me.edges:
            a_, b_ = find(e.vertices[0]), find(e.vertices[1])
            if a_ != b_: parent[a_] = b_
        roots = np.array([find(i) for i in range(n)])
        big = np.bincount(roots).argmax()
        return roots == big

    # (B's drop just inside A's: A fades out over it at the swap, so that where their surfaces differ by how each is made of
    # faces, one dissolves into the other)
    for ob, co, inner in ((PA, ca, 1.0), (PB, cb, CFG.get("inner", 0.996))):
        ob.shape_key_add(name="Basis", from_mix=False)
        k = ob.shape_key_add(name="drop", from_mix=False)
        k.data.foreach_set("co", on_drop(co, main_part(ob), inner).astype(np.float32).ravel())
        # (the drop's wobble: up and narrower, then back - surface tension pulling it round as it settles)
        w = ob.shape_key_add(name="tall", from_mix=False)
        dd = on_drop(co, main_part(ob), inner) - np.array([C.x, C.y, C.z])
        dd[:, 2] *= 1.12; dd[:, 0] *= 0.95; dd[:, 1] *= 0.95
        w.data.foreach_set("co", (dd + np.array([C.x, C.y, C.z])).astype(np.float32).ravel())
        w.relative_key = k

    # --- the molten metal, as the melt draws it
    m_l, nt_l, out_l = new_material("molten")
    pr = nnew(nt_l, "ShaderNodeBsdfPrincipled", Roughness=CFG.get("molten_rough", 0.08), IOR=1.45, **{"Coat Weight": 0.6, "Coat Roughness": 0.02})
    pr.inputs["Base Color"].default_value = MOLTEN
    pr.inputs["Transmission Weight"].default_value = CFG.get("trans", 0.0)
    if CFG.get("molten_metal", True): pr.inputs["Metallic"].default_value = 1.0
    pr.inputs["Subsurface Weight"].default_value = CFG.get("sss", 0.0)
    pr.inputs["Subsurface Radius"].default_value = (0.012, 0.006, 0.002)
    nt_l.links.new(pr.outputs[0], out_l.inputs["Surface"])
    m_a = m_l.copy(); m_a.name = "molten-fading"
    nta = m_a.node_tree; outa = next(n for n in nta.nodes if n.type == "OUTPUT_MATERIAL"); pra = next(n for n in nta.nodes if n.type == "BSDF_PRINCIPLED")
    fa = attr(nta, "fade"); tra = nnew(nta, "ShaderNodeBsdfTransparent")
    mxa = nnew(nta, "ShaderNodeMixShader"); nta.links.new(fa.outputs["Fac"], mxa.inputs[0]); nta.links.new(tra.outputs[0], mxa.inputs[1]); nta.links.new(pra.outputs[0], mxa.inputs[2])
    nta.links.new(mxa.outputs[0], outa.inputs["Surface"])
    PA.data.materials.append(m_a); PB.data.materials.append(m_l)
    for ob in (PA, PB):
        if WHITE and CFG.get("subject_only", True): COL.objects.link(ob)

    lights, cyc = studio()

    # --- the timing: A draws up (eased), the drop wobbles once, B spreads out (eased); the swap at the drop
    F_SWAP = None
    for f in range(1, N + 1):
        u = f / (N + 1)                                   # (its frames between A's pool and B's: neither is one of them)
        ga = in_out(lin(u, 0.0, GATHER), 2.4)
        gb = in_out(lin(u, GATHER + HOLD, 1.0), 2.4)
        wob = math.sin(math.pi * lin(u, GATHER - 0.06, GATHER + HOLD + 0.04)) * math.exp(-2.0 * lin(u, GATHER, GATHER + HOLD))
        a_side = u < GATHER + 0.5 * HOLD
        if not a_side and F_SWAP is None: F_SWAP = f
        for ob, g in ((PA, ga), (PB, 1 - gb)):
            ob.data.shape_keys.key_blocks["drop"].value = g; ob.data.shape_keys.key_blocks["drop"].keyframe_insert("value", frame=f)
            ob.data.shape_keys.key_blocks["tall"].value = max(0.0, wob) * g; ob.data.shape_keys.key_blocks["tall"].keyframe_insert("value", frame=f)
    XF = CFG.get("dissolve", 6)                           # frames over which A fades out over B, about the swap
    f0, f1 = F_SWAP - XF // 2, F_SWAP - XF // 2 + XF
    PA.hide_render = False; PA.keyframe_insert("hide_render", frame=1)
    PA.hide_render = True; PA.keyframe_insert("hide_render", frame=f1)
    PB.hide_render = True; PB.keyframe_insert("hide_render", frame=1)
    PB.hide_render = False; PB.keyframe_insert("hide_render", frame=f0)
    for f in range(1, N + 1):
        PA["fade"] = 1.0 - smooth(lin(f, f0 - 0.5, f1 - 0.5)); PA.keyframe_insert('["fade"]', frame=f)

    for f in range(1, N + 1):
        pool_camera(f, 1.0)
    for a in bpy.data.actions:
        for fc in all_fcurves(a):
            if fc.data_path == "hide_render": continue
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
    print(f"REFORM swap at frame {F_SWAP} of {N}", flush=True)
    finish(bloom=0.6, threshold=2.0, glow_size=0.6)
    render()
