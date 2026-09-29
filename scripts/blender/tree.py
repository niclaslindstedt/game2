# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# THE TREES MODELLED IN BLENDER: one KIND's variants (`make blender
# KIND=tree ID=<kind>`), off the very rows the code's recipes draw with
# (`pwa/src/game/flora-tree-rows.ts`) and the SKELETON the code's own
# builder lays for each (`scripts/lib/tree-model-data.mjs`: every trunk,
# limb, tier and clump where the code puts it) — handed in as one JSON file
# by `scripts/blender.mjs`, the driver and the only way this runs. What this
# adds is the MODELLING, part by part: a conifer's tier as a whorl of real
# drooping boughs over a dark core, a pine's tuft as a lobed cushion of
# needles, a broadleaf's blob as a lumpy clump of leaves with leaves
# breaking its edge, a trunk that flares into its roots, a birch's black
# marks on its white bark, a cactus's ribs, a Joshua tree's shag of dead
# leaves and its fists of daggers, a snag's broken stubs. The sibling
# snowmobile game's tree builder is where every piece of it started.
#
# THE FRAME. The tree's own metres, the game's frame turned for Blender:
# a game point (x, y, z) — y up, the foot at the origin — is modelled at
# (x, -z, y), a rotation and not a mirror, and the glTF export turns it
# straight back, so the game reads a model where the code's shape stands
# with nothing to scale and nothing to turn.
#
# EACH VARIANT IS TWO MESHES: `<id>` (the tree the road's band draws) and
# `<id>_far` (the hand-built sketch the wild beyond it draws — the same
# tree at a fraction of the triangles, never a decimation). One glTF a
# kind, every variant of it in it.
#
# DRESSED BY THE GAME. A model carries no colour of its own: every face's
# material is NAMED for the paint it wears — a colour of the paint box
# (`SPRUCE_DARK`), or a pair blended up the part (`TRUNK_DARK>PINE_BARK`) —
# and every vertex two numbers in its colour attribute:
#   R  its SHADE, 0..1 — the dark inside a crown, the foot of a trunk
#   G  how far it goes from the pair's first colour to its second
# `tree-models.ts` turns that into this season's colours as the code's
# builder turns its own. The needles and the leaves carry VOLUME normals
# (out of the crown and up), so a crown is lit as a mass, and so the
# winter's snow (a term in the material, `snow-cap.ts`) lies on its tops.

import json, math, os, random, sys
# WINDING: Blender's frame is z up, so a ring laid round by (cos a, sin a)
# in x and y runs ANTICLOCKWISE seen from above — every face here is wound
# for Blender's frame, outward (the game culls the back; a Cycles still does
# not, so judge a face's side in the game's lab).

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
from lib import *

argv = sys.argv[sys.argv.index("--") + 1:]
DATA = json.load(open(argv[0]))
OUT = argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 24
KIND = DATA["kind"]
PAINT = DATA["paint"]

def role_of(paint):
    """What a paint IS on a tree (`TREE_PAINT_ROLE`): its first colour's."""
    first = paint if isinstance(paint, str) else paint[0]
    return PAINT[first]["role"]

def name_of(paint):
    return paint if isinstance(paint, str) else f"{paint[0]}>{paint[1]}"

# ---------------------------------------------------------------- materials
# The stills are painted with the kind's summer colours through the same
# arithmetic the game dresses a model with; the glTF's materials are grey,
# as the game reads only their names.
MATS = {}

def material(paint):
    key = name_of(paint)
    if key in MATS:
        return MATS[key]
    first, second = (paint, paint) if isinstance(paint, str) else paint
    a, b = PAINT[first]["rgb"], PAINT[second]["rgb"]
    m = mat(key, (0.5, 0.5, 0.5) if GAME else tuple(a), rough=0.9)
    if not GAME:
        nt = m.node_tree
        p = nt.nodes.get("Principled BSDF")
        attr = nt.nodes.new("ShaderNodeAttribute")
        attr.attribute_name = "tone"
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(attr.outputs["Color"], sep.inputs[0])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs[6].default_value = (*a, 1)
        mix.inputs[7].default_value = (*b, 1)
        nt.links.new(sep.outputs[1], mix.inputs[0])
        shade = nt.nodes.new("ShaderNodeMix")
        shade.data_type = "RGBA"
        shade.blend_type = "MULTIPLY"
        shade.inputs[0].default_value = 1.0
        nt.links.new(mix.outputs[2], shade.inputs[6])
        nt.links.new(sep.outputs[0], shade.inputs[7])
        nt.links.new(shade.outputs[2], p.inputs["Base Color"])
    MATS[key] = m
    return m

# ---------------------------------------------------------------- the MESH being built
def norm(v):
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1.0
    return (v[0] / l, v[1] / l, v[2] / l)

def V(p):
    """A game point (x, y up, z) in Blender's frame."""
    return Vector((p[0], -p[2], p[1]))

class Tree:
    """A mesh under construction: every vertex with its tone (shade, blend)
    and — for foliage — its own normal; every face its paint."""

    def __init__(self):
        self.co, self.tone, self.nrm, self.faces, self.paints = [], [], [], [], []

    def v(self, p, shade=1.0, blend=0.0, n=None):
        self.co.append((p[0], p[1], p[2]))
        self.tone.append((max(0.0, min(1.0, shade)), max(0.0, min(1.0, blend)), 0.0))
        self.nrm.append(n)
        return len(self.co) - 1

    def f(self, idx, paint):
        self.faces.append(tuple(idx))
        self.paints.append(name_of(paint))
        material(paint)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def object(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.co, [], self.faces)
        me.validate(clean_customdata=False)
        used = sorted(set(self.paints))
        for k in used:
            me.materials.append(MATS[k])
        me.polygons.foreach_set("material_index", [used.index(p) for p in self.paints])
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        tone = me.color_attributes.new("tone", "FLOAT_COLOR", "POINT")
        for i, (r, g, b) in enumerate(self.tone):
            tone.data[i].color = (r, g, b, 1.0)
        me.color_attributes.active_color = tone
        me.color_attributes.render_color_index = 0
        me.update()
        # A vertex with no normal of its own takes the surface's.
        smooth = [tuple(v.normal) for v in me.vertices]
        me.normals_split_custom_set_from_vertices(
            [n if n is not None else smooth[i] for i, n in enumerate(self.nrm)])
        ob = bpy.data.objects.new(name, me)
        COL.objects.link(ob)
        return ob

def frame(d):
    """Two unit vectors across a direction `d`."""
    d = Vector(d).normalized()
    a = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = d.cross(a).normalized()
    return u, d.cross(u).normalized()

def tube(t, pts, radii, sides, paint, tone=lambda k, j: (1.0, 0.0), cap=False, cap_flat=False, face=None):
    """A tapering tube through `pts` (Vectors), `radii` at each; `tone(k, j)`
    the shade and blend of ring k's j-th point; `face(k, j)` a paint other
    than the tube's for one face (a birch's dark marks)."""
    rings = []
    prev_u = None
    for k, p in enumerate(pts):
        d = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)])
        u, w = frame(d)
        if prev_u is not None:
            # Parallel transport: keep the seam from twisting.
            u = (prev_u - d.normalized() * prev_u.dot(d.normalized())).normalized()
            w = d.normalized().cross(u)
        prev_u = u
        ring = []
        for j in range(sides):
            a = 2 * math.pi * j / sides
            off = u * math.cos(a) + w * math.sin(a)
            s, b = tone(k, j)
            ring.append(t.v(p + off * radii[k], s, b))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for j in range(sides):
            j1 = (j + 1) % sides
            pp = (face(k, j) if face else None) or paint
            t.f((rings[k][j], rings[k][j1], rings[k + 1][j1], rings[k + 1][j]), pp)
    if cap:
        s, b = tone(len(pts) - 1, 0)
        dirn = (pts[-1] - pts[-2]).normalized()
        c = t.v(pts[-1] + dirn * (0.0 if cap_flat else radii[-1] * 0.5), s, b)
        for j in range(sides):
            t.f((rings[-1][j], rings[-1][(j + 1) % sides], c), paint)
    return rings

def fin(t, root, tip, w, paint, shade=(0.8, 1.0), blend=(0.0, 0.0), fan=0.4, up=0.8):
    """A thin blade from `root` to `tip`, `w` wide at the root and `fan` of
    that at the tip, with BOTH faces — its own vertices each, so a leaf reads
    from either side, and both lit out along it and up (never down: a crown
    seen from under it would go black)."""
    root, tip = Vector(root), Vector(tip)
    d = tip - root
    s = Vector((-d.y, d.x, 0))
    if s.length < 1e-6:
        s = Vector((1, 0, 0))
    s = s.normalized() * w
    quad = (root + s, tip + s * fan, tip - s * fan, root - s)
    tones = ((shade[0], blend[0]), (shade[1], blend[1]), (shade[1], blend[1]), (shade[0], blend[0]))
    out = Vector((d.x, d.y, 0)).normalized() if d.xy.length > 1e-6 else Vector((0, 0, 0))
    n = norm((out.x * 0.6, out.y * 0.6, up))
    top = [t.v(q, a, b, n) for q, (a, b) in zip(quad, tones)]
    t.f(tuple(reversed(top)), paint)
    nb = norm((out.x * 0.8, out.y * 0.8, up * 0.3))
    under = [t.v(q, a * 0.85, b, nb) for q, (a, b) in zip(quad, tones)]
    t.f(under, paint)

def octa(t, at, r, paint, shade=0.9):
    """A little octahedron: a berry."""
    at = Vector(at)
    ps = [at + Vector(o) * r for o in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
    ix = [t.v(p, shade * (0.8 + 0.2 * (p.z > at.z)), 0.0, norm(tuple(p - at))) for p in ps]
    for a, b in ((0, 2), (2, 1), (1, 3), (3, 0)):
        t.f((ix[a], ix[b], ix[4]), paint)
        t.f((ix[b], ix[a], ix[5]), paint)

def smoothstep(a, b, x):
    u = max(0.0, min(1.0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)

def flare(r, z):
    """A trunk's radius at height z over the ground: a root flare at its foot."""
    return r * (1 + 0.45 * math.exp(-max(0.0, z) / 0.4))

# ---------------------------------------------------------------- the SKELETON, read
def parts_of(v):
    """A variant's traced parts in Blender's frame, each with its role."""
    out = []
    for p in v["parts"]:
        q = dict(p)
        q["A"], q["B"] = V(p["a"]), V(p["b"])
        q["role"] = role_of(p["paint"])
        if p.get("radii"):
            rx, ry, rz = p["radii"]
            q["R"] = Vector((rx, rz, ry))
        out.append(q)
    return out

def on_ground(p):
    return min(p["A"].z, p["B"].z) < 0.35

def radius_at(p, z):
    """A tube's radius where it crosses height z."""
    a, b = p["A"], p["B"]
    u = 0.0 if abs(b.z - a.z) < 1e-6 else max(0.0, min(1.0, (z - a.z) / (b.z - a.z)))
    return p["r0"] + (p["r1"] - p["r0"]) * u, a.lerp(b, u)

# ---------------------------------------------------------------- the PARTS, modelled
def trunk(t, p, far, rng, top=None, top_r=None, flared=True):
    """A stem out of the ground: flaring into its roots, tapering up its
    length, the bark a shade darker at the foot and blended up it where its
    paint is a pair; `top` carries it on up through a crown."""
    a, b = p["A"], p["B"]
    d = (b - a)
    L = d.length
    dn = d.normalized()
    end = b if top is None else a + dn * ((top - a.z) / max(dn.z, 0.2))
    r0, r1 = p["r0"], (p["r1"] if top_r is None else top_r)
    sides = 3 if far else max(5, min(9, round(5 + p["r0"] * 8)))
    n = 2 if far else max(4, min(9, round((end - a).length / 2.2) + 3))
    foot = a - dn * 0.25
    pts, radii = [], []
    for k in range(n + 1):
        u = k / n
        q = foot.lerp(end, u)
        pts.append(q)
        radii.append(flare(r0 + (r1 - r0) * u, q.z) if flared and not far else r0 + (r1 - r0) * u)
    pair = not isinstance(p["paint"], str)
    span = max(1e-6, L)
    stripe = [0.82 + 0.18 * rng.random() for _ in range(sides)]
    def tone(k, j):
        z = pts[k].z - a.z
        return ((0.72 + 0.28 * min(1.0, z / 2.5)) * stripe[j], min(1.0, z / span) if pair else 0.0)
    return tube(t, pts, radii, sides, p["paint"], tone, cap=True)

def limb(t, p, far, rng):
    """A bough off a trunk: bowed a little up, tapering to its end."""
    a, b = p["A"], p["B"]
    mid = a.lerp(b, 0.5) + Vector((0, 0, (b - a).length * 0.05))
    sides = 3 if far else (4 if p["r0"] < 0.06 else 5)
    pts = [a, mid, b] if not far else [a, b]
    radii = [p["r0"], (p["r0"] + p["r1"]) * 0.5, p["r1"]] if not far else [p["r0"], p["r1"]]
    pair = not isinstance(p["paint"], str)
    return tube(t, pts, radii, sides, p["paint"], lambda k, j: (0.78 + 0.1 * k, 0.5 * k if pair else 0.0),
                cap=True)

def stub(t, p, far, axis_xy, rng):
    """A branch broken back to a stub: from the trunk out, thinning, its end
    splintered."""
    a, b = p["A"], p["B"]
    if (a.xy - axis_xy).length > (b.xy - axis_xy).length:
        a, b = b, a
    r = p["r0"] * 0.55
    sides = 3 if far else 5
    tip = b + (b - a).normalized() * r * 1.5 + Vector((0, 0, r * 0.4 * rng.random()))
    tube(t, [a, b], [r, r * 0.7], sides, p["paint"], lambda k, j: (0.75 + 0.2 * k * (j % 2), 0.0))
    if not far:
        # The splinters at the break.
        u, w = frame(b - a)
        for k in range(2):
            o = (u if k == 0 else w) * r * 0.4
            tube(t, [b + o, tip + o * 0.3], [r * 0.45, r * 0.05], 3, p["paint"], lambda k, j: (0.95, 0.0))

def splinter(t, p, far, rng):
    """A cone of bare wood: the splinters a broken top leaves."""
    a, b = p["A"], p["B"]
    sides = 3 if far else 5
    rr = [p["r0"] * (0.6 + 0.5 * rng.random()) for _ in range(sides)]
    u, w = frame(b - a)
    ring = []
    for j in range(sides):
        ang = 2 * math.pi * j / sides
        ring.append(t.v(a + (u * math.cos(ang) + w * math.sin(ang)) * rr[j], 0.8, 0.0))
    tip = t.v(b + u * p["r0"] * 0.3 * rng.random(), 1.0, 0.0)
    for j in range(sides):
        t.f((ring[j], ring[(j + 1) % sides], tip), p["paint"])

# ---- a CONIFER tier: a whorl of drooping boughs
def bough(t, root, ang, L, drop, hw, paint, droop, rng, thin=1.0):
    """One drooping limb of a whorl: out along azimuth `ang`, `L` long,
    falling `drop` from the stem to its tip, `hw` wide a side at its widest —
    lofted ridged across its top and flat under, its tip blunt: a bough ends
    in a spray, and a pointed tip reads as a star of shards."""
    c, s = math.cos(ang), math.sin(ang)
    d = Vector((c, s, 0))
    side = Vector((-s, c, 0))
    hw = min(hw * 1.2, L * 0.55) * thin
    sag = 1.2 + 0.4 * droop
    thick = 0.05 + 0.05 * L
    stations = (0.06, 0.42, 0.76)
    def at(u):
        return root + d * (0.06 + L * u) - Vector((0, 0, drop * u ** sag))
    def width(u):
        return hw * (0.3 + 0.7 * math.sin(math.pi * (0.12 + 0.72 * u)))
    lit = rng.random() * 0.15
    tops, unders = [], []
    for u in stations:
        p = at(u)
        w = width(u)
        up = 0.95 - 0.7 * u
        sh = 0.62 + 0.36 * u + lit
        left = t.v(p + side * w - Vector((0, 0, w * 0.35)), sh, 0.0,
                   norm((c * 0.65 - s * 0.3, s * 0.65 + c * 0.3, up * 0.7)))
        ridge = t.v(p + Vector((0, 0, thick)), sh + 0.06, 0.0, norm((c * 0.65, s * 0.65, up)))
        right = t.v(p - side * w - Vector((0, 0, w * 0.35)), sh, 0.0,
                    norm((c * 0.65 + s * 0.3, s * 0.65 - c * 0.3, up * 0.7)))
        tops.append((left, ridge, right))
        ul = t.v(p + side * w - Vector((0, 0, w * 0.35)), 0.5, 0.0, norm((c * 0.5, s * 0.5, -0.3)))
        ur = t.v(p - side * w - Vector((0, 0, w * 0.35)), 0.5, 0.0, norm((c * 0.5, s * 0.5, -0.3)))
        unders.append((ul, ur))
    tp = at(1.0)
    tw = width(1.0) * 0.55
    tl = t.v(tp + side * tw - Vector((0, 0, tw * 0.4)), 0.95, 0.0, norm((c * 0.65 - s * 0.3, s * 0.65 + c * 0.3, 0.25)))
    tr_ = t.v(tp - side * tw - Vector((0, 0, tw * 0.4)), 0.95, 0.0, norm((c * 0.65 + s * 0.3, s * 0.65 - c * 0.3, 0.25)))
    tip = t.v(tp + Vector((0, 0, thick * 0.4)), 1.0, 0.0, norm((c * 0.65, s * 0.65, 0.4)))
    ul_ = t.v(tp + side * tw - Vector((0, 0, tw * 0.4)), 0.45, 0.0, norm((c * 0.5, s * 0.5, -0.3)))
    ur_ = t.v(tp - side * tw - Vector((0, 0, tw * 0.4)), 0.45, 0.0, norm((c * 0.5, s * 0.5, -0.3)))
    for i in range(len(stations) - 1):
        l0, g0, r0_ = tops[i]
        l1, g1, r1_ = tops[i + 1]
        t.f((r0_, r1_, g1, g0), paint)
        t.f((g0, g1, l1, l0), paint)
        t.f((unders[i + 1][0], unders[i + 1][1], unders[i][1], unders[i][0]), paint)
    l, g, r = tops[-1]
    t.f((r, tr_, tip, g), paint)
    t.f((g, tip, tl, l), paint)
    t.f((ul_, ur_, unders[-1][1], unders[-1][0]), paint)

# How a kind's boughs hang and how open its whorls are.
HABIT = {
    "spruce": dict(droop=1.0, thin=1.0, core=0.42, per=4.2),
    "fir": dict(droop=0.55, thin=1.1, core=0.45, per=4.6),
    "larch": dict(droop=0.8, thin=0.7, core=0.2, per=3.2),
}

def whorl(t, p, far, rng, habit, share):
    """A conifer's tier (a cone of the code's): its boughs spoked round the
    stem from high in the tier out and down to its skirt."""
    a, b = p["A"], p["B"]
    R = p["r0"]
    H = (b - a).length
    root = a.lerp(b, 0.55)
    drop = (root.z - a.z) + H * 0.06
    n = max(4, round(min(13, 3 + R * habit["per"]) * share))
    twist = rng.random() * math.pi
    for k in range(n):
        ang = 2 * math.pi * (k + (rng.random() - 0.5) * 0.5) / n + twist
        jag = 1.0 if k % 2 == 0 else 0.8 + rng.random() * 0.12
        L = R * jag * (0.98 + rng.random() * 0.14)
        if L < 0.1:
            continue
        bough(t, root, ang, L, drop * jag, math.pi * L / n, p["paint"], habit["droop"], rng, habit["thin"])

def core(t, tiers, top, habit, paint):
    """THE CORE: a dark cone of needles inside the crown, so a wood reads as
    woods between the boughs rather than as a lattice of them."""
    rings = []
    n = 6
    for k, p in enumerate(sorted(tiers, key=lambda q: q["A"].z)):
        z = p["A"].z + (p["B"].z - p["A"].z) * 0.15
        c = p["A"].lerp(p["B"], 0.15)
        rr = p["r0"] * habit["core"] + 0.04
        ring = []
        for j in range(n):
            ang = 2 * math.pi * j / n + k
            cc, ss = math.cos(ang), math.sin(ang)
            ring.append(t.v((c.x + cc * rr, c.y + ss * rr, z), 0.48, 0.0, norm((cc, ss, 0.25))))
        rings.append(ring)
    tip = t.v(top, 0.6, 0.0, (0, 0, 1))
    for k in range(len(rings) - 1):
        for j in range(n):
            j1 = (j + 1) % n
            t.f((rings[k][j], rings[k][j1], rings[k + 1][j1], rings[k + 1][j]), paint)
    for j in range(n):
        t.f((rings[-1][j], rings[-1][(j + 1) % n], tip), paint)

def skirt(t, p, rng, k):
    """THE SKETCH of a tier: a ragged five-sided skirt, lit on top and dark
    underneath."""
    a, b = p["A"], p["B"]
    R = p["r0"]
    sides = 5
    apex = t.v(b, 1.0, 0.0, (0, 0, 1))
    rim, mid = [], []
    for j in range(sides):
        ang = 2 * math.pi * j / sides + k * 0.9 + rng.random() * 0.3
        rr = R * (0.85 + 0.25 * rng.random())
        c, s = math.cos(ang), math.sin(ang)
        rim.append((a.x + c * rr, a.y + s * rr, a.z - (b.z - a.z) * 0.06, c, s))
        mid.append((a.x + c * rr * 0.55, a.y + s * rr * 0.55, a.z + (b.z - a.z) * 0.4, c, s))
    for j in range(sides):
        i = (j + 1) % sides
        m1 = [t.v(q[:3], 0.95, 0.0, norm((q[3] * 0.65, q[4] * 0.65, 0.9))) for q in (mid[j], mid[i])]
        t.f((apex, m1[0], m1[1]), p["paint"])
        a1 = [t.v(q[:3], 0.85, 0.0, norm((q[3] * 0.65, q[4] * 0.65, 0.6))) for q in (mid[j], mid[i])]
        b1 = [t.v(q[:3], 0.7 + 0.15 * (j % 2), 0.0, norm((q[3] * 0.65, q[4] * 0.65, 0.25))) for q in (rim[j], rim[i])]
        t.f((a1[0], b1[0], b1[1], a1[1]), p["paint"])
        u0 = t.v(a + Vector((0, 0, (b.z - a.z) * 0.12)), 0.4, 0.0, (0, 0, -1))
        ub = [t.v(q[:3], 0.5, 0.0, norm((q[3] * 0.65, q[4] * 0.65, -0.1))) for q in (rim[j], rim[i])]
        t.f((u0, ub[1], ub[0]), p["paint"])

# ---- a PINE's tuft: a lobed cushion of needles
def tuft(t, p, far, rng, dense=False):
    """A PAD of needles where the code puts a blob: a lobed cushion, its rim
    drooping, its top domed, a dark belly under it."""
    c = p["A"]
    R = p["R"]
    r = max(R.x, R.y)
    th = R.z
    n = 4 if far else (6 if dense else 7) if r < 0.8 else (7 if dense else 9)
    z = c.z - th * 0.35
    rim, inner = [], []
    turn = rng.random() * math.pi
    for j in range(n):
        ang = 2 * math.pi * j / n + turn + rng.random() * 0.3
        lobe = 1.0 if j % 2 == 0 else 0.8
        rr = lobe * (0.85 + 0.25 * rng.random())
        cc, ss = math.cos(ang), math.sin(ang)
        rim.append((c.x + cc * R.x * rr, c.y + ss * R.y * rr, z + th * 0.25 * rng.random(), cc, ss))
        inner.append((c.x + cc * R.x * rr * 0.6, c.y + ss * R.y * rr * 0.6, z + th * 1.05, cc, ss))
    crown = t.v((c.x, c.y, z + th * 1.35), 1.0, 0.0, (0, 0, 1))
    belly = t.v((c.x, c.y, z - th * 0.45), 0.4, 0.0, (0, 0, -1))
    iv = [t.v(q[:3], 0.92, 0.0, norm((q[3] * 0.5, q[4] * 0.5, 1))) for q in inner]
    rv = [t.v(q[:3], 0.72 + 0.12 * (j % 2), 0.0, norm((q[3], q[4], 0.2))) for j, q in enumerate(rim)]
    ru = [t.v(q[:3], 0.5, 0.0, norm((q[3], q[4], -0.4))) for q in rim]
    for j in range(n):
        k = (j + 1) % n
        t.f((crown, iv[j], iv[k]), p["paint"])
        t.f((iv[j], rv[j], rv[k], iv[k]), p["paint"])
        t.f((belly, ru[k], ru[j]), p["paint"])

# ---- a BROADLEAF's clump: a lumpy mass of leaves
def clump(t, p, far, rng, open_=0.0, weep=0.0, needles=False, dense=False):
    """A CLUMP of leaves where the code puts a blob: a lumpy shell pushed out
    in a few lobes (never a ball), flatter underneath, darker inside and
    underneath, with leaves standing off its surface to break its edge —
    `open_` the share of it that is lace rather than mass (a wash tree's),
    `weep` how far those leaves hang."""
    c = p["A"]
    R = p["R"]
    size = max(R.x, R.y, R.z)
    if far:
        nu, nv = 4, 2
    elif open_ > 0 and size < 0.55:
        nu, nv = 5, 3
    elif dense:
        nu, nv = 5, 3
    elif size > 1.2:
        nu, nv = 8, 4
    elif size > 0.55:
        nu, nv = 6, 4
    else:
        nu, nv = 5, 3
    lobes = [(Vector((rng.random() - 0.5, rng.random() - 0.5, rng.random() - 0.3)).normalized(),
              0.25 + 0.25 * rng.random()) for _ in range(4)]
    def reach(d):
        k = 0.82 + sum(amp * max(0.0, d.dot(ld)) ** 2 for ld, amp in lobes)
        return k * (0.78 if d.z < 0 else 1.0)
    shell = 1.0
    turn = rng.random() * math.pi
    rings = []
    for i in range(1, nv):
        el = -math.pi / 2 + math.pi * i / nv
        ring = []
        for j in range(nu):
            az = 2 * math.pi * j / nu + turn + (i % 2) * math.pi / nu
            d = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
            k = reach(d) * shell
            q = c + Vector((d.x * R.x * k, d.y * R.y * k, d.z * R.z * k))
            sh = 0.62 + 0.38 * (0.5 + 0.5 * d.z)
            ring.append(t.v(q, sh, 0.0, norm((d.x, d.y, d.z * 0.8 + 0.35))))
        rings.append(ring)
    bot = t.v(c - Vector((0, 0, R.z * 0.7 * shell)), 0.48, 0.0, (0, 0, -1))
    top = t.v(c + Vector((0, 0, R.z * reach(Vector((0, 0, 1))) * shell)), 1.0, 0.0, (0, 0, 1))
    for i in range(len(rings) - 1):
        for j in range(nu):
            j1 = (j + 1) % nu
            t.f((rings[i][j], rings[i][j1], rings[i + 1][j1], rings[i + 1][j]), p["paint"])
    for j in range(nu):
        j1 = (j + 1) % nu
        t.f((rings[0][j1], rings[0][j], bot), p["paint"])
        t.f((rings[-1][j], rings[-1][j1], top), p["paint"])
    # The leaves off its surface, round its sides and top.
    leaves = 0 if far else (2 if open_ > 0 else (min(4 if dense else 6, max(2, round(size * 2.5))) if needles
                                                 else max(3, min(9, round(size * 4)))))
    for _ in range(leaves):
        az = rng.random() * 2 * math.pi
        el = -0.25 + rng.random() * 1.2
        d = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
        k = reach(d) * shell
        root = c + Vector((d.x * R.x * k * 0.85, d.y * R.y * k * 0.85, d.z * R.z * k * 0.85))
        out = size * (0.3 + 0.2 * rng.random() + 0.2 * open_)
        tip = root + Vector((d.x * out, d.y * out, d.z * out * 0.5 - weep * out * 0.9))
        fin(t, root, tip, size * 0.11 * (1 + open_ * 1.5), p["paint"], (0.7, 0.95), (0.0, 0.0), 0.5,
            up=0.6 - 0.4 * weep)

def berries(t, p, far, rng):
    c, R = p["A"], p["R"]
    n = 2 if far else 5
    r = max(R.x, R.z)
    for k in range(n):
        o = Vector(((rng.random() - 0.5) * r, (rng.random() - 0.5) * r, (rng.random() - 0.5) * r * 0.8))
        octa(t, c + o, r * (0.32 if not far else 0.6), p["paint"])

# ---- a CACTUS: ribbed columns, domed tips
def fluted(t, p, far, rng):
    """A fluted column: a rib, a groove, round its whole girth, swelling a
    little between its ends."""
    a, b = p["A"], p["B"]
    ribs = p.get("ribs") or 8
    L = (b - a).length
    per = 1 if far else (3 if p["r0"] > 0.24 else 2)
    sides = ribs * per
    n = 1 if far else max(1, min(4, round(L / 1.3)))
    pts = [a.lerp(b, k / n) for k in range(n + 1)]
    base = [p["r0"] + (p["r1"] - p["r0"]) * k / n for k in range(n + 1)]
    radii = [r * (1 + 0.05 * math.sin(math.pi * k / n)) for k, r in enumerate(base)]
    pair = not isinstance(p["paint"], str)
    rings = []
    prev_u = None
    for k, q in enumerate(pts):
        d = (b - a)
        u, w = frame(d)
        ring = []
        for j in range(sides):
            ang = 2 * math.pi * j / sides
            ph = j % per
            depth = 1.0 if ph == 0 else (0.86 if per == 3 else 0.82)
            if per == 1:
                depth = 1.0 if j % 2 == 0 else 0.88
                ph = j % 2
            off = u * math.cos(ang) + w * math.sin(ang)
            ring.append(t.v(q + off * radii[k] * depth, 1.0 if ph == 0 else 0.62, k / n if pair else 0.0))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for j in range(sides):
            j1 = (j + 1) % sides
            t.f((rings[k][j], rings[k][j1], rings[k + 1][j1], rings[k + 1][j]), p["paint"])

def dome(t, p, far, rng, ribs=12):
    """A cactus's tip where the code puts its blob: a ribbed dome."""
    c, R = p["A"], p["R"]
    per = 1 if far else 2
    sides = max(6, ribs) * per
    r = max(R.x, R.y)
    levels = ((c.z - R.z * 0.45, 0.92), (c.z + R.z * 0.3, 0.72))
    rings = []
    for z, k in levels:
        ring = []
        for j in range(sides):
            ang = 2 * math.pi * j / sides
            dd = 1.0 if j % per == 0 else 0.86
            ring.append(t.v((c.x + math.cos(ang) * r * k * dd, c.y + math.sin(ang) * r * k * dd, z),
                            0.95 if j % per == 0 else 0.7, 0.0, norm((math.cos(ang), math.sin(ang), 0.8))))
        rings.append(ring)
    apex = t.v((c.x, c.y, c.z + R.z * 0.95), 1.0, 0.0, (0, 0, 1))
    for j in range(sides):
        j1 = (j + 1) % sides
        t.f((rings[0][j], rings[0][j1], rings[1][j1], rings[1][j]), p["paint"])
        t.f((rings[1][j], rings[1][j1], apex), p["paint"])

# ---- a JOSHUA TREE's dead leaves and its daggers
def thatch(t, p, far, rng):
    """The skirt of dead leaves under a head (a hanging cone of the code's):
    a ring of shaggy blades from the rim down, flaring a little."""
    a, b = p["A"], p["B"]
    if a.z < b.z:
        a, b = b, a
    R = p["r0"]
    H = a.z - b.z
    n = 4 if far else max(7, min(14, round(R * 22)))
    for k in range(n):
        ang = 2 * math.pi * (k + rng.random() * 0.5) / n
        c, s = math.cos(ang), math.sin(ang)
        root = Vector((a.x + c * R * 0.55, a.y + s * R * 0.55, a.z))
        tip = Vector((a.x + c * R * (1.0 + 0.15 * rng.random()), a.y + s * R * (1.0 + 0.15 * rng.random()),
                      a.z - H * (0.75 + 0.3 * rng.random())))
        fin(t, root, tip, R * 0.32, p["paint"], (0.7, 0.9), (0.0, 0.0), 0.8, up=0.35)

def dagger(t, p, far, rng):
    """One stiff leaf of a rosette: a three-sided spike."""
    a, b = p["A"], p["B"]
    u, w = frame(b - a)
    r = p["r0"] * (1.6 if not far else 2.0)
    ring = [t.v(a + (u * math.cos(k * 2.094) + w * math.sin(k * 2.094)) * r, 0.75, 0.0) for k in range(3)]
    tip = t.v(b, 1.0, 0.0)
    for k in range(3):
        t.f((ring[k], ring[(k + 1) % 3], tip), p["paint"])

# ---- the BIRCH's marks
def marks(t, band, hosts, rng):
    """A band of the code's birch (a dark ring round the stem) as what it is
    on a birch: black marks lying ON the white bark, broken and uneven."""
    c = band["A"].lerp(band["B"], 0.5)
    host, best = None, 1e9
    for h in hosts:
        r, at = radius_at(h, c.z)
        dist = (at.xy - c.xy).length
        if dist < best:
            host, best = h, dist
    if host is None:
        return
    r, at = radius_at(host, c.z)
    r = flare(r, c.z) * 1.02 + 0.004
    axis = (host["B"] - host["A"]).normalized()
    u, w = frame(axis)
    hh = max(0.05, (band["B"] - band["A"]).length * 0.5)
    for _ in range(3):
        a0 = rng.random() * 2 * math.pi
        span = 0.5 + rng.random() * 0.9
        h0 = hh * (0.5 + rng.random())
        steps = 3
        lo, hi = [], []
        for k in range(steps + 1):
            ang = a0 + span * k / steps
            off = u * math.cos(ang) + w * math.sin(ang)
            wob = (rng.random() - 0.5) * h0 * 0.6
            n = norm(tuple(off))
            lo.append(t.v(at + off * r + axis * (-h0 + wob), 0.9, 0.0, n))
            hi.append(t.v(at + off * r + axis * (h0 + wob), 0.9, 0.0, n))
        for k in range(steps):
            t.f((lo[k], lo[k + 1], hi[k + 1], hi[k]), band["paint"])

# The undergrowth's own handlers, drawn with this file's mesh and helpers.
import plant

# What a clump of bloom becomes: a ring of petals, or a cluster of fruit.
PETALS = {"GENTIAN", "ARNICA", "FLOWER_WHITE", "LILY_BLOOM", "ALPENROSE_BLOOM", "HEDGEHOG_BLOOM", "AGAVE_BLOOM"}

# ---------------------------------------------------------------- a VARIANT, whole
def build(v, far):
    rng = random.Random(f"{KIND}/{v['id']}/{far}")
    t = Tree()
    parts = parts_of(v)
    tubes = [p for p in parts if p["shape"] == "tube"]
    stems = [p for p in tubes if on_ground(p) and p["role"] in ("bark", "wood") and not plant.lying(p)]
    cones = [p for p in parts if p["shape"] == "cone"]
    tiers = [p for p in cones if p["role"] == "needle"]
    conifer = v["form"] in ("spruce", "snapped") or (tiers and len(tiers) >= 2)
    habit = HABIT.get(v["kind"], HABIT["spruce"])
    top = max((p["B"].z for p in tiers), default=None)
    axis_xy = stems[0]["A"].xy if stems else Vector((0, 0))

    # THE BUDGET: a tall many-tiered crown shares out its boughs rather than
    # growing past them — the upper whorls are small, and a few boughs fewer
    # there is not seen.
    want = sum(max(4, min(13, 3 + p["r0"] * habit["per"])) for p in tiers) or 1
    share = min(1.0, 30 / want)

    # A crown of many clumps (a wash tree's lace, a stone pine's tufts) is
    # sketched by its biggest and every other one of the rest, a little
    # fuller each.
    clumps = [p for p in parts if p["shape"] == "clump" and p["role"] in ("needle", "leaf")]
    biggest = max((max(p["R"]) for p in clumps), default=0.0)
    crowded = len(clumps) > 14
    dense = len(clumps) > 20
    skip = set()
    if far and crowded:
        for i, p in enumerate(clumps):
            if i % 2 == 1 and max(p["R"]) < 0.7 * biggest:
                skip.add(id(p))
            else:
                p["R"] = p["R"] * 1.2

    for p in parts:
        role, shape = p["role"], p["shape"]
        if id(p) in skip:
            continue
        if shape == "tube":
            if role == "mark":
                if not far:
                    marks(t, p, stems, rng)
            elif role == "flesh":
                # A prickly pear's cylinder is a pad; a cholla's joint a stem.
                if p["type"] == "CylinderGeometry" and p["r0"] > 0.02 and (p["B"] - p["A"]).length < p["r0"] * 0.8:
                    plant.pad(t, p, far, rng)
                else:
                    limb(t, p, far, rng)
            elif role in ("bark", "wood") and plant.lying(p):
                plant.log(t, p, far, rng)
            elif any(p is s for s in stems) and p["r0"] > 0.2 and (p["B"] - p["A"]).length < 1.6:
                plant.stump(t, p, far, rng)
            elif any(p is s for s in stems):
                stretched = conifer and v["form"] == "spruce" and p is stems[0] and top is not None
                # A stem standing inside a wider one (the bark still on a
                # snag's foot) leaves the flaring to the outer; a whip of a
                # stem (a shrub's, a cane's) has no roots to flare into.
                inner = any(q is not p and q["r0"] > p["r0"] and (q["A"].xy - p["A"].xy).length < 0.15
                            for q in stems)
                trunk(t, p, far, rng, top=top if stretched else None, top_r=0.03 if stretched else None,
                      flared=not inner and p["r0"] >= 0.06)
            else:
                limb(t, p, far, rng)
        elif shape == "stub":
            stub(t, p, far, axis_xy, rng)
        elif shape == "fluted":
            fluted(t, p, far, rng)
        elif shape == "cone":
            if role == "needle" or role == "leaf":
                if far:
                    skirt(t, p, rng, len(t.faces))
                else:
                    whorl(t, p, far, rng, habit, share)
            elif role == "thatch":
                thatch(t, p, far, rng)
            elif role == "dagger":
                first = p["paint"] if isinstance(p["paint"], str) else p["paint"][0]
                # The sketch keeps one dagger in three, fatter; an agave's
                # blade is broad and folded, a yucca's a spike.
                if first == "AGAVE":
                    if not far or rng.random() < 0.5:
                        plant.agave_leaf(t, p, far, rng)
                elif not far or rng.random() < 0.34:
                    dagger(t, p, far, rng)
            elif role == "spine":
                if not far or rng.random() < 0.34:
                    plant.spike(t, p, far, rng)
            elif role in ("bone", "bark", "flesh"):
                plant.taper(t, p, far, rng)
            else:
                splinter(t, p, far, rng)
        elif shape == "blade":
            first = p["paint"] if isinstance(p["paint"], str) else p["paint"][0]
            if first in ("FERN", "FERN_TIP"):
                plant.frond(t, p, far, rng)
            else:
                plant.blade(t, p, far, rng)
        elif shape == "clump":
            first = p["paint"] if isinstance(p["paint"], str) else p["paint"][0]
            if role == "needle":
                # A tuft of needles is a mass as a clump of leaves is — a
                # cushion alone read as a plate from the road.
                clump(t, p, far, rng, needles=True, dense=dense)
            elif role == "accent":
                berries(t, p, far, rng)
            elif role == "flesh":
                ribs = max((q.get("ribs") or 0 for q in parts if q["shape"] == "fluted"), default=12)
                dome(t, p, far, rng, ribs or 12)
            elif role == "moss":
                if first == "LILY_PAD":
                    plant.lilypad(t, p, far, rng)
                else:
                    plant.cushion(t, p, far, rng)
            elif role == "head":
                if first in PETALS:
                    plant.flower(t, p, far, rng)
                elif first == "BULRUSH_HEAD":
                    plant.sausage(t, p, far, rng)
                elif first == "COTTON":
                    plant.cushion(t, p, far, rng, soft=True)
                else:
                    berries(t, p, far, rng)
            elif role == "stone":
                plant.lump(t, p, far, rng)
            elif role == "bone":
                plant.cushion(t, p, far, rng, soft=True, shade=0.95)
            elif role == "wood":
                plant.tangle(t, p, far, rng)
            else:
                wash = v["form"] == "wash"
                weep = 0.6 if v["kind"] in ("birch", "willow") else 0.0
                clump(t, p, far, rng, open_=0.3 if wash else 0.0, weep=weep)
    if conifer and tiers and not far:
        core(t, tiers, Vector((tiers[-1]["B"].x, tiers[-1]["B"].y, top)), habit, tiers[0]["paint"])
    return t

made = []
tris = {}
for v in DATA["variants"]:
    for far in (False, True):
        name = v["id"] + ("_far" if far else "")
        t = build(v, far)
        tris[name] = t.tris()
        made.append((v, far, t.object(name)))

root = bpy.data.objects.new(KIND, None)
COL.objects.link(root)
root["kind"], root["frame"] = KIND, "tree"
for _, _, ob in made:
    ob.parent = root
for v in DATA["variants"]:
    print("TRIANGLES", KIND, v["id"], "full", tris[v["id"]], "far", tris[v["id"] + "_far"])
full = [tris[v["id"]] for v in DATA["variants"]]
fars = [tris[v["id"] + "_far"] for v in DATA["variants"]]
print("TRIANGLES", KIND, "full", min(full), "-", max(full), "far", min(fars), "-", max(fars),
      "total", sum(full) + sum(fars))

if GAME:
    lib._select_only([root] + [ob for _, _, ob in made])
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{KIND}.glb"), use_selection=True, export_extras=True,
                              export_normals=True, export_vertex_color="ACTIVE", export_all_vertex_colors=False,
                              export_animations=False, export_skins=False, export_morph=False,
                              export_materials="EXPORT")

# ---------------------------------------------------------------- the STUDIO: the variants in a row
only = [x for x in os.environ.get("VIEWS", "").split(",") if x]
views = [x for x in ("row", "far", "close") if (not only or x in only)] if (not GAME or only) else []
if only == ["none"]:
    views = []
if views:
    # Side by side, each as wide as it spreads, on a summer meadow.
    x = 0.0
    spans = []
    for v, far, ob in made:
        if far:
            continue
        lo, hi = v["bounds"]["min"], v["bounds"]["max"]
        half = max(abs(lo[0]), abs(hi[0]), abs(lo[2]), abs(hi[2]), 1.0)
        x += half * 1.15
        spans.append((v["id"], x))
        x += half * 1.15
    at = dict(spans)
    for v, far, ob in made:
        ob.location = (at[v["id"]], 0, 0)
    width = x
    tall = max(v["bounds"]["max"][1] for v in DATA["variants"])
    ground = mat("meadow", (0.16, 0.22, 0.08), rough=0.95)
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
            # The first variant from a car's seat: fourteen metres off a
            # tree, as near as frames a plant.
            first = spans[0][1]
            scene.render.resolution_x, scene.render.resolution_y = 900, 1200
            cd.lens = 24
            off = max(2.5, min(14.0, tall * 1.4 + 1.0))
            cam.location = (first, -off, min(1.3, 0.35 + tall * 0.45))
            cam.rotation_euler = (math.radians(90 + 14 * min(1.0, off / 14)), 0, 0)
        else:
            aspect = max(1.6, width / max(1.0, tall * 1.12))
            scene.render.resolution_x = min(2400, round(420 * aspect))
            scene.render.resolution_y = round(scene.render.resolution_x / aspect)
            cd.type = "ORTHO"
            cd.ortho_scale = max(width * 1.02, tall * 1.12 * aspect)
            cam.location = (width / 2, -200, tall * 0.55 * 1.12 * 0.9)
            cam.rotation_euler = (math.radians(90), 0, 0)
        for v, far, ob in made:
            ob.hide_render = far != (view == "far")
        scene.camera = cam
        scene.render.filepath = os.path.join(OUT, f"{KIND}-{tag}-{view}.png")
        bpy.ops.render.render(write_still=True)
