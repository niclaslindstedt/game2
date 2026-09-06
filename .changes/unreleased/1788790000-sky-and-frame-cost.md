---
type: Changed
title: A cheaper sky, and no multisampling on a retina screen
---

The sky costs the frame a good deal less than it did. Every cloud sheet on the dome is a whole field of noise read on every pixel of sky, and the depths those fields were read at used to be settings the shader could not see, so none of the loops behind them could be unrolled — on the one shader that covers the screen, and again on every lit fragment in the frame through the air the world is drawn through. They are compiled in now, so the machine reads exactly the sky it is being asked for and nothing else. At the MEDIUM picture the sky stands three cloud sheets rather than four, which drops the highest and thinnest of them and leaves the weather a stage is driven under. And on a phone or a retina laptop the frame is no longer multisampled: at two device pixels to a CSS pixel every edge is already finer than the screen can show, and the buffer that smoothed it was bandwidth spent on nothing.
