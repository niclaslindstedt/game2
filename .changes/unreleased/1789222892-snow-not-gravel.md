---
type: Fixed
title: The snow under the car is snow, not gravel
---

The ground's detail map is a grit texture — a white ground flecked with
warm greys — and giving it to the coat of snow at full strength put
hand-sized warm specks on the snow two metres from the camera, so the
ground under the car read as wet gravel. Snow now takes that grain at a
third depth and with its colour thrown away, which is a fine neutral
sparkle in the surface instead of dirt lying on it.

And the coat has its own shader back. Every snow surface was built from one
factory, so they all carried the same shader-graft source — which is what
three keys its compiled programs by — and the coat was quietly handed the
ground's program instead of its own, losing its wrap lighting, its glitter
and its depth-clipping while still looking roughly like snow.
