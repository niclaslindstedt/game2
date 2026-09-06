---
type: Changed
title: The sky is drawn behind the country, not under it
---

The sky used to be painted first and the world painted over it, which meant the dome's shader — the dearest thing per pixel in the game — ran on every pixel of the screen and three quarters of that was then buried under the terrain, the trees and the car. It is drawn last now and depth-tested, so only the pixels that are actually sky are ever shaded. Two things that were quietly wrong come right with it: the sun, the stars and the ridge rings were tested at their own distance — a few hundred metres — so ground further off than that could come out in front of them, and on a long draw distance it did. And the cloud chart now says which sheet a sky IS, so a machine asked for a thinner sky keeps the cumulus it is driving under, or the storm ceiling over it, rather than whichever sheet happened to be lowest.
