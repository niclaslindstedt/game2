# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# THE UNDERGROWTH MODELLED IN BLENDER: what `tree.py` makes of the parts
# that are not a tree's — every shrub, tuft, reed, cushion, cactus, flower
# and log the flora plants (`PLANT_KINDS`, `pwa/src/game/flora-trees.ts`),
# each over the skeleton its code recipe lays, in the same frame and the
# same paint names. A grass blade of the code's (a flat quad) is an ARCHED
# blade tapering to a point; a fern's is a FROND of leaflets on a midrib; a
# moss blob is a lumpy CUSHION; a flower blob is a ring of PETALS; a cattail
# head a SAUSAGE; a cotton head a PUFF; a cairn's blobs faceted LUMPS; a
# tumbleweed a TANGLE of stems; a prickly pear's cylinders rounded PADS; a
# cactus's spines three-sided SPIKES; a lying trunk a LOG cut flat at both
# ends. `tree.py` decides which of these a part becomes (`build`), and
# lends the mesh and the helpers this file draws with (`tube`, `fin`,
# `octa`, `norm`), read off the running script.

import math, sys
from mathutils import Vector

# The tree builder, as the running script: its mesh under construction and
# the helpers every part is drawn with.
H = sys.modules["__main__"]

def placed(p):
    """The part's own frame: a function taking a point in the PRISTINE
    primitive's frame (three's own box, plane or cylinder) to Blender's, the
    way the recipe placed it (`TracedPart.m`, column-major, game frame)."""
    m = p["m"]
    def at(x, y, z):
        gx = m[0] * x + m[4] * y + m[8] * z + m[12]
        gy = m[1] * x + m[5] * y + m[9] * z + m[13]
        gz = m[2] * x + m[6] * y + m[10] * z + m[14]
        return Vector((gx, -gz, gy))
    return at

def is_pair(paint):
    return not isinstance(paint, str)

# ---------------------------------------------------------------- BLADES
def blade(t, p, far, rng):
    """A grass, sedge or reed blade where the code stands a flat quad:
    arched over along its own lean, tapering to a point, both faces lit out
    and up. The sketch is the quad."""
    at = placed(p)
    w, h = p["size"][0], p["size"][1]
    root, tip = at(0, -h / 2, 0), at(0, h / 2, 0)
    side = (at(w / 2, 0, 0) - at(-w / 2, 0, 0)) * 0.5
    axis = tip - root
    L = axis.length
    if L < 1e-4 or side.length < 1e-6:
        return
    paint = p["paint"]
    pair = is_pair(paint)
    if far:
        H.fin(t, root, tip, side.length, paint, (0.85, 1.0), (0.0, 1.0 if pair else 0.0), 0.15, up=0.7)
        return
    # The arch: over along the lean the recipe gave the blade, and a reed
    # (nearly upright) a little to one side of its own plane.
    lean = Vector((axis.x, axis.y, 0))
    if lean.length < 0.2 * L:
        n = side.cross(axis)
        lean = Vector((n.x, n.y, 0))
    lean = lean.normalized() if lean.length > 1e-6 else Vector((1, 0, 0))
    droop = L * (0.18 + 0.22 * rng.random()) * (0.5 if L > 1.6 else 1.0)
    segs = 3
    sdir = side.normalized()
    up_n = H.norm((lean.x * 0.5, lean.y * 0.5, 0.85))
    dn_n = H.norm((lean.x * 0.6, lean.y * 0.6, 0.3))
    left, right, uleft, uright = [], [], [], []
    for k in range(segs + 1):
        u = k / segs
        q = root + axis * u + lean * droop * u * u - Vector((0, 0, droop * 0.45 * u * u))
        hw = side.length * (1.0 - 0.85 * u * u)
        sh = 0.8 + 0.2 * u
        bl = u if pair else 0.0
        left.append(t.v(q + sdir * hw, sh, bl, up_n))
        right.append(t.v(q - sdir * hw, sh, bl, up_n))
        uleft.append(t.v(q + sdir * hw, sh * 0.85, bl, dn_n))
        uright.append(t.v(q - sdir * hw, sh * 0.85, bl, dn_n))
    for k in range(segs):
        t.f((left[k], left[k + 1], right[k + 1], right[k]), paint)
        t.f((uright[k], uright[k + 1], uleft[k + 1], uleft[k]), paint)

def frond(t, p, far, rng):
    """A fern's blade as a frond: an arched midrib with leaflets in pairs,
    shortest at the tip."""
    at = placed(p)
    w, h = p["size"][0], p["size"][1]
    root, tip = at(0, -h / 2, 0), at(0, h / 2, 0)
    side = (at(w / 2, 0, 0) - at(-w / 2, 0, 0)) * 0.5
    axis = tip - root
    L = axis.length
    if L < 1e-4 or side.length < 1e-6:
        return
    paint = p["paint"]
    pair = is_pair(paint)
    if far:
        H.fin(t, root, tip, side.length, paint, (0.8, 1.0), (0.0, 1.0 if pair else 0.0), 0.3, up=0.7)
        return
    lean = Vector((axis.x, axis.y, 0))
    lean = lean.normalized() if lean.length > 1e-6 else Vector((1, 0, 0))
    droop = L * 0.3
    def on(u):
        return root + axis * u + lean * droop * u * u - Vector((0, 0, droop * 0.5 * u * u))
    # The midrib.
    pts = [on(u) for u in (0.0, 0.35, 0.7, 1.0)]
    H.tube(t, pts, [side.length * 0.12, side.length * 0.1, side.length * 0.07, side.length * 0.03], 3, paint,
           lambda k, j: (0.7, (k / 3) if pair else 0.0))
    sdir = side.normalized()
    # The leaflets reach as far as the code's blade was wide, or a third of
    # the frond's length — a frond is a leaf, not a feather.
    span = max(side.length, L * 0.36)
    for u, reach in ((0.16, 0.8), (0.3, 1.0), (0.45, 1.0), (0.6, 0.9), (0.75, 0.7), (0.9, 0.45)):
        q = on(u)
        out = span * reach
        for s in (1, -1):
            end = q + sdir * out * s + lean * out * 0.3 - Vector((0, 0, out * 0.2))
            H.fin(t, q, end, out * 0.5, paint, (0.75, 1.0), (u, u) if pair else (0.0, 0.0), 0.3, up=0.8)

# ---------------------------------------------------------------- CUSHIONS, PADS, HEADS
def cushion(t, p, far, rng, soft=False, shade=1.0):
    """A cushion of moss (or a puff of cotton, a skull's dome) where the code
    puts a blob: a low lumpy mound, flat underneath, brightest on top."""
    c, R = p["A"], p["R"]
    nu, nv = (5, 2) if far else (8, 3)
    lobes = [(Vector((rng.random() - 0.5, rng.random() - 0.5, rng.random() * 0.5)).normalized(),
              0.12 + 0.18 * rng.random()) for _ in range(5)]
    def reach(d):
        return 0.86 + sum(amp * max(0.0, d.dot(ld)) ** 2 for ld, amp in lobes)
    turn = rng.random() * math.pi
    rings = []
    floor = c.z - R.z * (0.55 if soft else 0.75)
    for i in range(nv):
        # A mound's rings start under its middle, so its sides come down to
        # the ground rather than stopping at a floating rim.
        el = -0.5 + (math.pi / 2 + 0.5) * (i / nv) if not soft else -math.pi / 2 + math.pi * (i + 1) / (nv + 1)
        ring = []
        for j in range(nu):
            az = 2 * math.pi * j / nu + turn + (i % 2) * math.pi / nu
            d = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
            k = reach(d)
            q = Vector((c.x + d.x * R.x * k, c.y + d.y * R.y * k, max(floor, c.z + d.z * R.z * k)))
            sh = (0.7 + 0.3 * (0.5 + 0.5 * d.z)) * shade
            ring.append(t.v(q, sh, 0.0, H.norm((d.x, d.y, d.z * 0.7 + 0.5))))
        rings.append(ring)
    top = t.v(Vector((c.x, c.y, c.z + R.z * reach(Vector((0, 0, 1))))), 1.0 * shade, 0.0, (0, 0, 1))
    for i in range(len(rings) - 1):
        for j in range(nu):
            j1 = (j + 1) % nu
            t.f((rings[i][j], rings[i][j1], rings[i + 1][j1], rings[i + 1][j]), p["paint"])
    for j in range(nu):
        t.f((rings[-1][j], rings[-1][(j + 1) % nu], top), p["paint"])
    if soft:
        bot = t.v(Vector((c.x, c.y, floor)), 0.55 * shade, 0.0, (0, 0, -1))
        for j in range(nu):
            t.f((rings[0][(j + 1) % nu], rings[0][j], bot), p["paint"])

def lilypad(t, p, far, rng):
    """A lily pad: a flat disc on the water with a notch cut to its centre,
    its rim lifted a little."""
    c, R = p["A"], p["R"]
    r = max(R.x, R.y)
    n = 6 if far else 10
    notch = rng.random() * 2 * math.pi
    centre = t.v(Vector((c.x, c.y, c.z + R.z)), 1.0, 0.0, (0, 0, 1))
    rim, skirt = [], []
    for j in range(n + 1):
        ang = notch + 0.35 + (2 * math.pi - 0.7) * j / n
        cc, ss = math.cos(ang), math.sin(ang)
        rim.append(t.v(Vector((c.x + cc * r, c.y + ss * r, c.z + R.z * 0.7)), 0.95, 0.0, H.norm((cc * 0.3, ss * 0.3, 1))))
        # The pad's thickness, seen from the road: a skirt down its rim.
        skirt.append(t.v(Vector((c.x + cc * r * 0.97, c.y + ss * r * 0.97, c.z - R.z)), 0.7, 0.0, H.norm((cc, ss, 0.1))))
    for j in range(n):
        t.f((centre, rim[j], rim[j + 1]), p["paint"])
        t.f((rim[j], skirt[j], skirt[j + 1], rim[j + 1]), p["paint"])

def flower(t, p, far, rng):
    """A flower head where the code puts a blob of bloom: a ring of petals
    round a little centre, tilted up to the light."""
    c, R = p["A"], p["R"]
    r = max(R.x, R.y, R.z)
    if far:
        H.octa(t, c, r * 0.8, p["paint"], 1.0)
        return
    n = 5 if r < 0.06 else 6
    turn = rng.random() * math.pi
    H.octa(t, c, r * 0.3, p["paint"], 0.8)
    for k in range(n):
        ang = turn + 2 * math.pi * k / n
        d = Vector((math.cos(ang), math.sin(ang), 0))
        root = c + d * r * 0.2
        tip = c + d * r * 1.15 + Vector((0, 0, r * 0.35))
        H.fin(t, root, tip, r * 0.42, p["paint"], (0.9, 1.0), (0.0, 0.0), 0.55, up=0.9)

def sausage(t, p, far, rng):
    """A cattail's head: a smooth brown sausage on its stem."""
    c, R = p["A"], p["R"]
    r = max(R.x, R.y)
    sides = 4 if far else 7
    levels = ((-1.0, 0.55), (-0.6, 0.95), (0.0, 1.0), (0.6, 0.95), (1.0, 0.55))
    rings = []
    for z, k in levels:
        ring = []
        for j in range(sides):
            ang = 2 * math.pi * j / sides
            cc, ss = math.cos(ang), math.sin(ang)
            ring.append(t.v(Vector((c.x + cc * r * k, c.y + ss * r * k, c.z + z * R.z)), 0.85 + 0.15 * (z + 1) / 2,
                            0.0, H.norm((cc, ss, z * 0.6))))
        rings.append(ring)
    lo = t.v(Vector((c.x, c.y, c.z - R.z * 1.1)), 0.8, 0.0, (0, 0, -1))
    hi = t.v(Vector((c.x, c.y, c.z + R.z * 1.1)), 1.0, 0.0, (0, 0, 1))
    for k in range(len(rings) - 1):
        for j in range(sides):
            j1 = (j + 1) % sides
            t.f((rings[k][j], rings[k][j1], rings[k + 1][j1], rings[k + 1][j]), p["paint"])
    for j in range(sides):
        j1 = (j + 1) % sides
        t.f((rings[0][j1], rings[0][j], lo), p["paint"])
        t.f((rings[-1][j], rings[-1][j1], hi), p["paint"])

def lump(t, p, far, rng):
    """A stone where the code puts a blob: a faceted lump — every face its
    own flat plane, the top faces lit, the underside dark."""
    c, R = p["A"], p["R"]
    phi = (1 + math.sqrt(5)) / 2
    base = [(-1, phi, 0), (1, phi, 0), (-1, -phi, 0), (1, -phi, 0), (0, -1, phi), (0, 1, phi), (0, -1, -phi),
            (0, 1, -phi), (phi, 0, -1), (phi, 0, 1), (-phi, 0, -1), (-phi, 0, 1)]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
             (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11),
             (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    turn = rng.random() * math.pi
    ct, st = math.cos(turn), math.sin(turn)
    pts = []
    for x, y, z in base:
        k = (0.8 + 0.3 * rng.random()) / math.sqrt(1 + phi * phi)
        q = Vector((x * k, y * k, z * k))
        q = Vector((q.x * ct - q.y * st, q.x * st + q.y * ct, q.z))
        pts.append(Vector((c.x + q.x * R.x, c.y + q.y * R.y, c.z + q.z * R.z * 0.8)))
    for a, b, d in faces:
        n = (pts[b] - pts[a]).cross(pts[d] - pts[a])
        if n.length < 1e-9:
            continue
        n = n.normalized()
        sh = 0.62 + 0.38 * (0.5 + 0.5 * n.z)
        t.f((t.v(pts[a], sh, 0.0, tuple(n)), t.v(pts[b], sh, 0.0, tuple(n)), t.v(pts[d], sh, 0.0, tuple(n))),
            p["paint"])

def tangle(t, p, far, rng):
    """A tumbleweed or a dead bush where the code puts a blob of twigs: a
    tangle of thin stems arcing through the ball."""
    c, R = p["A"], p["R"]
    r = max(R.x, R.y, R.z)
    n = 4 if far else 16
    for _ in range(n):
        a = Vector((rng.random() - 0.5, rng.random() - 0.5, rng.random() - 0.5)).normalized()
        b = Vector((rng.random() - 0.5, rng.random() - 0.5, rng.random() - 0.5)).normalized()
        mid = (a + b).normalized() * 0.95 if (a + b).length > 0.2 else a.cross(b).normalized() * 0.7
        pts = [Vector((c.x + q.x * R.x, c.y + q.y * R.y, c.z + q.z * R.z)) for q in (a, mid, b)]
        H.tube(t, pts, [r * 0.05] * 3, 3, p["paint"], lambda k, j: (0.8 + 0.2 * (j % 2), 0.0))

def pad(t, p, far, rng):
    """A prickly pear's pad where the code stands a flat cylinder on edge: a
    rounded oval plate, its rim smooth."""
    at = placed(p)
    r_top, r_bot, h = p["size"]
    r = (r_top + r_bot) * 0.5
    n = 6 if far else 10
    ys = ((h * 0.5, 0.0), (h * 0.36, 0.86), (0.0, 1.02), (-h * 0.36, 0.86), (-h * 0.5, 0.0))
    rings = []
    for y, k in ys:
        if k == 0.0:
            rings.append(t.v(at(0, y, 0), 0.95 if y > 0 else 0.8, 0.0, None))
            continue
        ring = []
        for j in range(n):
            ang = 2 * math.pi * j / n
            # An oval: the pad is longer up its own plane than across it.
            rr = r * k * (1.0 + 0.12 * math.cos(2 * ang))
            ring.append(t.v(at(math.cos(ang) * rr, y, math.sin(ang) * rr), 0.9 + 0.1 * (j % 2), 0.0, None))
        rings.append(ring)
    for j in range(n):
        j1 = (j + 1) % n
        t.f((rings[0], rings[1][j1], rings[1][j]), p["paint"])
        t.f((rings[1][j], rings[1][j1], rings[2][j1], rings[2][j]), p["paint"])
        t.f((rings[2][j], rings[2][j1], rings[3][j1], rings[3][j]), p["paint"])
        t.f((rings[3][j], rings[3][j1], rings[4]), p["paint"])

def spike(t, p, far, rng):
    """A spine: a three-sided needle, bright."""
    a, b = p["A"], p["B"]
    u, w = H.frame(b - a)
    r = p["r0"] * (0.9 if not far else 1.4)
    ring = [t.v(a + (u * math.cos(k * 2.094) + w * math.sin(k * 2.094)) * r, 1.0, 0.0) for k in range(3)]
    tip = t.v(b, 1.0, 0.0)
    for k in range(3):
        t.f((ring[k], ring[(k + 1) % 3], tip), p["paint"])

def taper(t, p, far, rng):
    """A cone of wood or bone (a horn, a broken branch's end) as a tapered
    round stem."""
    a, b = p["A"], p["B"]
    sides = 3 if far else 5
    mid = a.lerp(b, 0.5) + Vector((0, 0, (b - a).length * 0.06))
    H.tube(t, [a, mid, b], [p["r0"], p["r0"] * 0.55, max(p["r1"], p["r0"] * 0.12)], sides, p["paint"],
           lambda k, j: (0.8 + 0.1 * k, 0.0), cap=True)

def log(t, p, far, rng):
    """A trunk lying on the ground: cut flat at both ends, a little fatter
    where it was the butt, its bark ridged along its length."""
    a, b = p["A"], p["B"]
    sides = 4 if far else 8
    n = 1 if far else 3
    pts = [a.lerp(b, k / n) for k in range(n + 1)]
    radii = [p["r0"] + (p["r1"] - p["r0"]) * k / n for k in range(n + 1)]
    pair = is_pair(p["paint"])
    def tone(k, j):
        return (0.75 + 0.25 * (0.5 + 0.5 * math.cos(2 * math.pi * j / sides)), (k / n) if pair else 0.0)
    rings = H.tube(t, pts, radii, sides, p["paint"], tone)
    for ring, at_ in ((rings[0], pts[0]), (rings[-1], pts[-1])):
        d = (pts[-1] - pts[0]).normalized() * (1 if ring is rings[-1] else -1)
        c = t.v(at_, 0.9, 0.0, tuple(d))
        for j in range(sides):
            j1 = (j + 1) % sides
            if ring is rings[-1]:
                t.f((ring[j], ring[j1], c), p["paint"])
            else:
                t.f((ring[j1], ring[j], c), p["paint"])

def lying(p):
    """Whether a tube lies along the ground rather than standing on it."""
    a, b = p["A"], p["B"]
    d = b - a
    return d.length > 0.3 and abs(d.z) < 0.4 * d.length and min(a.z, b.z) < 1.2

def stump(t, p, far, rng):
    """A cut stump where the code stands a short wide cylinder: bark ridged
    round it, flaring into three root buttresses at its foot — never the
    mound a trunk's flare makes of a metre of wood."""
    a, b = p["A"], p["B"]
    sides = 6 if far else 10
    n = 1 if far else 3
    pts = [a.lerp(b, k / n) for k in range(n + 1)]
    radii = [p["r0"] + (p["r1"] - p["r0"]) * k / n for k in range(n + 1)]
    if not far:
        radii[0] *= 1.12
    # The bark's ridges: alternate facets a shade apart round the stump.
    ridge = [1.0 + 0.05 * (j % 2) for j in range(sides)]
    H.tube(t, pts, radii, sides, p["paint"], lambda k, j: (0.7 + 0.3 * (0.5 + 0.5 * math.cos(2 * math.pi * j / sides + 1)) * ridge[j], 0.0))
    if far:
        return
    for k in range(3):
        ang = rng.random() * 0.6 + 2 * math.pi * k / 3
        d = Vector((math.cos(ang), math.sin(ang), 0))
        root = a + d * p["r0"] * 0.7 + Vector((0, 0, 0.18))
        tip = a + d * p["r0"] * (1.5 + 0.4 * rng.random()) + Vector((0, 0, 0.02))
        H.tube(t, [root, tip], [p["r0"] * 0.32, p["r0"] * 0.1], 4, p["paint"], lambda k_, j: (0.75, 0.0), cap=True)

def agave_leaf(t, p, far, rng):
    """A rosette's blade where the code stands a thin cone: a broad, thick
    leaf folded up its middle, both faces, its tip the spine's colour."""
    a, b = p["A"], p["B"]
    d = b - a
    L = d.length
    if L < 1e-4:
        return
    dn = d.normalized()
    u, w = H.frame(d)
    # The leaf lies across the rosette: its width runs round the plant,
    # which is the direction at right angles to its lean and to up.
    side = Vector((-dn.y, dn.x, 0))
    side = side.normalized() if side.length > 1e-6 else u
    keel = side.cross(dn).normalized()
    if keel.z < 0:
        keel = -keel
    paint = p["paint"]
    pair = is_pair(paint)
    hw = p["r0"] * (2.2 if not far else 2.6)
    segs = 1 if far else 2
    ridge, left, right = [], [], []
    for k in range(segs + 1):
        v = k / segs
        q = a + dn * L * v + keel * (L * 0.08 * v * v)
        ww = hw * (1.0 - 0.9 * v * v)
        bl = v if pair else 0.0
        ridge.append(t.v(q + keel * hw * 0.25 * (1 - v), 1.0, bl, tuple(keel)))
        left.append(t.v(q + side * ww, 0.78, bl, H.norm(tuple(keel * 0.7 + side * 0.5))))
        right.append(t.v(q - side * ww, 0.78, bl, H.norm(tuple(keel * 0.7 - side * 0.5))))
    for k in range(segs):
        t.f((left[k], left[k + 1], ridge[k + 1], ridge[k]), paint)
        t.f((ridge[k], ridge[k + 1], right[k + 1], right[k]), paint)
    if far:
        return
    under = [t.v(a + dn * L * v + keel * (L * 0.08 * v * v) - keel * hw * 0.1, 0.55, v if pair else 0.0,
                 tuple(-keel)) for v in (0.0, 0.5, 1.0)]
    uleft = [t.v(a + dn * L * v + keel * (L * 0.08 * v * v) + side * hw * (1.0 - 0.9 * v * v), 0.6,
                 v if pair else 0.0, tuple(-keel)) for v in (0.0, 0.5, 1.0)]
    uright = [t.v(a + dn * L * v + keel * (L * 0.08 * v * v) - side * hw * (1.0 - 0.9 * v * v), 0.6,
                  v if pair else 0.0, tuple(-keel)) for v in (0.0, 0.5, 1.0)]
    for k in range(2):
        t.f((uleft[k + 1], uleft[k], under[k], under[k + 1]), paint)
        t.f((under[k + 1], under[k], uright[k], uright[k + 1]), paint)
