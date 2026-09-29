# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# THE CAR BUILDER (`make blender`, KIND=car): a rally car MODELLED off the
# game's own numbers for one catalog car — `scripts/lib/car-model-data.mjs`
# hands it the spec, the shell's stations and rings, the greenhouse's
# panels, and every bolt-on's plan — so the modelled car stands exactly
# where the code-built one does, to the millimetre, and the game can lay the
# code's own DRESS (the livery bands, the numbers, the lamps and grilles,
# the glass) over the model's FORMS.
#
# THE FRAME. The car's body frame: game x to the car's right, y up from the
# road, z forward (the nose +z). Blender is z up, so a game point (x, y, z)
# is modelled at (x, -z, y); the glTF export turns it straight back, so the
# game reads the model in its own frame with nothing to turn.
#
# WHAT IS MODELLED (each its own named PART, the unit the game takes over):
#   body         the shell — a creased subdivision cage lofted through the
#                code's own rings, the shut lines grooved into it, the
#                bonnet's hole cut for the engine bay — the greenhouse's
#                metal, seals, gutters and scoops, the arch extensions, the
#                mud flaps, the air dam, the valance and the tailgate
#   cabin_deck   the deck under the greenhouse, which the game drops on the
#                one car that is sat in (the cockpit is built there)
#   bumperF/R, hood, hatch, doorL/R, mirrorL/R, spoiler
#                the bolt-ons the damage ledger names, each a mesh of its
#                own so the game can tear it off
#   wheel_fl/fr/rl/rr   the wheels, each on its own bone
#
# THE RIG. Every part rides `root` but the wheels: `steer_fl` / `steer_fr`
# stand up through the front wheels' centres (a turn about them is the
# lock), and each `wheel_*` bone runs along its axle (a turn about it is the
# wheel rolling; a lift is the suspension's travel). The clips are `steer`
# (lock to lock), `travel` (full bump to full droop) and `roll` (one
# revolution), off the numbers the game poses the code car by.

import json, math, os, sys
sys.path.append(os.path.dirname(__file__))
from lib import *  # noqa: F401,F403
import lib

ARGV = sys.argv[sys.argv.index("--") + 1:]
DATA, OUT, SAMPLES = ARGV[0], ARGV[1], int(ARGV[2])
D = json.load(open(DATA))
SPEC = D["spec"]
AXLES = D["axles"]


def B(p):
    """A game point in Blender's frame."""
    return Vector((p[0], -p[2], p[1]))


# ---------------------------------------------------------------- materials
METAL = {"rim", "barrel", "dish", "disc", "bolt"}


def material(role):
    shine = D["shine"].get(role, 0.55)
    col = D["dress"].get(role, [0.5, 0.5, 0.5])
    if role in METAL:
        return mat(role, col, metal=1.0, rough=0.28)
    if role == "mirror_glass":
        return mat(role, col, metal=0.6, rough=0.05)
    rough = 0.9 - 0.75 * shine
    coat = 0.8 if shine >= 0.5 else 0.0
    return mat(role, col, rough=rough, coat=coat)


def mesh(name, verts, faces, roles, smooth=True, recalc=False, sharp=None, creases=None, merge=0.0):
    """A mesh off raw faces, a ROLE a face (its material's name). `sharp`
    and `creases` pick edges by their two vertices' indices; `merge`
    welds coincident points (the shell's rings collapse points that only
    open over an arch) and drops what that leaves degenerate."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    tag = bm.verts.layers.int.new("i")
    crease_layer = bm.edges.layers.float.new("crease_edge")
    vs = [bm.verts.new(B(v) if not isinstance(v, Vector) else v) for v in verts]
    for i, v in enumerate(vs):
        v[tag] = i
    names = sorted(set(roles))
    for f, r in zip(faces, roles):
        loop = []
        for i in f:
            if not loop or loop[-1] is not vs[i]:
                loop.append(vs[i])
        if len(loop) > 2 and loop[0] is loop[-1]:
            loop.pop()
        if len(set(loop)) < 3:
            continue
        try:
            face = bm.faces.new(loop)
        except ValueError:
            continue
        face.material_index = names.index(r)
        face.smooth = smooth
    if merge:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
        bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if sharp or creases:
        layer = crease_layer
        for e in bm.edges:
            a, b = e.verts[0][tag], e.verts[1][tag]
            if sharp and sharp(a, b):
                e.smooth = False
            if creases:
                w = creases(a, b)
                if w:
                    e[layer] = w
    bm.to_mesh(me)
    bm.free()
    for r in names:
        me.materials.append(material(r))
    return lib.link(bpy.data.objects.new(name, me))


def modifier(ob, kind, **kw):
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    return m


def bevel(ob, width, segments=None, angle=40):
    return modifier(ob, "BEVEL", width=width, segments=segments or (1 if GAME else 3),
                    limit_method="ANGLE", angle_limit=math.radians(angle), harden_normals=False)


def subsurf(ob, game=1, render=2):
    lvl = game if GAME else render
    if lvl:
        modifier(ob, "SUBSURF", levels=lvl, render_levels=lvl)


def rbox(name, c, s, role, round_=0.006, sub=True):
    """A box, centre and size in the game's frame, its edges rounded."""
    x, y, z = s[0] / 2, s[1] / 2, s[2] / 2
    corners = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
    verts = [(c[0] + i * x, c[1] + j * y, c[2] + k * z) for i, j, k in corners]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]
    ob = mesh(name, verts, faces, [role] * 6, smooth=True, recalc=True)
    bevel(ob, min(round_, min(s) * 0.45), angle=30)
    return ob


def section_loft(name, path, sections, roles_of=None, role="paint", cap=True, smooth=True):
    """Rings `sections[i]` (game-frame points) lofted in order; `roles_of(i,
    j)` the role of the band from ring i to i + 1 at point j."""
    M = len(sections[0])
    verts = [p for s in sections for p in s]
    faces, roles = [], []
    for i in range(len(sections) - 1):
        a, b = i * M, (i + 1) * M
        for j in range(M):
            j1 = (j + 1) % M
            faces.append((a + j, a + j1, b + j1, b + j))
            roles.append(roles_of(i, j) if roles_of else role)
    if cap:
        faces.append(tuple(range(M))[::-1])
        faces.append(tuple(range((len(sections) - 1) * M, len(sections) * M)))
        roles += [role, role]
    return mesh(name, verts, faces, roles, smooth=smooth, recalc=True, merge=1e-5)


def rounded_rect(cx, cy, hw, hh, n=6, M=16):
    """A rounded rectangle in some plane: points as (u, v) off a centre."""
    return [(cx + u, cy + v) for u, v in superellipse(hw, hh, n, M)]


# ---------------------------------------------------------------- the shell
# The code's ring (car/shell.ts `ring`), point by point: 0 the floor's
# centre, 1–3 the wheel well and the rocker (collapsed onto each other away
# from an arch), 4 the lower flank, 5 the BELT, 6 the upper flank, 7 the
# deck's edge, 8 the deck's centre, and the far side back round.
LOWER = {3, 4, 11, 12}
CREASE = {1: 1.0, 2: 1.0, 3: 1.0, 13: 1.0, 14: 1.0, 15: 1.0, 5: 0.92, 11: 0.92, 7: 0.55, 9: 0.55}
SHARP = {1, 2, 3, 13, 14, 15}


def segment_role(k, tail, gap):
    if k in (0, 15):
        return "under"
    if k in (1, 2, 13, 14):
        return "well"
    base = "lower" if k in LOWER else "paint"
    if gap:
        return "seam_lower" if base == "lower" else ("seam_tail" if tail else "seam")
    return base + ("_tail" if tail else "")


def build_shell():
    st = D["stations"]
    halves = sorted({c["half"] for c in D["cuts"]}, reverse=True)
    rings, ks = [], None
    for s in st:
        r = s["ring"]
        top = r[7][0]
        pts, kk = [], []
        for k in range(16):
            pts.append(r[k]); kk.append(k)
            if k == 7:
                for h in halves:
                    pts.append([min(h, top * 0.995), r[7][1], r[7][2]]); kk.append(7)
            if k == 8:
                for h in reversed(halves):
                    pts.append([-min(h, top * 0.995), r[8][1], r[8][2]]); kk.append(8)
        rings.append(pts)
        ks = kk
    M = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces, roles, deck = [], [], []
    for i in range(len(rings) - 1):
        a, c = i * M, (i + 1) * M
        zmid = (st[i]["z"] + st[i + 1]["z"]) / 2
        cut = next((q for q in D["cuts"] if q["zTo"] - 1e-6 <= zmid <= q["zFrom"] + 1e-6), None)
        for j in range(M):
            j2 = (j + 1) % M
            k = ks[j]
            f = (a + j2, a + j, c + j, c + j2)
            if cut and ks[j] in (7, 8) and ks[j2] in (7, 8) and ks[j] + ks[j2] <= 16:
                inner = max(abs(rings[i][j][0]), abs(rings[i][j2][0]))
                if inner <= cut["half"] + 1e-6 and rings[i][j][1] == rings[i][j2][1]:
                    if cut["kind"] == "cabin":
                        deck.append(f)
                    continue
            faces.append(f)
            roles.append(segment_role(k, st[i]["tail"], D["gaps"][i]))
    # The caps: an inset ring the flank's colours run round, and a panel in
    # the middle — flat, so the lamps and the grille the code lets into it
    # stand where they always did, with a round on the corner.
    n0 = len(verts)
    for idx, fwd in ((0, True), (len(rings) - 1, False)):
        ring = rings[idx]
        cx = sum(p[0] for p in ring) / M
        cy = sum(p[1] for p in ring) / M
        inset = [[cx + (p[0] - cx) * 0.9, cy + (p[1] - cy) * 0.9, p[2]] for p in ring]
        base = len(verts)
        verts += inset
        tail = st[idx]["tail"]
        paint = "paint_tail" if tail else "paint"
        for j in range(M):
            j2 = (j + 1) % M
            o0, o1 = idx * M + j, idx * M + j2
            q = (o0, o1, base + j2, base + j) if fwd else (o1, o0, base + j, base + j2)
            faces.append(q)
            k = ks[j]
            roles.append(("lower_tail" if tail else "lower") if k in LOWER else ("under" if k in (0, 15) else paint))
        inner = tuple(range(base, base + M))
        faces.append(inner if fwd else inner[::-1])
        roles.append(paint)

    def kof(v):
        return ks[v % M] if v < n0 else -1

    def sof(v):
        return v // M if v < n0 else -9

    def along(a, b):
        return a < n0 and b < n0 and abs(sof(a) - sof(b)) == 1 and kof(a) == kof(b)

    def crease(a, b):
        if along(a, b):
            return CREASE.get(kof(a))
        if a < n0 and b < n0 and sof(a) == sof(b) and sof(a) in (0, len(rings) - 1):
            return 0.7
        if a < n0 and b < n0 and sof(a) == sof(b) and st[sof(a)]["fold"]:
            return 0.85  # a box flare's folded end
        if a < n0 and b < n0 and sof(a) == sof(b) and st[sof(a)]["seam"]:
            return 1.0   # a shut line's groove stays a sharp V
        if a < n0 and b < n0 and sof(a) == sof(b) and st[sof(a)]["profile"]:
            return 0.35
        return None

    body = mesh("shell", verts, faces, roles, smooth=True, merge=1e-5,
                sharp=lambda a, b: along(a, b) and kof(a) in SHARP, creases=crease)
    subsurf(body)
    if deck:
        part("cabin_deck")
        d = mesh("cabin_deck", verts, deck, ["paint"] * len(deck), smooth=True, merge=1e-5)
        subsurf(d)
        part("body")


# ---------------------------------------------------------------- the greenhouse
def build_greenhouse():
    g = D["greenhouse"]
    verts, faces, roles = [], [], []
    seals = []
    for q in g["quads"]:
        if q["role"] == "seal":
            seals.append(q)
            continue
        base = len(verts)
        verts += q["pts"]
        faces.append((base, base + 1, base + 2, base + 3))
        roles.append(q["role"])
    frame = mesh("greenhouse", verts, faces, roles, smooth=False, merge=5e-4)
    modifier(frame, "SOLIDIFY", thickness=0.007, offset=-1.0, use_even_offset=True)
    bevel(frame, 0.0035, angle=25)
    if seals:
        sv, sf = [], []
        for q in seals:
            base = len(sv)
            sv += q["pts"]
            sf.append((base, base + 1, base + 2, base + 3))
        rub = mesh("seals", sv, sf, ["seal"] * len(sf), smooth=False, merge=5e-4)
        modifier(rub, "SOLIDIFY", thickness=0.004, offset=-1.0)
    for i, b in enumerate(g["gutters"]):
        rbox(f"gutter{i}", b["c"], b["s"], "gutter", 0.008)
    for i, b in enumerate(g["vents"]):
        rbox(f"vent{i}", b["c"], b["s"], "vent_mouth" if b["mouth"] else "vent", 0.004 if b["mouth"] else 0.01)


# ---------------------------------------------------------------- the bolt-ons
def plan_path(bar):
    """A bumper's outline in plan on the car's right, from the centreline out
    across the face, round the corner and back down the wrap: (x, z, T) —
    where T is how far the bar reaches INTO the car from that point."""
    dir_, half, face, z_end = bar["dir"], bar["half"], bar["face"], bar["zEnd"]
    depth = abs(face - (z_end - dir_ * 0.02))
    wrap_t = 0.06
    pts = []
    n_face = 6
    for i in range(n_face + 1):
        pts.append((0.95 * half * i / n_face, face, depth))
    if bar["run"]:
        o0 = bar["run"][0]["outer"]
        c0 = (0.95 * half, face)
        c1 = (o0, face)
        c2 = (o0, z_end)
        for i in range(1, 6):
            t = i / 6
            x = (1 - t) ** 2 * c0[0] + 2 * t * (1 - t) * c1[0] + t * t * c2[0]
            z = (1 - t) ** 2 * c0[1] + 2 * t * (1 - t) * c1[1] + t * t * c2[1]
            pts.append((x, z, depth + (wrap_t - depth) * t))
        for s in bar["run"]:
            pts.append((s["outer"], s["z"], max(wrap_t, s["outer"] - s["flank"] + 0.04)))
    else:
        pts.append((1.01 * half, face - dir_ * depth * 0.2, depth * 0.8))
    return pts


def bar_rings(bar, pts, y, height, proud=0.0, reach=None, taper=True):
    """The bar's cross-sections along `pts`: a rounded rectangle standing on
    the outline, reaching `T` into the car (or `reach`), `proud` outside it."""
    dir_ = bar["dir"]
    full = [(-x, z, t) for x, z, t in reversed(pts[1:])] + pts
    rings = []
    for i, (x, z, t) in enumerate(full):
        a = full[max(0, i - 1)]
        b = full[min(len(full) - 1, i + 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, tz) or 1
        tx, tz = tx / ln, tz / ln
        nx, nz = dir_ * tz, -dir_ * tx   # into the car
        T = reach if reach is not None else t
        h = height * (1.0 if not taper else (0.9 + 0.1 * min(1, t / max(1e-6, pts[0][2]))))
        ring = []
        for u, v in superellipse(T / 2 + proud / 2, h / 2, 5, 12 if GAME else 20):
            off = T / 2 - proud / 2 - u      # 0 at the outline, T inside it
            ring.append([x + nx * off, y + v, z + nz * off])
        rings.append(ring)
    return rings


def build_bumpers():
    for bar in D["bumpers"]:
        part(bar["part"])
        pts = plan_path(bar)
        end = "f" if bar["dir"] > 0 else "r"
        section_loft(bar["part"], None, bar_rings(bar, pts, bar["y"], bar["height"]), role=f"bumper_{end}")
        s = bar.get("strip")
        if s:
            section_loft(bar["part"] + "_strip", None,
                         bar_rings(bar, pts, s["y"], s["height"], proud=0.006, reach=0.03, taper=False),
                         role=f"strip_{end}")
    part("body")


def build_taper(t, role):
    """The air dam or the valance: `car/fascia.ts`'s taper box, rounded."""
    if not t:
        return
    cx, cy, cz = t["c"]
    rings = []
    for dz, w in ((t["depth"] / 2, t["front"] / 2), (-t["depth"] / 2, t["back"] / 2)):
        rings.append([[cx + u, cy + v, cz + dz] for u, v in superellipse(w, t["height"] / 2, 7, 16)])
    ob = section_loft(role, None, rings, role=role)
    bevel(ob, 0.008, angle=30)


def build_lids():
    for lid in D["lids"]:
        part(lid["part"])
        half, lift = lid["half"], lid["lift"]
        rings = []
        for q in lid["samples"]:
            y0, y1 = q["top"] + 0.004, q["top"] + lift
            rings.append([[u, (y0 + y1) / 2 + v, q["z"]] for u, v in superellipse(half, (y1 - y0) / 2, 10, 20)])
        role = lid["part"]
        ob = section_loft(role, None, rings, role=role)
        # The top is the panel and the skirts are the shut line.
        ob.data.materials.append(material(role + "_edge"))
        edge = len(ob.data.materials) - 1
        for poly in ob.data.polygons:
            if abs(poly.normal.z) < 0.6:
                poly.material_index = edge
    part("body")


def build_doors():
    for door in D["doors"]:
        part(door["part"])
        grid = door["grid"]
        rows = len(grid[0])
        verts = [p for col in grid for p in col]
        faces = []
        for i in range(len(grid) - 1):
            for j in range(rows - 1):
                a, b = i * rows + j, (i + 1) * rows + j
                q = (a, b, b + 1, a + 1)
                faces.append(q if door["side"] > 0 else q[::-1])
        ob = mesh(door["part"], verts, faces, ["door"] * len(faces), smooth=True, merge=2e-4)
        modifier(ob, "SOLIDIFY", thickness=0.0045, offset=-1.0, use_even_offset=True)
        bevel(ob, 0.002, angle=30)
    part("body")


def build_tailgate():
    t = D["tailgate"]
    if not t:
        return
    rows = t["rows"]
    zc = rows[0]["panel"]["c"][2] + rows[0]["panel"]["s"][2] / 2   # the cap
    proud = t["proud"]

    def slab(name, role, pieces, z_back, z_front):
        # Each boundary between two strips takes the mean of their widths,
        # so the panel follows the cap's taper as one surface.
        ys = [pieces[0]["c"][1] - pieces[0]["s"][1] / 2] + [q["c"][1] + q["s"][1] / 2 for q in pieces]
        hs = [pieces[0]["s"][0] / 2] + [
            (pieces[i]["s"][0] + pieces[min(i + 1, len(pieces) - 1)]["s"][0]) / 4 for i in range(len(pieces))]
        rings = [[[u, y, (z_front + z_back) / 2 + v] for u, v in superellipse(h, (z_front - z_back) / 2, 8, 16)]
                 for y, h in zip(ys, hs)]
        ob = section_loft(name, None, rings, role=role)
        bevel(ob, 0.006, angle=30)

    slab("gate_line", "gate_line", [r["groove"] for r in rows], zc - 0.01, zc + 0.002)
    slab("gate", "gate", [r["panel"] for r in rows], zc - proud, zc)
    if t["rib"]:
        rbox("gate_rib", t["rib"]["c"], t["rib"]["s"], "gate_rib", 0.005)


def build_arch_trim():
    a = D["archTrim"]
    if not a:
        return
    cy = SPEC["wheelRadius"] + (SPEC["arches"].get("lift") or 0)
    w, drop = a["width"], a["drop"]
    for run, axle in zip(a["runs"], AXLES):
        run = [p for p in run if p["y"] > SPEC["floorY"] + 0.02]
        if len(run) < 2:
            continue
        for side in (-1, 1):
            rings = []
            for p in run:
                rz, ry = p["z"] - axle, p["y"] - cy
                ln = math.hypot(rz, ry) or 1
                rz, ry = rz / ln, ry / ln
                # The L: a lip over the tyre and a skirt down its outside.
                sec = [(-0.02, 0.012), (w, 0.012), (w, -drop), (w - 0.012, -drop),
                       (w - 0.012, 0.0), (-0.02, 0.0)]
                rings.append([[side * (p["x"] + u), p["y"] + ry * v, p["z"] + rz * v] for u, v in sec])
            ob = section_loft(f"arch{side}", None, rings, role="arch_trim", smooth=False)
            bevel(ob, 0.004, angle=30)


def build_flaps():
    for i, f in enumerate(D["mudflaps"]):
        for side in (-1, 1):
            rbox(f"flap{i}{side}", [side * f["x"], (f["top"] + f["bottom"]) / 2, f["z"]],
                 [f["width"], f["top"] - f["bottom"], f["thick"]], "flap", 0.006)


def build_mirrors():
    if not D["mirrors"]:
        return
    for side, name in ((1, "mirrorR"), (-1, "mirrorL")):
        part(name)
        for p in D["mirrors"]:
            c = [side * p["c"][0], p["c"][1], p["c"][2]]
            if p["role"] == "housing":
                ob = rbox(name + "_housing", c, p["s"], "mirror", 0.02)
                subsurf(ob, 1, 2)
            elif p["role"] == "glass":
                rbox(name + "_glass", c, p["s"], "mirror_glass", 0.003)
            else:
                rbox(name + "_stalk", c, p["s"], "mirror_stalk", 0.008)
    part("body")


def build_spoiler():
    pieces = D["spoiler"]["pieces"]
    if not pieces:
        return
    part("spoiler")
    for i, p in enumerate(pieces):
        role = "spoiler_post" if p.get("post") else "spoiler"
        if p["kind"] == "box":
            rbox(f"spoiler{i}", p["c"], p["s"], role, 0.012)
            continue
        f, r, th = p["front"], p["rear"], p["thick"]
        fz, fy, rz, ry = f["z"], f["y"], r["z"], r["y"]
        cz, cy = rz - fz, ry - fy
        ln = math.hypot(cz, cy) or 1
        nz, ny = -cy / ln, cz / ln   # the section's up, off the chord
        if ny < 0:
            nz, ny = -nz, -ny
        sec = []
        N = 10
        for k in range(N + 1):       # upper surface, leading edge to trailing
            t = k / N
            half = th / 2 * (1.0 if p.get("post") else (0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.25 + 0.1)) ** 0.5))
            sec.append((t, half))
        for k in range(N - 1, 0, -1):
            t = k / N
            half = th / 2 * (1.0 if p.get("post") else (0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.25 + 0.1)) ** 0.5))
            sec.append((t, -half))
        rings = []
        for x in (p["x0"], p["x1"]):
            rings.append([[x, fy + cy * t + ny * h, fz + cz * t + nz * h] for t, h in sec])
        ob = section_loft(f"spoiler{i}", None, rings, role=role)
        bevel(ob, min(0.01, th * 0.3), angle=30)
    part("body")


# ---------------------------------------------------------------- the wheels
def build_wheel(at, outboard):
    """One wheel at its centre, the axle along x: the tyre turned on a
    profile with shouldered crown and grooved blocks, the rim by style —
    flange, barrel, dish, spokes, hub and studs — and the disc behind it."""
    w = D["wheel"]
    R, W = w["radius"], w["width"]
    seg = 20 if GAME else 64
    ro, rb = w["rim"]["outer"] * R, w["rim"]["barrel"] * R
    hw = W / 2
    cx, cy, cz = at["x"], at["y"], at["z"]

    def P(x, r, a):
        return [cx + x, cy + r * math.cos(a), cz + r * math.sin(a)]

    def lathe(name, prof, role_of, segs=seg, flip=False):
        """Turned about the axle. A face's outside is on the LEFT of the
        profile's run in the (x, r) plane; `flip` runs it the other way."""
        if flip:
            prof = prof[::-1]
            n0 = len(prof)
            inner_role = role_of
            role_of = lambda i: inner_role(n0 - 2 - i)
        verts, faces, roles = [], [], []
        n = len(prof)
        for k in range(segs):
            a = 2 * math.pi * k / segs
            for x, r in prof:
                verts.append(P(x, r, a))
        for k in range(segs):
            k1 = (k + 1) % segs
            for i in range(n - 1):
                faces.append((k * n + i, k1 * n + i, k1 * n + i + 1, k * n + i + 1))
                roles.append(role_of(i))
        return mesh(name, verts, faces, roles, smooth=True, recalc=False, merge=1e-6)

    # The tyre: from the outboard bead up the sidewall, over the shoulder,
    # across the crown and back down to the inboard bead.
    o = outboard
    sh = min(0.03, hw * 0.35)
    prof = [(o * (hw - 0.005), ro * 0.985), (o * hw, ro + (R - ro) * 0.35), (o * (hw + 0.004), ro + (R - ro) * 0.7),
            (o * (hw - sh * 0.3), R - sh * 0.35), (o * (hw - sh), R - 0.004), (o * (hw - sh * 1.6), R),
            (-o * (hw - sh * 1.6), R), (-o * (hw - sh), R - 0.004), (-o * (hw - sh * 0.3), R - sh * 0.35),
            (-o * (hw + 0.004), ro + (R - ro) * 0.7), (-o * hw, ro + (R - ro) * 0.35), (-o * (hw - 0.005), ro * 0.985)]
    lathe(at["name"] + "_tyre", prof, lambda i: "tyre", flip=o > 0)
    # The tread: two rows of blocks round the crown, staggered half a pitch,
    # their faces a hair under the crown so the outline stays round.
    blocks = 16 if GAME else 26
    pitch = 2 * math.pi / blocks
    row_w = W * 0.4
    for row in (0, 1):
        xoff = (W * 0.24) * (1 if row else -1)
        verts, faces = [], []
        for i in range(blocks):
            a0 = i * pitch + (pitch / 2 if row else 0)
            a1 = a0 + pitch * 0.78
            base = len(verts)
            for a in (a0, a1):
                for x in (xoff - row_w / 2, xoff + row_w / 2):
                    verts.append(P(x, R - 0.013, a))
                    verts.append(P(x, R + 0.006, a))
            # corners: [a0: (x0 lo, x0 hi, x1 lo, x1 hi), a1: same]
            q = [base + k for k in range(8)]
            faces += [(q[1], q[5], q[7], q[3]), (q[0], q[2], q[6], q[4]), (q[0], q[1], q[3], q[2]),
                      (q[4], q[6], q[7], q[5]), (q[0], q[4], q[5], q[1]), (q[2], q[3], q[7], q[6])]
        ob = mesh(at["name"] + f"_tread{row}", verts, faces, ["tread"] * len(faces), smooth=False, recalc=True)
        if not GAME:
            bevel(ob, 0.003, segments=1)
    # The rim: the flange proud of the sidewall, the barrel sunk behind it
    # and the dish floor — only the outboard face carries the spokes.
    lip, dish = w["lip"], w["dish"] * R * w["shape"]["dish"]
    face_x = o * (hw - 0.012)
    rim_prof = [(face_x - o * 0.004, ro), (face_x + o * lip * 0.6, ro * 1.005), (face_x + o * lip, ro * 0.985),
                (face_x + o * lip * 0.7, rb), (face_x - o * dish * 0.3, rb * 0.99), (face_x - o * dish, rb * 0.97),
                (face_x - o * dish, w["shape"]["hub"] * R * 1.02)]
    lathe(at["name"] + "_rim", rim_prof, lambda i: "rim" if i < 3 else "barrel", flip=o < 0)
    back_x = -o * (hw - 0.012)
    lathe(at["name"] + "_back", [(back_x, ro), (back_x, rb * 0.5), (back_x, 0.02)], lambda i: "barrel", flip=o > 0)
    # The hub and the spokes.
    hub = w["shape"]["hub"] * R
    floor_x = face_x - o * dish
    lathe(at["name"] + "_hub", [(floor_x - o * 0.005, hub), (floor_x + o * 0.03, hub * 0.98),
                                  (floor_x + o * 0.04, hub * 0.8), (floor_x + o * 0.045, 0.001)],
          lambda i: "rim", segs=24 if GAME else 48, flip=o < 0)
    n = w["spokes"]
    sw = w["spokeWidth"] * R
    cross = w["shape"].get("cross")
    spoke_x = floor_x + o * 0.03
    for i in range(n):
        a = 2 * math.pi * i / n
        for dirn in ((-1, 1) if cross else (0,)):
            a1 = a + dirn * (2 * math.pi / n)
            r0, r1 = hub * 0.9, rb * 1.01
            p0 = (r0 * math.cos(a), r0 * math.sin(a))
            p1 = (r1 * math.cos(a1), r1 * math.sin(a1))
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
            mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
            th = 0.03 if not cross else 0.018
            wid = sw if not cross else w["spokeWidth"] * R
            verts = []
            for dl in (-L / 2, L / 2):
                for dw in (-wid / 2, wid / 2):
                    for dx in (-th / 2, th / 2):
                        yy = mid[0] + dl * math.cos(ang) - dw * math.sin(ang)
                        zz = mid[1] + dl * math.sin(ang) + dw * math.cos(ang)
                        verts.append([cx + spoke_x + dx - o * (0.012 if dl > 0 else 0.0), cy + yy, cz + zz])
            faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
            ob = mesh(at["name"] + f"_spoke{i}{dirn}", verts, faces, ["rim"] * 6, smooth=True, recalc=True)
            if not GAME:
                bevel(ob, min(0.006, wid * 0.3), angle=30)
    if w["shape"]["bolts"]:
        for i in range(4):
            a = 2 * math.pi * i / 4 + math.pi / 4
            rr = hub * 0.55
            c = [cx + floor_x + o * 0.05, cy + rr * math.cos(a), cz + rr * math.sin(a)]
            lib.cyl(at["name"] + f"_bolt{i}", B(c), B([c[0] + o * 0.012, c[1], c[2]]), 0.009, material("bolt"), seg=12)
    # The brake disc, seen through the spokes.
    disc_x = floor_x - o * 0.03
    lathe(at["name"] + "_disc", [(disc_x, rb * 0.8), (disc_x, rb * 0.3)], lambda i: "disc",
          segs=24 if GAME else 48, flip=o < 0)


def build_wheels():
    clips = D["rig"]["clips"]
    lock, bump, droop = clips["steer"]["peak"], clips["travel"]["peak"], -clips["travel"]["trough"]
    for at in D["wheel"]["at"]:
        c = B([at["x"], at["y"], at["z"]])
        front = at["name"][6] == "f"
        side = 1 if at["x"] > 0 else -1
        parent = "root"
        if front:
            parent = bone(D["rig"]["steer"][0 if side < 0 else 1], c, c + Vector((0, 0, 0.25)))
        bone(at["name"], c, c + Vector((side * 0.2, 0, 0)), parent=parent,
             extras={"radius": D["wheel"]["radius"]})
        rides(at["name"])
        part(at["name"])
        build_wheel(at, side)
    rides("root")
    part("body")

    # The clips `car-rig.ts` states: a sine lock to lock, a sine from full
    # bump to full droop, and one steady revolution.
    ts, tt, tr = (clips[k]["seconds"] for k in ("steer", "travel", "roll"))

    def steer(t):
        a = lock * math.sin(2 * math.pi * t / ts)
        return {b: {"turn": a} for b in D["rig"]["steer"]}

    def travel(t):
        s = math.sin(2 * math.pi * t / tt)
        lift = bump * s if s > 0 else droop * s
        return {b: {"lift": lift} for b in D["rig"]["wheels"]}

    def roll(t):
        th = 2 * math.pi * t / tr
        return {a["name"]: {"turn": th if a["x"] > 0 else -th} for a in D["wheel"]["at"]}

    clip("steer", ts, steer)
    clip("travel", tt, travel)
    clip("roll", tr, roll)


# ---------------------------------------------------------------- the stills' dress
def vertex_colour_mat(name, emit=0.0, alpha=None):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    p = nt.nodes.get("Principled BSDF")
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "col"
    nt.links.new(attr.outputs["Color"], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.35
    if emit:
        nt.links.new(attr.outputs["Color"], p.inputs["Emission Color"])
        p.inputs["Emission Strength"].default_value = emit
    if alpha is not None:
        nt.links.new(attr.outputs["Alpha"], p.inputs["Alpha"])
        p.inputs["Roughness"].default_value = 0.05
        p.inputs["Coat Weight"].default_value = 1.0
    return m


def studio_dress():
    """The code's dress, lenses and glass, for the stills only: the game
    lays them over the model, so a render without them is not the car."""
    made = []
    for key, m in (("dress", vertex_colour_mat("studio_dress")),
                   ("lens", vertex_colour_mat("studio_lens", emit=0.6)),
                   ("glass", vertex_colour_mat("studio_glass", alpha=True))):
        s = D["studio"][key]
        pos, col = s["pos"], s["col"]
        n = len(pos) // 3
        if n == 0:
            continue
        verts = [B(pos[i * 3:i * 3 + 3]) for i in range(n)]
        faces = [(i, i + 1, i + 2) for i in range(0, n - 2, 3)]
        me = bpy.data.meshes.new("studio_" + key)
        me.from_pydata(verts, [], faces)
        attr = me.color_attributes.new("col", "FLOAT_COLOR", "POINT")
        for i in range(n):
            a = col[i * 4 + 3] * 0.45 if key == "glass" else 1.0
            attr.data[i].color = (col[i * 4], col[i * 4 + 1], col[i * 4 + 2], a)
        me.materials.append(m)
        ob = bpy.data.objects.new("studio_" + key, me)
        COL.objects.link(ob)
        made.append(ob)
    return made


# ---------------------------------------------------------------- the car
rides("root")
part("body")
build_shell()
build_greenhouse()
build_tailgate()
build_arch_trim()
build_flaps()
build_taper(D["splitter"], "splitter")
build_taper(D["valance"], "valance")
build_bumpers()
build_lids()
build_doors()
build_mirrors()
build_spoiler()
build_wheels()

if os.environ.get("PIECES"):
    objs = [o for o in COL.objects if o.type == "MESH"]
    counts = sorted(((lib._tri_count([o]), o.name) for o in objs), reverse=True)[:14]
    print("NOTE pieces", counts)
length = SPEC["profile"][0]["z"] - SPEC["profile"][-1]["z"]
stills = studio_dress() if not (GAME and os.environ.get("VIEWS") == "none") else []
finish(D["id"], OUT, SAMPLES, (0, 0, 0.62), length, lods=(("lod1", 0.45), ("lod2", 0.16)),
       extras={"car": D["id"], "wheelRadius": D["wheel"]["radius"]}, studio_only=stills)
