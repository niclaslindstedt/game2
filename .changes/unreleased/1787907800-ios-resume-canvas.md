---
type: Fixed
title: The picture fills the screen again after the app comes back
---

Returning to the installed app on iOS could leave the game drawn in a band down one side of the screen with flat blue through the rest of it, until the phone was rotated and back. The frame now checks the canvas it is drawing into every frame instead of waiting for a resize event that never arrives, so the picture is right again the moment the app is back — the car stand in the menu too.
