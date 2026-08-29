// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GLYPH CONTACT SHEET — every mark in menu-glyphs.tsx, at the three
// sizes it is actually read at, on the plate it is actually read over.
//
// A mark is judged small. 14px is a stage box's result row, 22px a one-line
// entry, 40px a front-door tile — and a drawing that reads at 40 can be a
// blob at 14, which is exactly the failure this page exists to catch. Two
// early drafts died here: two cars seen from above that read as a pair of
// pills, and a compass that read as a circle with a slash through it.
//
// It renders the real component rather than a copy of its paths, so the
// sheet cannot quietly disagree with the menus.

import { render } from "preact";

// The app's own stylesheet, for the one rule that matters here: `.menu-glyph`
// is sized in `em`, and an SVG with no size at all collapses to nothing in a
// flex row. Restating that rule on this page would be a second copy to keep
// in step; importing it means the sheet shows the mark at exactly the size
// the menus give it.
import "../styles.css";
import { Glyph, GLYPH_NAMES } from "../game/menu-glyphs.tsx";

/** The sizes the marks are used at, in px. */
const SIZES = [14, 22, 40];

function Sheet() {
  return (
    <>
      <style>{`
        body { margin: 0; padding: 18px; background: #123069; color: #fff;
               font: 600 11px/1.2 system-ui, sans-serif; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .cell { display: flex; flex-direction: column; align-items: center; gap: 10px;
                background: rgb(18 48 105 / 78%); border: 2px solid rgb(255 255 255 / 40%);
                border-radius: 10px; padding: 12px 8px; }
        .row { display: flex; align-items: center; justify-content: center; gap: 12px;
               min-height: 44px; color: #ffd23e; }
        .name { letter-spacing: 0.14em; opacity: 0.8; text-transform: uppercase; }
      `}</style>
      <div className="grid">
        {GLYPH_NAMES.map((name) => (
          <div key={name} className="cell">
            <div className="row">
              {SIZES.map((size) => (
                <span key={size} style={{ fontSize: `${size}px`, display: "flex" }}>
                  <Glyph name={name} />
                </span>
              ))}
            </div>
            <span className="name">{name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const host = document.getElementById("sheet");
if (host) render(<Sheet />, host);
// The screenshot pass waits on this rather than on a timeout.
(window as unknown as { __done?: boolean }).__done = true;
