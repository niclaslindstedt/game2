# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# THE BLENDER SHELF: what every modelled asset is built from — the scene, the
# materials, the lofts and tubes and boxes a part is made of, the studio it is
# photographed in (a gravel stage at the edge of a wood), and the export to
# the game's budget with its LODs. One builder per KIND of asset (`car.py`,
# …) imports it; `scripts/blender.mjs` is how any of them is run, and the
# `blender-assets` skill owns the loop.
#
# Every builder states its asset in the frame the game's own data is in and
# leaves nothing to turn: a car is modelled in its body frame (see
# `car.py`), and the glTF export's own axis change lands it there.
#
#   QUALITY=render   studio stills: subdivided twice, bevelled
#   QUALITY=game     the real-time budget: GAME is true, and every helper
#                    spends fewer segments
#   VIEWS=a,b        only these cameras (`none`: no stills at all — `make models`,
#                    which only wants the glTFs)
#
# THE RIG. An asset is exported as RIGID PARTS on a rig: every part rides one
# bone (`rides`) and is its own named mesh (`part`), parented to that bone —
# never skinned, never joined across parts, because the game takes each part
# over as a mesh of its own (a car's bumper is what flies off it). A builder
# registers each bone (`bone`) and the CLIPS (`clip`) that play the bones
# over time, one glTF animation each.

import bpy, bmesh, math, os
from mathutils import Euler, Matrix, Quaternion, Vector

GAME = os.environ.get("QUALITY") == "game"
FPS = 30
RIDES = "root"
PART = "body"
BONES = {"root": dict(head=(0, 0, 0), tail=(0, -0.3, 0), parent=None, deform=True)}
CLIPS = []

def rides(name):
    """Every object made from here on rides this bone."""
    global RIDES
    RIDES = name
    return name

def part(name):
    """Every object made from here on is joined into the part of this name —
    one mesh in the glTF, the unit the game takes over."""
    global PART
    PART = name
    return name

def bone(name, head, tail, parent="root", extras=None):
    """A bone of the rig, in the asset's frame. It turns about its own axis
    (head → tail) in a clip, and lifts along the asset's up; `extras` are
    written into the glTF on the bone's node."""
    BONES[name] = dict(head=tuple(head), tail=tuple(tail), parent=parent, deform=True, extras=extras or {})
    return name

def clip(name, seconds, at):
    """A clip: `at(t)` gives, for every bone it moves, a `lift` (m, up the
    asset's z) and a `turn` (rad, about the bone's own axis)."""
    CLIPS.append((name, seconds, at))

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = scene.collection

# ---------------------------------------------------------------- materials
def mat(name, color, metal=0.0, rough=0.5, coat=0.0, emit=None, emit_str=0.0, glass=False, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    p = m.node_tree.nodes.get("Principled BSDF")
    def s(key, val):
        if key in p.inputs:
            p.inputs[key].default_value = val
    s("Base Color", (*color, 1.0))
    s("Metallic", metal)
    s("Roughness", rough)
    s("Coat Weight", coat)
    s("Coat Roughness", 0.05)
    if emit:
        s("Emission Color", (*emit, 1.0))
        s("Emission Strength", emit_str)
    if glass:
        s("Transmission Weight", 1.0)
        s("IOR", 1.5)
    if alpha < 1.0:
        s("Alpha", alpha)
    m.diffuse_color = (*color, 1.0)
    return m

# ---------------------------------------------------------------- helpers
def interp(pts, t):
    """Piecewise LINEAR through (t, value) knots — the game's own profile
    sampling, so a modelled panel stands where the game's does."""
    if t <= pts[0][0]:
        return pts[0][1]
    for (a, va), (b, vb) in zip(pts, pts[1:]):
        if t <= b:
            u = 0.0 if b == a else (t - a) / (b - a)
            return va + (vb - va) * u
    return pts[-1][1]

def catmull(points, closed=False, n=8):
    P = [Vector(p) for p in points]
    out = []
    count = len(P) if closed else len(P) - 1
    for i in range(count):
        p0 = P[(i - 1) % len(P)] if (closed or i > 0) else P[i]
        p1 = P[i]
        p2 = P[(i + 1) % len(P)]
        p3 = P[(i + 2) % len(P)] if (closed or i + 2 < len(P)) else P[(i + 1) % len(P)]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-1])
    return out

def link(ob):
    COL.objects.link(ob)
    ob["bone"] = RIDES
    ob["part"] = PART
    return ob

def mesh_obj(name, verts, faces, mats, face_mats=None, smooth=True, recalc=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    for m in mats:
        me.materials.append(m)
    if face_mats:
        me.polygons.foreach_set("material_index", face_mats)
    me.polygons.foreach_set("use_smooth", [smooth] * len(me.polygons))
    me.update()
    return link(bpy.data.objects.new(name, me))

def loft(name, rings, mats, closed=True, cap=True, face_mat=None, smooth=True):
    M = len(rings[0])
    verts = [v for r in rings for v in r]
    faces, fm = [], []
    span = M if closed else M - 1
    for i in range(len(rings) - 1):
        a, b = i * M, (i + 1) * M
        for j in range(span):
            j1 = (j + 1) % M
            faces.append([a + j, a + j1, b + j1, b + j])
            if face_mat:
                c = sum((verts[k] for k in faces[-1]), Vector()) / 4
                fm.append(face_mat(c))
    if cap:
        for ring_i in (0, len(rings) - 1):
            base = ring_i * M
            c = sum((verts[base + j] for j in range(M)), Vector()) / M
            ci = len(verts)
            verts.append(c)
            for j in range(M):
                faces.append([base + j, base + (j + 1) % M, ci])
                if face_mat:
                    fm.append(face_mat(c))
    return mesh_obj(name, verts, faces, mats, fm or None, smooth)

def superellipse(w, h, n, M):
    """A rounded rectangle, `w` × `h` half-sizes, squareness `n` (2 an
    ellipse, 6 nearly square), as M points round from +x."""
    ring = []
    for k in range(M):
        th = 2 * math.pi * k / M
        c, s = math.cos(th), math.sin(th)
        ring.append((math.copysign(abs(c) ** (2 / n), c) * w, math.copysign(abs(s) ** (2 / n), s) * h))
    return ring

def tube(name, points, r, m, smooth_n=0, closed=False, res=4):
    if GAME:
        smooth_n = min(smooth_n, 3)
        res = min(res, 1)
    pts = catmull(points, closed, smooth_n) if smooth_n else [Vector(p) for p in points]
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = res
    cu.use_fill_caps = not closed
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, co in zip(sp.points, pts):
        p.co = (co.x, co.y, co.z, 1.0)
    sp.use_cyclic_u = closed
    sp.use_smooth = True
    cu.materials.append(m)
    return link(bpy.data.objects.new(name, cu))

def orient(a, b):
    d = (Vector(b) - Vector(a))
    return d.length, d.to_track_quat("Z", "Y").to_matrix().to_4x4()

def cyl(name, a, b, r, m, seg=24, r2=None, smooth=True, caps=True):
    if GAME:
        seg = max(6, seg // 3) if r < 0.03 else max(10, seg // 2)
    L, R = orient(a, b)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=seg, radius1=r,
                          radius2=r if r2 is None else r2, depth=L)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, L / 2))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(a)) @ R, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(m)
    ob = link(bpy.data.objects.new(name, me))
    if smooth:
        for p in me.polygons:
            p.use_smooth = abs(p.normal.dot((R.to_3x3() @ Vector((0, 0, 1))))) < 0.9
    return ob

def box(name, center, size, m, rot=(0, 0, 0), bevel=0.004):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ Euler(rot).to_matrix().to_4x4(),
                        verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(m)
    ob = link(bpy.data.objects.new(name, me))
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1 if GAME else 2
    return ob

def ellipsoid(name, center, radii, m, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10 if GAME else 24, v_segments=6 if GAME else 12, radius=1.0)
    bmesh.ops.scale(bm, vec=radii, verts=bm.verts)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ Euler(rot).to_matrix().to_4x4(),
                        verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    return link(bpy.data.objects.new(name, me))

def lathe(name, profile, seg, m_of=None, mats=(), axis_x=True, smooth=True):
    """A solid of revolution about the x axis (a wheel's axle): `profile` is
    (x, r) points in order, swept `seg` times round. `m_of(i)` picks the
    material index of the band from profile point i to i + 1."""
    verts, faces, fm = [], [], []
    P = len(profile)
    for k in range(seg):
        a = 2 * math.pi * k / seg
        c, s = math.cos(a), math.sin(a)
        for x, r in profile:
            verts.append(Vector((x, r * c, r * s)))
    for k in range(seg):
        k1 = (k + 1) % seg
        for i in range(P - 1):
            if profile[i][1] < 1e-6 and profile[i + 1][1] < 1e-6:
                continue
            faces.append([k * P + i, k * P + i + 1, k1 * P + i + 1, k1 * P + i])
            fm.append(m_of(i) if m_of else 0)
    return mesh_obj(name, verts, faces, list(mats), fm, smooth)

def crease(ob, edge_ok):
    """Crease the edges `edge_ok(v0, v1) -> weight or None` picks: what a
    subdivision surface keeps sharp."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    layer = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
    for e in bm.edges:
        w = edge_ok(e.verts[0].index, e.verts[1].index)
        if w:
            e[layer] = w
    bm.to_mesh(ob.data)
    bm.free()

def subdivide(ob, game=1, render=2):
    sub = ob.modifiers.new("smooth", "SUBSURF")
    sub.levels = game if GAME else render
    sub.render_levels = sub.levels
    return sub

# ---------------------------------------------------------------- the STUDIO and the EXPORT
def _tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        if o.type == "MESH":
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            n += len(me.loop_triangles)
            o.evaluated_get(dg).to_mesh_clear()
    return n

def _select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

def _gravel():
    """A gravel stage's surface: grey-brown stone in two sizes of noise, a
    bump to catch the low sun."""
    m = bpy.data.materials.new("gravel")
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    p = nt.nodes.get("Principled BSDF")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 90.0
    fine.inputs["Detail"].default_value = 6.0
    coarse = nt.nodes.new("ShaderNodeTexNoise")
    coarse.inputs["Scale"].default_value = 6.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.1, 0.075, 0.05, 1)
    ramp.color_ramp.elements[1].color = (0.33, 0.25, 0.17, 1)
    mix = nt.nodes.new("ShaderNodeMath")
    mix.operation = "MULTIPLY_ADD"
    mix.inputs[1].default_value = 0.35
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    nt.links.new(coord.outputs["Object"], fine.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], coarse.inputs["Vector"])
    nt.links.new(fine.outputs["Fac"], mix.inputs[0])
    nt.links.new(coarse.outputs["Fac"], mix.inputs[2])
    nt.links.new(mix.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])
    nt.links.new(fine.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
    p.inputs["Roughness"].default_value = 0.92
    return m

def _studio(centre, size, floor=0.0):
    """A gravel floor, a summer sky, a low sun and a fill, a wood standing
    round the clearing, and five cameras round `centre`, at distances in
    proportion to the asset's `size` (m)."""
    bpy.ops.mesh.primitive_plane_add(size=80, location=(centre[0], centre[1], floor - 0.001))
    bpy.context.active_object.data.materials.append(_gravel())
    world = bpy.data.worlds.new("sky")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    nt = world.node_tree
    bg = nt.nodes.get("Background")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.62, 0.72, 0.82, 1)
    ramp.color_ramp.elements[1].color = (0.2, 0.36, 0.66, 1)
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs[0])
    bg.inputs[1].default_value = 1.0
    del grad
    # The wood: dark cones on a ring round the clearing, far enough out to
    # read as the edge of a forest stage and never as props beside the car.
    pine = mat("pine", (0.04, 0.09, 0.05), rough=0.9)
    trunk = mat("bark", (0.09, 0.06, 0.04), rough=0.9)
    for i in range(34):
        a = 2 * math.pi * i / 34 + 0.37 * math.sin(i * 2.3)
        d = 17 + 5 * (0.5 + 0.5 * math.sin(i * 1.7))
        h = 7 + 3 * (0.5 + 0.5 * math.cos(i * 2.9))
        x, y = centre[0] + d * math.cos(a), centre[1] + d * math.sin(a)
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=h * 0.22, radius2=0, depth=h * 0.8,
                                        location=(x, y, floor + h * 0.6))
        bpy.context.active_object.data.materials.append(pine)
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.14, depth=h * 0.3,
                                            location=(x, y, floor + h * 0.15))
        bpy.context.active_object.data.materials.append(trunk)
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 4.2
    sun.angle = math.radians(1.5)
    sun.color = (1.0, 0.95, 0.86)
    COL.objects.link(so := bpy.data.objects.new("sun", sun))
    so.rotation_euler = (math.radians(52), math.radians(8), math.radians(-35))
    fill = bpy.data.lights.new("fill", "AREA")
    fill.energy = 260
    fill.size = 5
    COL.objects.link(fo := bpy.data.objects.new("fill", fill))
    fo.location = (-5, -4, 3.5)
    fo.rotation_euler = (math.radians(58), 0, math.radians(-50))
    target = bpy.data.objects.new("target", None)
    COL.objects.link(target)
    target.location = centre
    k = size / 4.0   # the distances were set on a 4 m car; forward is −y
    c = Vector(centre)
    cams = {}
    for name, off, lens in (("side", (9.0, 0, 0.55), 58), ("three", (-4.2, -4.6, 1.5), 38),
                            ("rear3", (4.0, 4.9, 1.6), 38), ("chase", (0, 7.2, 2.1), 40),
                            ("detail", (2.6, -2.9, 0.8), 45)):
        cd = bpy.data.cameras.new(name)
        cd.lens = lens
        cam = bpy.data.objects.new(name, cd)
        COL.objects.link(cam)
        cam.location = c + Vector(off) * k
        tt = cam.constraints.new("TRACK_TO")
        tt.target = target
        tt.track_axis = "TRACK_NEGATIVE_Z"
        tt.up_axis = "UP_Y"
        cams[name] = cam
    return cams

def _cycles(samples):
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for dv in prefs.devices:
            dv.use = True
        scene.cycles.device = "GPU"
    except Exception as e:
        print("GPU setup failed, on the CPU:", e)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"

def _rig(root):
    """The armature from `BONES`, and every part parented to the bone it
    rides — rigidly, at rest, so the glTF carries each part as a mesh node
    under its bone's node."""
    arm_data = bpy.data.armatures.new("rig")
    arm = bpy.data.objects.new("rig", arm_data)
    COL.objects.link(arm)
    arm.parent = root
    _select_only([arm])
    bpy.ops.object.mode_set(mode="EDIT")
    for n, b in BONES.items():
        eb = arm_data.edit_bones.new(n)
        eb.head, eb.tail = b["head"], b["tail"]
        eb.use_deform = b["deform"]
    for n, b in BONES.items():
        if b["parent"]:
            arm_data.edit_bones[n].parent = arm_data.edit_bones[b["parent"]]
    bpy.ops.object.mode_set(mode="OBJECT")
    for n, b in BONES.items():
        pb = arm.pose.bones[n]
        pb.rotation_mode = "QUATERNION"
        for holder in (pb, arm_data.bones[n]):
            for k, v in b.get("extras", {}).items():
                holder[k] = v
    bpy.context.view_layer.update()
    for o in list(root.children):
        if o.type != "MESH" or o is arm:
            continue
        world = o.matrix_world.copy()
        o.parent = arm
        o.parent_type = "BONE"
        o.parent_bone = o["bone"]
        bpy.context.view_layer.update()
        o.matrix_world = world
    return arm

def _clips(arm):
    """Every registered clip keyed on its bones a frame at a time and laid on
    an NLA track of its name — one glTF animation each. The rest pose is
    left live for the stills."""
    if not CLIPS:
        return
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    scene.render.fps = FPS
    arm.animation_data_create()
    names = []
    for name, seconds, at in CLIPS:
        n = round(seconds * FPS)
        act = bpy.data.actions.new(name)
        arm.animation_data.action = act
        for f in range(n + 1):
            for b_name, d in at(f / FPS).items():
                pb = arm.pose.bones[b_name]
                rest = arm.data.bones[b_name].matrix_local.to_3x3()
                pb.location = rest.inverted() @ Vector((0, 0, d.get("lift", 0.0)))
                pb.rotation_quaternion = Quaternion((0, 1, 0), d.get("turn", 0.0))
                pb.keyframe_insert("location", frame=f)
                pb.keyframe_insert("rotation_quaternion", frame=f)
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, act)
        track.mute = True       # or it plays under the next clip's keys
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.location, pb.rotation_quaternion = (0, 0, 0), (1, 0, 0, 0)
        names.append(f"{name} {seconds:g}s")
    arm.animation_data.use_nla = False     # the stills are of the car at rest
    for track in arm.animation_data.nla_tracks:
        track.mute = False
    scene.frame_set(0)
    print("CLIPS", ", ".join(names))

def _join_parts(root):
    """Every modifier baked in, then ONE mesh per part (`part`), named after
    it: the unit the game takes over."""
    kids = [o for o in root.children if o.type == "MESH"]
    _select_only(kids)
    bpy.ops.object.convert(target="MESH")
    by = {}
    for o in root.children:
        if o.type == "MESH":
            by.setdefault(o["part"], []).append(o)
    for name, objs in by.items():
        _select_only(objs)
        bone_of = objs[0]["bone"]
        if len(objs) > 1:
            bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        o.name = o.data.name = name
        o["part"], o["bone"] = name, bone_of
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)
        bm.to_mesh(o.data)
        bm.free()

def finish(name, out, samples, centre, size, lods=(("lod1", 0.4), ("lod2", 0.14)), extras=None, floor=0.0,
           studio_only=()):
    """Everything after the modelling: curves to meshes, the parts under one
    root (carrying `extras`), one mesh a part in the game quality, the rig
    and its clips, the studio, the renders, and — in the game quality — LOD0
    and the decimated LODs exported as glTF, every count printed (`BONES`,
    `PARTS`, `CLIPS`, `TRIANGLES`). `studio_only` objects are photographed
    and never exported."""
    curves = [o for o in COL.objects if o.type == "CURVE"]
    if curves:
        _select_only(curves)
        bpy.ops.object.convert(target="MESH")
    root = bpy.data.objects.new(name, None)
    COL.objects.link(root)
    for k, v in (extras or {}).items():
        root[k] = v
    keep_out = set(o.name for o in studio_only)
    for o in list(COL.objects):
        if o is not root and o.parent is None and o.name not in keep_out:
            o.parent = root
    if GAME:
        _join_parts(root)
        counts = {o.name: _tri_count([o]) for o in root.children if o.type == "MESH"}
        print("PARTS", len(counts), {k: v for k, v in sorted(counts.items(), key=lambda kv: -kv[1])})
    print("BONES", len(BONES))
    arm = _rig(root)
    _clips(arm)
    cams = _studio(centre, size, floor)
    _cycles(samples)
    tag = "game" if GAME else "render"
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{name}-{tag}.blend"))

    def render(views, suffix=""):
        for v in views:
            scene.camera = cams[v]
            scene.render.filepath = os.path.join(out, f"{name}-{tag}{suffix}-{v}.png")
            bpy.ops.render.render(write_still=True)

    only = [v for v in os.environ.get("VIEWS", "").split(",") if v]
    render([v for v in cams if not only or v in only])
    parts = [o for o in root.children_recursive if o.type == "MESH"]
    print("TRIANGLES", tag, "lod0", _tri_count(parts))
    if not GAME:
        return

    def export(path):
        _select_only([root] + list(root.children_recursive))
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_apply=True, export_extras=True,
                                  export_skins=False, export_animations=True,
                                  export_animation_mode="NLA_TRACKS", export_def_bones=False)

    export(os.path.join(out, f"{name}-lod0.glb"))
    # The lower LODs are a blind decimation: fine at range, torn up close.
    for lod, ratio in lods:
        for o in parts:
            d = o.modifiers.new("lod", "DECIMATE")
            d.ratio = ratio
            d.use_collapse_triangulate = True
        print("TRIANGLES", tag, lod, _tri_count(parts))
        export(os.path.join(out, f"{name}-{lod}.glb"))
        render([v for v in ("chase", "three") if not only or v in only], "-" + lod)
        for o in parts:
            o.modifiers.remove(o.modifiers["lod"])
