---
title: A face wound against its own normals is black in Cycles and culled in the game — wind every face by its vertices' normals, never by the ring's hand
date: 2026-09-29
scope: scripts/blender/prop.py, scripts/blender/plant.py, scripts/blender/tree.py
concepts: [blender, winding, normals, culling, gltf]
---

three.js lays a cylinder's ring out from +x toward +z, which is CLOCKWISE
about +y; a loft's `(side, up)` basis can be either hand; and a quad laid
`(r0[j], r0[j1], r1[j1], r1[j])` over such a ring has its winding normal
pointing INWARD while the custom normals handed to
`normals_split_custom_set_from_vertices` point out. Cycles culls nothing,
so the studio still shows the form — pitch black with a glossy highlight,
which reads as a material bug and is not one — and the game's renderer
culls every one of those faces. The fix that holds for every form at once
is in the mesh accumulator, not the forms: `Mesh.f` in `prop.py` computes
the face's winding normal from its first three vertices and reverses the
face when it runs against the mean of the vertices' own normals. A form
with no custom normals (a flat face that lights itself) is left as wound.
The check that proves it: import the exported glTF in Blender and count
polygons whose `poly.normal` agrees with their loop normals.
