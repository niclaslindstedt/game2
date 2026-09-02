// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The result sheet's paging (pwa/src/game/results-pages.ts): how many rows a
// page holds for the room it has, and which page a place is on.

import { describe, expect, it } from "vitest";

import {
  CARD_SHARE,
  PAGE_MAX,
  PAGE_MIN,
  pageCount,
  pageOf,
  pageSpan,
  rowsPerPage,
  stepPage,
} from "../pwa/src/game/results-pages.ts";

describe("rows per page", () => {
  it("holds eight where there is room for eight, and no more", () => {
    expect(rowsPerPage(400, 40)).toBe(PAGE_MAX);
    expect(rowsPerPage(4000, 40)).toBe(PAGE_MAX);
  });

  it("gives with the room, a row at a time", () => {
    expect(rowsPerPage(200, 40)).toBe(5);
    expect(rowsPerPage(199, 40)).toBe(4);
    expect(rowsPerPage(160, 40)).toBe(4);
  });

  it("does not charge the gap after the last row", () => {
    // Five rows of 36 with a 4 px gap between them stand 196 px tall, not
    // 200: the fifth row needs no gap under it.
    expect(rowsPerPage(196, 36, 4)).toBe(5);
    expect(rowsPerPage(195, 36, 4)).toBe(4);
  });

  it("never pages below the floor, however short the room", () => {
    expect(rowsPerPage(50, 40)).toBe(PAGE_MIN);
    expect(rowsPerPage(-100, 40)).toBe(PAGE_MIN);
  });

  it("falls back to a full page when the row has not been measured", () => {
    expect(rowsPerPage(300, 0)).toBe(PAGE_MAX);
    expect(rowsPerPage(300, Number.NaN)).toBe(PAGE_MAX);
  });

  it("keeps the card's share of the screen a real share", () => {
    expect(CARD_SHARE).toBeGreaterThan(0.5);
    expect(CARD_SHARE).toBeLessThan(1);
  });
});

describe("the pages of a fifteen-car sheet", () => {
  it("counts them, and never fewer than one", () => {
    expect(pageCount(15, 8)).toBe(2);
    expect(pageCount(16, 8)).toBe(2);
    expect(pageCount(17, 8)).toBe(3);
    expect(pageCount(0, 8)).toBe(1);
  });

  it("opens on the page with the player's row on it", () => {
    expect(pageOf(1, 8, 15)).toBe(0);
    expect(pageOf(8, 8, 15)).toBe(0);
    expect(pageOf(9, 8, 15)).toBe(1);
    expect(pageOf(15, 8, 15)).toBe(1);
    expect(pageOf(15, 4, 15)).toBe(3);
  });

  it("lands a place off the sheet on the first page", () => {
    expect(pageOf(0, 8, 15)).toBe(0);
    expect(pageOf(16, 8, 15)).toBe(0);
  });

  it("cuts each page to its rows, the last one short", () => {
    expect(pageSpan(0, 8, 15)).toEqual({ from: 0, to: 8 });
    expect(pageSpan(1, 8, 15)).toEqual({ from: 8, to: 15 });
    // A page past the end is the last page, not an empty one.
    expect(pageSpan(5, 8, 15)).toEqual({ from: 8, to: 15 });
  });

  it("walks the arrows round both ends", () => {
    expect(stepPage(0, 1, 2)).toBe(1);
    expect(stepPage(1, 1, 2)).toBe(0);
    expect(stepPage(0, -1, 2)).toBe(1);
    expect(stepPage(0, -1, 1)).toBe(0);
    expect(stepPage(3, 1, 0)).toBe(0);
  });
});
