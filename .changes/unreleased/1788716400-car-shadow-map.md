---
type: Fixed
title: Real car shadows off the sun
---

Every car now throws a real shadow from the sun: the cars are drawn into a
shadow map and the ground, road and water read it, so the shadow lies on a
cambered road, a crest or a hillside without sinking into it or flickering,
reaches away from a low dusk sun the way the light actually falls, and stays
on the ground while the car is in the air. Under a storm's ceiling no shadow
is thrown at all; under a thin overcast a faint one is. The map's size
follows the effects option, and `off` turns it off.
