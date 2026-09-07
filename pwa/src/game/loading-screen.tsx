// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CARD OVER A RACE BEING STOOD UP.
//
// What is behind it is `race-loader.ts`: the road compiled, the country and
// its forest built, the shaders compiled, fourteen crews entered and every
// one of them driven through the whole stage before the player's lights run.
// Seconds of work, and the press on START used to buy all of it with a frozen
// page and then a race that stuttered while the rest arrived.
//
// The card is the app's own MARK, being laid over and over (`mark-tracks.tsx`)
// with the word under it.
//
// It says nothing about how far along it is, and that is a choice. The load's
// cost is dominated by fourteen crews driving a stage, which finishes when it
// finishes; a bar that reached nine tenths and sat there would be a worse
// answer than a mark that never claims to know.

import { MarkTracks } from "./mark-tracks.tsx";

export function LoadingScreen({ leaving }: { leaving: boolean }) {
  return (
    <div className={`loading${leaving ? " leaving" : ""}`} aria-live="polite" aria-busy={!leaving}>
      <div className="loading-card">
        <MarkTracks lay="loop" className="loading-mark" title="Loading" />
        <p className="loading-word">LOADING</p>
      </div>
    </div>
  );
}
