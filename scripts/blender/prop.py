# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# THE PROPS MODELLED IN BLENDER: one KIND's ids (`make blender KIND=prop
# ID=<kind>`) over the SKELETON each id's own code factory lays
# (`scripts/lib/prop-model-data.mjs`: every box, cylinder, cone and blob
# with its whole frame and the ROLE it is painted in) — handed in as one
# JSON file by `scripts/blender.mjs`, the driver and the only way this
# runs. What this adds is the MODELLING, part by part and kind by kind: a
# box becomes a panel with real edges, a cylinder a turned round thing, a
# wheel a tyre with shoulders and a dished rim, a beast's boxes one lofted
# body on round legs, a stone a faceted lump, a figure a person with
# shoulders and boots, a cone a cone with its band and its base.
#
# THE FRAME. The code geometry's own metres and frame — y up, the nose
# along +z, as each factory stands its thing — turned for Blender: a game
# point (x, y, z) is modelled at (x, -z, y), a rotation and not a mirror,
# and the glTF export turns it straight back, so the game reads a model in
# the very frame the code's geometry stood in.
#
# DRESSED BY THE GAME. A model carries no colour of its own: every face's
# material is NAMED for its ROLE (`prop-models.ts`), and every vertex a
# SHADE in its colour attribute's first channel. `propModel` turns that
# into the caller's own colours as the code's builder painted its own.

import json, math, os, random, sys
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
from lib import GAME, COL, scene, mat

argv = sys.argv[sys.argv.index("--") + 1:]
DATA = json.load(open(argv[0]))
OUT = argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 24
KIND = DATA["kind"]
PAINT = DATA["paint"]

# ---------------------------------------------------------------- materials
MATS = {}

def material(role):
    """One material a role: grey in the game's file (the game reads only
    the name), the role's own colour for the stills."""
    if role in MATS:
        return MATS[role]
    rgb = PAINT.get(role, {"rgb": [0.5, 0.5, 0.5]})["rgb"]
    m = mat(role, (0.5, 0.5, 0.5) if GAME else tuple(rgb), rough=0.7 if role != "glass" else 0.2,
            metal=0.0)
    if not GAME:
        nt = m.node_tree
        p = nt.nodes.get("Principled BSDF")
        attr = nt.nodes.new("ShaderNodeAttribute")
        attr.attribute_name = "tone"
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(attr.outputs["Color"], sep.inputs[0])
        shade = nt.nodes.new("ShaderNodeMix")
        shade.data_type = "RGBA"
        shade.blend_type = "MULTIPLY"
        shade.inputs[0].default_value = 1.0
        shade.inputs[6].default_value = (*rgb, 1)
        nt.links.new(sep.outputs[0], shade.inputs[7])
        nt.links.new(shade.outputs[2], p.inputs["Base Color"])
    MATS[role] = m
    return m

# ---------------------------------------------------------------- the MESH being built
def norm(v):
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1.0
    return (v[0] / l, v[1] / l, v[2] / l)

def V(p):
    """A game point (x, y up, z) in Blender's frame."""
    return Vector((p[0], -p[2], p[1]))

class Mesh:
    """A mesh under construction: every vertex with its shade and — where
    given — its own normal; every face its role."""

    def __init__(self):
        self.co, self.tone, self.nrm, self.faces, self.roles = [], [], [], [], []

    def v(self, p, shade=1.0, n=None):
        self.co.append((p[0], p[1], p[2]))
        self.tone.append((max(0.0, min(1.0, shade)), 0.0, 0.0))
        self.nrm.append(n)
        return len(self.co) - 1

    def f(self, idx, role):
        """A face — wound the way its own normals point: a ring laid the
        other way round is turned here, so no form has to know which way
        its frame runs (the game culls a face wound inward)."""
        idx = tuple(idx)
        ns = [self.nrm[i] for i in idx]
        if len(idx) >= 3 and all(n is not None for n in ns):
            a, b, c = (Vector(self.co[idx[k]]) for k in (0, 1, 2))
            wound = (b - a).cross(c - a)
            mean = sum((Vector(n) for n in ns), Vector())
            if wound.dot(mean) < 0:
                idx = tuple(reversed(idx))
        self.faces.append(idx)
        self.roles.append(role)
        material(role)

    def flat(self, pts, role, shade=1.0, flip=False):
        """A flat face of its own vertices, lit by its own plane."""
        pts = [Vector(p) for p in pts]
        n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        if n.length < 1e-12:
            return
        n = n.normalized()
        if flip:
            pts = list(reversed(pts))
            n = -n
        self.f([self.v(p, shade, tuple(n)) for p in pts], role)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def object(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.co, [], self.faces)
        me.validate(clean_customdata=False)
        used = sorted(set(self.roles))
        for k in used:
            me.materials.append(MATS[k])
        me.polygons.foreach_set("material_index", [used.index(r) for r in self.roles])
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        tone = me.color_attributes.new("tone", "FLOAT_COLOR", "POINT")
        for i, (r, g, b) in enumerate(self.tone):
            tone.data[i].color = (r, g, b, 1.0)
        me.color_attributes.active_color = tone
        me.color_attributes.render_color_index = 0
        me.update()
        smooth = [tuple(v.normal) for v in me.vertices]
        me.normals_split_custom_set_from_vertices(
            [n if n is not None else smooth[i] for i, n in enumerate(self.nrm)])
        ob = bpy.data.objects.new(name, me)
        COL.objects.link(ob)
        return ob

# ---------------------------------------------------------------- the SKELETON, read
def placed(p):
    """The part's own frame: a function taking a point in the PRISTINE
    primitive's frame (three's own box, cylinder, cone, sphere) to Blender's,
    the way the factory placed it (`TracedPart.m`, column-major, game
    frame)."""
    m = p["m"]
    def at(x, y, z):
        gx = m[0] * x + m[4] * y + m[8] * z + m[12]
        gy = m[1] * x + m[5] * y + m[9] * z + m[13]
        gz = m[2] * x + m[6] * y + m[10] * z + m[14]
        return Vector((gx, -gz, gy))
    return at

def role_of(p):
    return p["paint"] if isinstance(p["paint"], str) else p["paint"][0]

def parts_of(v):
    out = []
    for p in v["parts"]:
        q = dict(p)
        q["A"], q["B"] = V(p["a"]), V(p["b"])
        q["role"] = role_of(p)
        q["at"] = placed(p)
        out.append(q)
    return out

# ---------------------------------------------------------------- the FORMS
def bevel_box(t, p, bevel=None, shade=1.0, role=None, top_role=None, top_share=0.0):
    """A box with real edges: every edge chamfered, every face flat and lit
    by its own plane. `bevel` the chamfer, m (a share of the smallest side
    when left out); `top_role` paints the faces of the top `top_share` of
    its height another role (a stake's white cap)."""
    at = p["at"]
    w, h, d = p["size"]
    hx, hy, hz = w / 2, h / 2, d / 2
    c = min(0.035, 0.14 * min(w, h, d)) if bevel is None else min(bevel, 0.45 * min(w, h, d))
    role = role or p["role"]
    # Every corner's three points: the face's corner on each of its axes.
    def corner(sx, sy, sz):
        return (Vector((sx * hx, sy * (hy - c), sz * (hz - c))),
                Vector((sx * (hx - c), sy * hy, sz * (hz - c))),
                Vector((sx * (hx - c), sy * (hy - c), sz * hz)))
    S = [-1, 1]
    faces = []
    # The six faces.
    for axis in range(3):
        for sgn in S:
            quad = []
            for u in S:
                for w_ in (S if u > 0 else S[::-1]):
                    s = [0, 0, 0]
                    s[axis] = sgn
                    s[(axis + 1) % 3] = u
                    s[(axis + 2) % 3] = w_
                    quad.append(corner(*s)[axis])
            faces.append(quad)
    # The twelve edges: each between two faces' corners.
    for a in range(3):
        for b_ in range(a + 1, 3):
            other = 3 - a - b_
            for sa in S:
                for sb in S:
                    quad = []
                    for so in S:
                        s = [0, 0, 0]
                        s[a], s[b_], s[other] = sa, sb, so
                        cs = corner(*s)
                        quad.append((cs[a], cs[b_]))
                    faces.append([quad[0][0], quad[0][1], quad[1][1], quad[1][0]])
    # The eight corners.
    for sx in S:
        for sy in S:
            for sz in S:
                faces.append(list(corner(sx, sy, sz)))
    for quad in faces:
        centre = sum(quad, Vector()) / len(quad)
        n = (quad[1] - quad[0]).cross(quad[2] - quad[0])
        if n.length < 1e-12:
            continue
        if n.dot(centre) < 0:
            quad = list(reversed(quad))
        r = role
        if top_role and centre.y > hy - h * top_share:
            r = top_role
        # A face's shade: the top a touch brighter, the underside darker.
        sh = shade * (1.0 if centre.y > hy * 0.5 else 0.92 if centre.y > -hy * 0.5 else 0.8)
        t.flat([at(q.x, q.y, q.z) for q in quad], r, sh)

def ring_at(at, y, r, sides, squash=1.0, turn=0.0):
    """A ring of points round the pristine y axis at height y."""
    return [at(math.cos(2 * math.pi * j / sides + turn) * r, y, math.sin(2 * math.pi * j / sides + turn) * r * squash)
            for j in range(sides)]

def smooth_cyl(t, p, sides=None, shade=1.0, role=None, caps=True, bulge=0.0, cap_shade=0.9):
    """A cylinder or a cone turned round: many sides, smooth across them,
    flat caps; `bulge` swells the middle (a tank, a bale)."""
    at = p["at"]
    r_top, r_bot, h = p["size"]
    role = role or p["role"]
    if r_top < 1e-4 and r_bot < 1e-4:
        return
    n = sides or (6 if GAME and max(r_top, r_bot) < 0.06 else 10 if max(r_top, r_bot) < 0.3 else 14)
    levels = [(-h / 2, r_bot), (h / 2, r_top)]
    if bulge > 0:
        levels = [(-h / 2, r_bot), (0.0, (r_top + r_bot) * 0.5 * (1 + bulge)), (h / 2, r_top)]
    rings = []
    for y, r in levels:
        ring = []
        for j in range(n):
            a = 2 * math.pi * j / n
            cx, cz = math.cos(a), math.sin(a)
            q = at(cx * r, y, cz * r)
            # The normal: the surface's, taken through the frame by two
            # neighbouring points.
            o = at(0, y, 0)
            nrm = (q - o)
            ring.append(t.v(q, shade * (0.85 + 0.15 * (0.5 + 0.5 * cx)), tuple(norm(tuple(nrm)))))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for j in range(n):
            j1 = (j + 1) % n
            t.f((rings[k][j], rings[k][j1], rings[k + 1][j1], rings[k + 1][j]), role)
    if caps:
        for y, r, top in ((-h / 2, r_bot, False), (h / 2, r_top, True)):
            if r < 1e-4:
                if top:
                    # A cone's point.
                    tip = t.v(at(0, y, 0), shade, None)
                    for j in range(n):
                        t.f((rings[-1][j], rings[-1][(j + 1) % n], tip), role)
                continue
            pts = ring_at(at, y, r, n)
            t.flat(pts if top else list(reversed(pts)), role, shade * cap_shade)

def wheel(t, tyre, hub):
    """A wheel where the code stands two short cylinders on their side: a
    tyre with rounded shoulders and a tread's shading, and a dished rim
    with a centre cap and the shading of spokes."""
    at = tyre["at"]
    r = tyre["size"][0]
    w = tyre["size"][2]
    n = 12 if GAME else 20
    # The tyre: a loft along its axle (the pristine y), shouldered.
    stations = ((-w / 2, 0.8, 0.0), (-w / 2 * 0.72, 0.97, 0.0), (0.0, 1.0, 0.0), (w / 2 * 0.72, 0.97, 0.0), (w / 2, 0.8, 0.0))
    rings = []
    for y, k, _ in stations:
        ring = []
        for j in range(n):
            a = 2 * math.pi * j / n
            cx, cz = math.cos(a), math.sin(a)
            q = at(cx * r * k, y, cz * r * k)
            o = at(0, y, 0)
            side = (at(0, y + 0.01, 0) - o).normalized() * (0.0 if abs(k - 1.0) < 1e-6 else (0.6 if y > 0 else -0.6))
            nrm = ((q - o).normalized() * (1.0 if abs(k - 1.0) < 1e-6 else 0.8) + side).normalized()
            # A tread: alternate facets a shade apart.
            ring.append(t.v(q, 0.9 + 0.1 * (j % 2) if abs(k - 1.0) < 1e-6 else 0.85, tuple(nrm)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for j in range(n):
            j1 = (j + 1) % n
            t.f((rings[k][j], rings[k][j1], rings[k + 1][j1], rings[k + 1][j]), tyre["role"])
    # The sidewalls, in to the rim.
    rim_r = hub["size"][0] if hub else r * 0.55
    for y, outer, top in ((-w / 2, rings[0], False), (w / 2, rings[-1], True)):
        o = at(0, y, 0)
        axis = (at(0, y + (1 if top else -1), 0) - o).normalized()
        inner = [t.v(at(math.cos(2 * math.pi * j / n) * rim_r * 1.02, y, math.sin(2 * math.pi * j / n) * rim_r * 1.02), 0.8, tuple(axis))
                 for j in range(n)]
        for j in range(n):
            j1 = (j + 1) % n
            quad = (outer[j], outer[j1], inner[j1], inner[j])
            t.f(quad if top else tuple(reversed(quad)), tyre["role"])
    if not hub:
        return
    # The rim: a dish each side, sunk in from the tyre's face, a cap in its
    # middle standing out, ten sectors shaded light and dark for spokes.
    hat = hub["at"]
    hr = hub["size"][0]
    hw = hub["size"][2]
    for sgn in (-1, 1):
        y = sgn * hw / 2
        o = hat(0, y, 0)
        axis = (hat(0, y + sgn, 0) - o).normalized()
        outer = []
        dish = []
        for j in range(n):
            a = 2 * math.pi * j / n
            sh = 1.0 if (j * 5 // n) % 2 == 0 else 0.72
            outer.append(t.v(hat(math.cos(a) * hr, y, math.sin(a) * hr), 0.95, tuple(axis)))
            dish.append(t.v(hat(math.cos(a) * hr * 0.55, y - sgn * hw * 0.35, math.sin(a) * hr * 0.55), sh, tuple(axis)))
        cap = t.v(hat(0, y + sgn * 0.01, 0), 1.0, tuple(axis))
        for j in range(n):
            j1 = (j + 1) % n
            quad = (outer[j], outer[j1], dish[j1], dish[j])
            tri = (dish[j], dish[j1], cap)
            t.f(quad if sgn > 0 else tuple(reversed(quad)), hub["role"])
            t.f(tri if sgn > 0 else tuple(reversed(tri)), hub["role"])

def ellipsoid(t, p, shade=1.0, role=None, lumpy=0.0, rng=None, rings_n=None):
    """A sphere or an icosahedron as a smooth (or lumpy) ellipsoid."""
    at = p["at"]
    r = p["size"][0]
    role = role or p["role"]
    nu, nv = (8, 4) if GAME else (14, 7)
    if rings_n:
        nu, nv = rings_n
    rows = []
    for i in range(1, nv):
        el = -math.pi / 2 + math.pi * i / nv
        row = []
        for j in range(nu):
            az = 2 * math.pi * j / nu
            d = Vector((math.cos(el) * math.cos(az), math.sin(el), math.cos(el) * math.sin(az)))
            k = 1.0 + (lumpy * (rng.random() - 0.5) if rng else 0.0)
            q = at(d.x * r * k, d.y * r * k, d.z * r * k)
            o = at(0, 0, 0)
            row.append(t.v(q, shade * (0.75 + 0.25 * (0.5 + 0.5 * d.y)), tuple(norm(tuple(q - o)))))
        rows.append(row)
    bot = t.v(at(0, -r, 0), shade * 0.7, None)
    top = t.v(at(0, r, 0), shade, None)
    for i in range(len(rows) - 1):
        for j in range(nu):
            j1 = (j + 1) % nu
            t.f((rows[i][j], rows[i][j1], rows[i + 1][j1], rows[i + 1][j]), role)
    for j in range(nu):
        j1 = (j + 1) % nu
        t.f((rows[0][j1], rows[0][j], bot), role)
        t.f((rows[-1][j], rows[-1][j1], top), role)

def rounded_loft(t, stations, role, sides=12, shade=1.0, caps=True, n_exp=2.6):
    """A body lofted through rounded-rectangle cross-sections: each station
    `(centre, half_w, half_h, up)` in Blender space, the rings superellipses
    across `side` and `up`. Smooth across the rings; the ends closed with a
    rounded cap."""
    rings = []
    for (c, hw, hh, side, up) in stations:
        ring = []
        for j in range(sides):
            a = 2 * math.pi * j / sides
            ca, sa = math.cos(a), math.sin(a)
            x = math.copysign(abs(ca) ** (2 / n_exp), ca) * hw
            y = math.copysign(abs(sa) ** (2 / n_exp), sa) * hh
            q = c + side * x + up * y
            nrm = (side * (x / max(hw, 1e-6)) + up * (y / max(hh, 1e-6))).normalized()
            ring.append(t.v(q, shade * (0.8 + 0.2 * (0.5 + 0.5 * nrm.z)), tuple(nrm)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for j in range(sides):
            j1 = (j + 1) % sides
            t.f((rings[k][j], rings[k][j1], rings[k + 1][j1], rings[k + 1][j]), role)
    if caps:
        for ring, (c, hw, hh, side, up), first in ((rings[0], stations[0], True), (rings[-1], stations[-1], False)):
            axis = (stations[1][0] - stations[0][0]).normalized() if first else (stations[-1][0] - stations[-2][0]).normalized()
            centre = t.v(c + axis * (-(hw + hh) * 0.12 if first else (hw + hh) * 0.12), shade * 0.9, tuple(axis * (-1 if first else 1)))
            for j in range(sides):
                j1 = (j + 1) % sides
                t.f((ring[j1], ring[j], centre) if first else (ring[j], ring[j1], centre), role)
    return rings

def lump(t, p, rng, shade=1.0, role=None, detail=1):
    """A stone: an icosphere pushed in and out at random, every face flat."""
    at = p["at"]
    r = p["size"][0]
    role = role or p["role"]
    phi = (1 + math.sqrt(5)) / 2
    base = [(-1, phi, 0), (1, phi, 0), (-1, -phi, 0), (1, -phi, 0), (0, -1, phi), (0, 1, phi), (0, -1, -phi),
            (0, 1, -phi), (phi, 0, -1), (phi, 0, 1), (-phi, 0, -1), (-phi, 0, 1)]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
             (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11),
             (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    pts = [Vector(b).normalized() for b in base]
    for _ in range(detail):
        mids = {}
        nf = []
        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in mids:
                pts.append((pts[a] + pts[b]).normalized())
                mids[key] = len(pts) - 1
            return mids[key]
        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = nf
    bumps = [(Vector((rng.random() - 0.5, rng.random() - 0.5, rng.random() - 0.5)).normalized(), 0.1 + 0.2 * rng.random())
             for _ in range(5)]
    world = []
    for q in pts:
        k = 0.88 + sum(amp * max(0.0, q.dot(d)) ** 2 for d, amp in bumps) + 0.04 * (rng.random() - 0.5)
        world.append(at(q.x * r * k, q.y * r * k, q.z * r * k))
    for a, b, c in faces:
        n = (world[b] - world[a]).cross(world[c] - world[a])
        if n.length < 1e-12:
            continue
        n = n.normalized()
        sh = shade * (0.68 + 0.32 * (0.5 + 0.5 * n.z))
        t.f((t.v(world[a], sh, tuple(n)), t.v(world[b], sh, tuple(n)), t.v(world[c], sh, tuple(n))), role)

# ---------------------------------------------------------------- the KINDS
def is_wheel_pair(tyre, hub):
    """A hub cylinder standing in a tyre: the same axle, inside it."""
    if hub["role"] not in ("hub",) or tyre["role"] not in ("tyre", "wheel"):
        return False
    return (hub["A"] + hub["B"] - tyre["A"] - tyre["B"]).length < 0.08 and hub["size"][0] < tyre["size"][0]

def generic(t, parts, rng, skip=()):
    """Every part by its primitive: boxes with edges, round things turned,
    wheels as wheels, blobs as ellipsoids."""
    done = set(id(p) for p in skip)
    tyres = [p for p in parts if p["type"] == "CylinderGeometry" and p["role"] in ("tyre", "wheel")]
    hubs = [p for p in parts if p["type"] == "CylinderGeometry" and p["role"] == "hub"]
    for tyre in tyres:
        if id(tyre) in done:
            continue
        hub = next((h for h in hubs if id(h) not in done and is_wheel_pair(tyre, h)), None)
        wheel(t, tyre, hub)
        done.add(id(tyre))
        if hub:
            done.add(id(hub))
    for p in parts:
        if id(p) in done:
            continue
        ty = p["type"]
        if ty == "BoxGeometry":
            bevel_box(t, p)
        elif ty in ("CylinderGeometry", "ConeGeometry"):
            smooth_cyl(t, p)
        elif ty in ("IcosahedronGeometry", "SphereGeometry", "DodecahedronGeometry"):
            ellipsoid(t, p)
        elif ty == "PlaneGeometry":
            at = p["at"]
            w, h = p["size"][0], p["size"][1]
            t.flat([at(-w / 2, -h / 2, 0), at(w / 2, -h / 2, 0), at(w / 2, h / 2, 0), at(-w / 2, h / 2, 0)], p["role"])
        done.add(id(p))

def livestock(t, v, parts, rng):
    """A cow: its boxes of hide lofted into one body — the barrel, the
    chest and the rump as stations — on round legs, a rounded head; a
    sheep: a lumpy fleece on its thin legs."""
    hide = [p for p in parts if p["type"] == "BoxGeometry" and p["role"] in ("srb", "holstein")
            and p["size"][0] > 0.5 and p["size"][1] > 0.5]
    skip = []
    if len(hide) >= 3:
        # Stations along the beast (game z, Blender -y): each box a ring.
        boxes = sorted(hide, key=lambda p: p["at"](0, 0, 0).y)
        up = Vector((0, 0, 1))
        side = Vector((1, 0, 0))
        stations = []
        for i, p in enumerate(boxes):
            c = p["at"](0, 0, 0)
            w, h, d = p["size"]
            half_d = d / 2
            fwd = Vector((0, -1, 0))
            if i == 0:
                stations.append((c + fwd * half_d * 0.95, w / 2 * 0.72, h / 2 * 0.8, side, up))
            stations.append((c, w / 2, h / 2, side, up))
            if i == len(boxes) - 1:
                stations.append((c - fwd * half_d * 0.95, w / 2 * 0.72, h / 2 * 0.8, side, up))
        # The rear (game -z) is the higher Blender y: the loft runs tail to
        # chest, so order the stations by Blender y descending.
        stations.sort(key=lambda s: -s[0].y)
        rounded_loft(t, stations, boxes[0]["role"], sides=10 if GAME else 16, n_exp=2.4)
        skip = hide
    for p in parts:
        if p in skip:
            continue
        if p["type"] == "BoxGeometry":
            w, h, d = p["size"]
            # A patch of hide is a sheet; a head, a neck, a muzzle, an ear
            # are rounded well.
            thin = min(w, h, d) < 0.03
            bevel_box(t, p, bevel=None if thin else 0.4 * min(w, h, d))
        elif p["type"] == "IcosahedronGeometry":
            ellipsoid(t, p, lumpy=0.22, rng=rng, rings_n=(10, 5) if GAME else (16, 8))
        elif p["type"] in ("CylinderGeometry", "ConeGeometry"):
            smooth_cyl(t, p, sides=7 if GAME else 12)

def crowd(t, v, parts, rng):
    """A figure's part: a leg with a boot, a torso with shoulders, a head
    that is round, an arm with a hand — each a rounded loft up its height
    in the shade the instance's colour is tinted by."""
    p = parts[0]
    at = p["at"]
    w, h, d = p["size"]
    side, up, fwd = Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0))
    o = at(0, 0, 0)
    def st(y, kw, kd, hw=None, hd=None):
        return (o + up * y, (hw or w / 2) * kw, (hd or d / 2) * kd, side, fwd)
    # THE BUDGET: a stage's crowd is hundreds of figures of six parts each,
    # so a part in the game is a few dozen triangles.
    sides = 6 if GAME else 12
    if v["id"] == "leg":
        stations = [st(-h / 2, 1.1, 1.3), st(-h / 2 + 0.07, 1.0, 1.2), st(-h / 2 + 0.09, 0.88, 0.88),
                    st(h * 0.1, 0.9, 0.9), st(h / 2, 1.0, 1.0)]
        rings = rounded_loft(t, stations, p["role"], sides=sides, n_exp=2.5)
        # The boot: dark.
        for ring in rings[:2]:
            for i in ring:
                t.tone[i] = (0.35, 0.0, 0.0)
    elif v["id"] == "torso":
        stations = [st(-h / 2, 0.92, 0.9), st(h * 0.15, 1.0, 1.0), st(h * 0.42, 1.0, 0.95), st(h / 2, 0.8, 0.72)]
        rounded_loft(t, stations, p["role"], sides=sides + 2, n_exp=2.8)
    elif v["id"] == "head":
        stations = [st(-h / 2, 0.55, 0.55), st(-h * 0.25, 0.92, 0.92), st(h * 0.25, 0.95, 0.95), st(h / 2, 0.55, 0.55)]
        rounded_loft(t, stations, p["role"], sides=sides + 2, n_exp=2.2)
    else:
        stations = [st(-h / 2, 0.8, 0.8), st(-h * 0.3, 0.88, 0.88), st(h / 2, 1.0, 1.0)]
        rings = rounded_loft(t, stations, p["role"], sides=sides, n_exp=2.5)
        for i in rings[0]:
            t.tone[i] = (0.75, 0.0, 0.0)

def roadside(t, v, parts, rng):
    """A stake with a white cap, a block with orange ends, a snow pole's
    bands turned round, a cone with its band on a square base."""
    p = parts[0]
    if v["id"] == "stake":
        bevel_box(t, p, bevel=0.012, top_role="white", top_share=0.14)
        return
    if v["id"] == "block":
        at = p["at"]
        w, h, d = p["size"]
        bevel_box(t, p, bevel=0.02)
        # The ends: orange faces laid on.
        for sx in (-1, 1):
            e = 0.002
            pts = [at(sx * (w / 2 + e), -h / 2 + 0.01, -d / 2 + 0.01), at(sx * (w / 2 + e), -h / 2 + 0.01, d / 2 - 0.01),
                   at(sx * (w / 2 + e), h / 2 - 0.01, d / 2 - 0.01), at(sx * (w / 2 + e), h / 2 - 0.01, -d / 2 + 0.01)]
            t.flat(pts, "warn", 1.0, flip=sx < 0)
        return
    if v["id"] in ("cone", "tallCone"):
        at = p["at"]
        r_top, r_bot, h = p["size"]
        tall = v["id"] == "tallCone"
        n = 12 if GAME else 18
        # The base: a square plate under the cone.
        b = r_bot * 1.25
        y0 = -h / 2
        t.flat([at(-b, y0 + 0.03, -b), at(b, y0 + 0.03, -b), at(b, y0 + 0.03, b), at(-b, y0 + 0.03, b)], "base", 0.9)
        for k in range(4):
            a0, a1 = [(-b, -b), (b, -b), (b, b), (-b, b)][k], [(-b, -b), (b, -b), (b, b), (-b, b)][(k + 1) % 4]
            t.flat([at(a0[0], y0, a0[1]), at(a1[0], y0, a1[1]), at(a1[0], y0 + 0.03, a1[1]), at(a0[0], y0 + 0.03, a0[1])], "base", 0.7,
                   flip=True)
        # The cone itself, banded.
        levels = [(0.0, "cone"), (0.5, "cone"), (0.62, "band"), (0.74, "band"), (0.86, "cone"), (1.0, "cone")] if not tall else \
                 [(0.0, "cone"), (0.3, "cone"), (0.4, "band"), (0.5, "cone"), (0.62, "cone"), (0.72, "band"), (0.82, "cone"), (1.0, "cone")]
        rings = []
        for u, _ in levels:
            y = y0 + h * u
            r = r_bot + (r_top - r_bot) * u
            if not tall:
                r = r_bot * (1 - u) ** 0.85 * 0.98 + 0.04
            ring = []
            for j in range(n):
                a = 2 * math.pi * j / n
                q = at(math.cos(a) * r, y, math.sin(a) * r)
                o = at(0, y, 0)
                ring.append(t.v(q, 0.85 + 0.15 * (0.5 + 0.5 * math.cos(a)), tuple(norm(tuple((q - o).normalized() + Vector((0, 0, 0.25)))))))
            rings.append(ring)
        for k in range(len(rings) - 1):
            role = levels[k + 1][1] if levels[k][1] == levels[k + 1][1] else levels[k][1]
            for j in range(n):
                j1 = (j + 1) % n
                t.f((rings[k][j], rings[k][j1], rings[k + 1][j1], rings[k + 1][j]), role)
        top = t.v(at(0, y0 + h, 0), 1.0, None)
        for j in range(n):
            t.f((rings[-1][j], rings[-1][(j + 1) % n], top), "cone")
        return
    # The snow pole: its bands turned, the reflector a bright cap.
    for q in parts:
        smooth_cyl(t, q, sides=8 if GAME else 14, caps=q is parts[-1] or q is parts[0])

def energy(t, v, parts, rng):
    """The nacelle rounded, the rotor's blades smooth, the tables' panels
    with edges."""
    if v["id"] == "nacelle":
        for p in parts:
            if p["type"] == "BoxGeometry":
                bevel_box(t, p, bevel=0.45)
            else:
                smooth_cyl(t, p, sides=12 if GAME else 20)
        return
    if v["id"] == "rotor":
        for p in parts:
            if p["role"] in ("blade", "bladeTip"):
                smooth_cyl(t, p, sides=8 if GAME else 12, cap_shade=0.95)
            else:
                smooth_cyl(t, p, sides=12 if GAME else 20)
        return
    generic(t, parts, rng)

# The passenger bodies: how each one's shell is drawn over its two boxes —
# how far the nose and the tail drop, how the screen and the backlight
# rake (a share of the cabin's length spent on each), how far the roof
# tucks in, and which side glass there is.
SHELLS = {
    "hatch": dict(nose=0.9, tail=0.92, screen=0.28, back=0.22, tuck=0.9, glass="all"),
    "saloon": dict(nose=0.9, tail=0.9, screen=0.3, back=0.3, tuck=0.9, glass="all"),
    "estate": dict(nose=0.9, tail=0.96, screen=0.28, back=0.1, tuck=0.92, glass="all"),
    "suv": dict(nose=0.94, tail=0.96, screen=0.22, back=0.1, tuck=0.94, glass="all"),
    "pickup": dict(nose=0.94, tail=1.0, screen=0.3, back=0.14, tuck=0.94, glass="all"),
    "van": dict(nose=0.95, tail=0.98, screen=0.22, back=0.04, tuck=0.96, glass="cab"),
    "minibus": dict(nose=0.95, tail=0.98, screen=0.2, back=0.06, tuck=0.96, glass="all"),
}

def car_shell(t, v, parts, rng):
    """A passenger car's SHELL where the code stacks two boxes: one loft,
    nose to tail, through rounded cross-sections — the sill's flanks up to
    the belt, a tumblehome in to the glass, the pillars, a roof that tucks
    in at its edges — its screen and backlight raked, the glass a band of
    faces on the shell itself. The bumpers, the lamps, the plate, the
    mirrors and the rest stay the code's parts, with edges."""
    kind = v.get("body")
    spec = SHELLS[kind]
    paint = [p for p in parts if p["type"] == "BoxGeometry" and p["role"] == "paint"]
    if len(paint) < 2:
        return []
    boxes = sorted(paint, key=lambda p: -(p["size"][0] * p["size"][1] * p["size"][2]))
    lower = boxes[0]
    cabin = max(boxes[1:], key=lambda p: p["at"](0, 0, 0).z)
    # The two boxes' frames, read back in the game's own axes.
    def game(p, x, y, z):
        q = p["at"](x, y, z)
        return (q.x, q.z, -q.y)
    lw, lh, ld = lower["size"]
    cw, ch, cd = cabin["size"]
    lx, ly, lz = game(lower, 0, 0, 0)
    cx, cy, cz = game(cabin, 0, 0, 0)
    L, W = ld, lw
    clearance = ly - lh / 2
    sill = ly + lh / 2
    H = cy + ch / 2
    cabin_from, cabin_to = cz - cd / 2, cz + cd / 2
    nose, tail = lz + L / 2, lz - L / 2
    # The glass boxes: where the side glass runs, and how tall.
    glass = [p for p in parts if p["type"] == "BoxGeometry" and p["role"] == "glass"]
    side = max(glass, key=lambda p: p["size"][2]) if glass else None
    gy, gh = (game(side, 0, 0, 0)[1], side["size"][1]) if side else (sill + ch * 0.55, ch * 0.5)
    g_lo, g_hi = gy - gh / 2, gy + gh / 2
    # Stations along the car (game z): the nose, the bonnet's end, the
    # screen's top, the roof's end, the backlight's foot, the tail.
    screen_len = cd * spec["screen"]
    back_len = cd * spec["back"]
    zs = [
        ("nose", nose, spec["nose"], 0.0, 0.96),
        ("bonnet", cabin_to + 0.02, 1.0, 0.0, 1.0),
        ("screen", cabin_to - screen_len, 1.0, 1.0, 1.0),
        ("roof", cabin_from + back_len, 1.0, 1.0, 1.0),
        ("boot", cabin_from - 0.02, 1.0, 0.0, 1.0),
        ("tail", tail, spec["tail"], 0.0, 0.96),
    ]
    # A ring's points, bottom to roof and back down the other flank: the
    # underside, the sill's rounded corner, the flank, the belt, the glass,
    # the roof's shoulder and its top. `up` is how much of the cabin stands
    # at this station (the bonnet and boot stations carry none).
    def ring(z, drop, up, wk):
        hw = W / 2 * wk
        chw = cw / 2 * wk
        top = sill + (H - sill) * up
        belt = sill + (g_lo - sill) * up
        gtop = sill + (g_hi - sill) * up
        rl = 0.06
        pts = []
        def P(x, y, role):
            pts.append((Vector((x, -z, y)), role))
        P(-hw * 0.8, clearance, "paint")
        P(-hw, clearance + rl, "paint")
        P(-hw, sill * drop - rl, "paint")
        P(-chw * 1.02, belt, "paint")
        P(-chw, gtop, "glass")
        P(-chw * spec["tuck"], top - 0.03, "paint")
        P(-chw * 0.6, top, "paint")
        P(chw * 0.6, top, "paint")
        P(chw * spec["tuck"], top - 0.03, "paint")
        P(chw, gtop, "glass")
        P(chw * 1.02, belt, "paint")
        P(hw, sill * drop - rl, "paint")
        P(hw, clearance + rl, "paint")
        P(hw * 0.8, clearance, "paint")
        return pts
    rings = []
    for name, z, drop, up, wk in zs:
        rings.append((name, [(t.v(p, 1.0, None), role) for p, role in ring(z, drop, up, wk)]))
    n = len(rings[0][1])
    # Which faces are glass: a strip's two rings both at glass points, on
    # a station where the glass runs (a van's flank is panel behind the cab).
    for k in range(len(rings) - 1):
        a_name, a = rings[k]
        b_name, b = rings[k + 1]
        for j in range(n):
            j1 = (j + 1) % n
            quad = (a[j][0], a[j1][0], b[j1][0], b[j][0])
            roles = {a[j][1], a[j1][1], b[j][1], b[j1][1]}
            glassy = roles == {"glass"} or (
                "glass" in roles and len(roles) == 2 and a_name in ("screen", "roof") and b_name in ("screen", "roof")
            )
            # The screen and the backlight: the sloping band over the belt
            # between the bonnet and the screen's top, the roof's end and the
            # boot — its upper quads.
            if (a_name, b_name) in (("bonnet", "screen"), ("roof", "boot")) and j in (4, 5, 8, 9, 6, 7):
                glassy = True
            if spec["glass"] == "cab" and (a_name, b_name) == ("screen", "roof") and j in (3, 4, 9, 10):
                glassy = False
            t.f(quad, "glass" if glassy else "paint")
    # The nose and the tail closed flat.
    for k, first in ((0, True), (len(rings) - 1, False)):
        ring_ = [i for i, _ in rings[k][1]]
        centre = t.v(sum((Vector(t.co[i]) for i in ring_), Vector()) / n, 0.95, None)
        for j in range(n):
            j1 = (j + 1) % n
            t.f((ring_[j1], ring_[j], centre) if first else (ring_[j], ring_[j1], centre), "paint")
    # Smooth across the shell: normals from the faces (Blender's, at
    # export), so leave them unset. The parts the shell replaces:
    skip = [lower, cabin] + glass
    # A van's panel over its glass band is the shell's flank.
    for p in paint:
        if p not in (lower, cabin) and p["role"] == "paint" and abs(p["size"][1] - (gh + 0.02)) < 0.01:
            skip.append(p)
    return skip

def traffic(t, v, parts, rng):
    """A vehicle: a passenger body's boxes lofted into one shell, the rest
    of its panels with edges, its glass flush, its wheels wheels, its tank
    turned."""
    skip = car_shell(t, v, parts, rng) if v.get("body") in SHELLS else []
    generic(t, parts, rng, skip=skip)

def stone(t, v, parts, rng):
    lump(t, parts[0], rng, detail=1 if GAME else 2)

BUILDERS = {
    "livestock": livestock,
    "crowd": crowd,
    "roadside": roadside,
    "energy": energy,
    "traffic": traffic,
}

def build(v):
    rng = random.Random(f"{KIND}/{v['id']}")
    t = Mesh()
    parts = parts_of(v)
    if KIND == "stone":
        stone(t, v, parts, rng)
    else:
        BUILDERS.get(KIND, lambda t, v, parts, rng: generic(t, parts, rng))(t, v, parts, rng)
    return t

made = []
tris = {}
for v in DATA["variants"]:
    t = build(v)
    tris[v["id"]] = t.tris()
    made.append((v, t.object(v["id"])))

root = bpy.data.objects.new(KIND, None)
COL.objects.link(root)
root["kind"], root["frame"] = KIND, "prop"
for _, ob in made:
    ob.parent = root
for v in DATA["variants"]:
    print("TRIANGLES", KIND, v["id"], tris[v["id"]], "code", v["tris"])
print("TRIANGLES", KIND, "total", sum(tris.values()), "code", sum(v["tris"] for v in DATA["variants"]))

if GAME:
    lib._select_only([root] + [ob for _, ob in made])
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{KIND}.glb"), use_selection=True, export_extras=True,
                              export_normals=True, export_vertex_color="ACTIVE", export_all_vertex_colors=False,
                              export_animations=False, export_skins=False, export_morph=False,
                              export_materials="EXPORT")

# ---------------------------------------------------------------- the STUDIO: the ids in a row
only = [x for x in os.environ.get("VIEWS", "").split(",") if x]
views = [x for x in ("row", "close") if (not only or x in only)] if (not GAME or only) else []
if only == ["none"]:
    views = []
if views:
    x = 0.0
    spans = []
    for v, ob in made:
        lo, hi = v["bounds"]["min"], v["bounds"]["max"]
        half = max(abs(lo[0]), abs(hi[0]), abs(lo[2]), abs(hi[2]), 0.5)
        x += half * 1.15
        spans.append((v["id"], x, hi[1]))
        ob.location = (x, 0, -min(0.0, lo[1]))
        x += half * 1.15
    width = x
    tall = max(v["bounds"]["max"][1] for v in DATA["variants"])
    ground = mat("stage", (0.2, 0.18, 0.15), rough=0.95)
    bpy.ops.mesh.primitive_plane_add(size=max(600, width * 4), location=(width / 2, 0, -0.02))
    bpy.context.active_object.data.materials.append(ground)
    lib._sky()
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 4.5
    sun.angle = math.radians(1.5)
    sun.color = (1.0, 0.95, 0.86)
    so = bpy.data.objects.new("sun", sun)
    COL.objects.link(so)
    so.rotation_euler = (math.radians(52), math.radians(8), math.radians(-35))
    lib._cycles(SAMPLES)
    scene.cycles.device = "CPU"
    tag = "game" if GAME else "render"
    for view in views:
        cd = bpy.data.cameras.new(view)
        cam = bpy.data.objects.new(view, cd)
        COL.objects.link(cam)
        if view == "close":
            first, first_h = spans[0][1], spans[0][2]
            scene.render.resolution_x, scene.render.resolution_y = 1200, 900
            cd.lens = 32
            off = max(2.0, first_h * 2.2 + 1.5)
            cam.location = (first + off * 0.6, -off, first_h * 0.55 + 0.4)
            cam.rotation_euler = (math.radians(80), 0, math.radians(31))
        else:
            aspect = max(1.6, width / max(0.5, tall * 1.5))
            scene.render.resolution_x = min(3200, round(520 * aspect))
            scene.render.resolution_y = round(scene.render.resolution_x / aspect)
            cd.type = "ORTHO"
            cd.ortho_scale = max(width * 1.02, tall * 1.5 * aspect)
            # Three-quarters on, a little above — the row seen as a car
            # passes it — aimed at the row's middle from two hundred metres.
            yaw, pitch = math.radians(28), math.radians(12)
            look = Vector((-math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), -math.sin(pitch)))
            target = Vector((width / 2, 0, tall * 0.45))
            cam.location = target - look * 200
            cam.rotation_euler = (math.pi / 2 - pitch, 0, yaw)
        scene.camera = cam
        scene.render.filepath = os.path.join(OUT, f"{KIND}-{tag}-{view}.png")
        bpy.ops.render.render(write_still=True)
