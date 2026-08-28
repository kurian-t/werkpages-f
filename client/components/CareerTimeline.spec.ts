import { describe, it, expect } from "vitest";
import {
  cardTopY,
  cardCenterY,
  tickTopY,
  CARD_H,
  TOP_PAD,
  VERT_RANGE,
  X_AXIS_Y,
  GRID_INTERVAL,
} from "./CareerTimeline";

// ── Layout constants ──────────────────────────────────────────────────────────

describe("layout constants", () => {
  it("X_AXIS_Y is below the 1.0 card centre by exactly one grid interval", () => {
    const oneStarCentre = cardCenterY(1);
    expect(X_AXIS_Y).toBe(Math.round(oneStarCentre + GRID_INTERVAL));
  });

  it("GRID_INTERVAL is VERT_RANGE / 4", () => {
    expect(GRID_INTERVAL).toBe(VERT_RANGE / 4);
  });
});

// ── cardTopY ──────────────────────────────────────────────────────────────────

describe("cardTopY", () => {
  it("5-star card starts at TOP_PAD (top of chart)", () => {
    expect(cardTopY(5)).toBe(TOP_PAD);
  });

  it("1-star card starts at TOP_PAD + VERT_RANGE (bottom of chart)", () => {
    expect(cardTopY(1)).toBe(TOP_PAD + VERT_RANGE);
  });

  it("3-star card is exactly at the vertical midpoint", () => {
    expect(cardTopY(3)).toBe(TOP_PAD + VERT_RANGE / 2);
  });

  it("clamps ratings below 1 to 1-star position", () => {
    expect(cardTopY(0)).toBe(cardTopY(1));
    expect(cardTopY(-5)).toBe(cardTopY(1));
  });

  it("clamps ratings above 5 to 5-star position", () => {
    expect(cardTopY(6)).toBe(cardTopY(5));
  });
});

// ── cardCenterY ───────────────────────────────────────────────────────────────

describe("cardCenterY", () => {
  it("is cardTopY + half CARD_H", () => {
    expect(cardCenterY(5)).toBe(cardTopY(5) + CARD_H / 2);
    expect(cardCenterY(3)).toBe(cardTopY(3) + CARD_H / 2);
    expect(cardCenterY(1)).toBe(cardTopY(1) + CARD_H / 2);
  });
});

// ── tickTopY ──────────────────────────────────────────────────────────────────

describe("tickTopY - tick lands on x-axis for high-rated cards", () => {
  it("5-star collapsed card: tick is on X_AXIS_Y (card is far above axis)", () => {
    expect(tickTopY(5, CARD_H)).toBe(X_AXIS_Y);
  });

  it("4-star collapsed card: tick is on X_AXIS_Y", () => {
    expect(tickTopY(4, CARD_H)).toBe(X_AXIS_Y);
  });

  it("3-star collapsed card: tick is on X_AXIS_Y", () => {
    expect(tickTopY(3, CARD_H)).toBe(X_AXIS_Y);
  });

  it("2-star collapsed card: tick is on X_AXIS_Y", () => {
    expect(tickTopY(2, CARD_H)).toBe(X_AXIS_Y);
  });
});

describe("tickTopY - tick hangs off card bottom when card overlaps x-axis", () => {
  it("1-star collapsed card: tick is below the card bottom, not on X_AXIS_Y", () => {
    const result = tickTopY(1, CARD_H);
    const cardBottom = cardTopY(1) + CARD_H;
    expect(result).toBe(cardBottom + 6);
    expect(result).toBeGreaterThan(X_AXIS_Y);
  });
});

describe("tickTopY - follows card height changes (expand/collapse)", () => {
  it("expanding a 1-star card pushes the tick further down", () => {
    const collapsed = tickTopY(1, CARD_H);
    const expanded  = tickTopY(1, CARD_H + 120);
    expect(expanded).toBeGreaterThan(collapsed);
    expect(expanded).toBe(cardTopY(1) + CARD_H + 120 + 6);
  });

  it("collapsing a 1-star card moves tick back up to collapsed position", () => {
    const expanded  = tickTopY(1, CARD_H + 120);
    const collapsed = tickTopY(1, CARD_H);
    expect(collapsed).toBeLessThan(expanded);
  });

  it("expanding a 5-star card keeps tick on X_AXIS_Y as long as card stays above axis", () => {
    // Even with a large expansion the 5-star card bottom stays above X_AXIS_Y
    const expanded = tickTopY(5, CARD_H + 80);
    expect(expanded).toBe(X_AXIS_Y);
  });

  it("expanding a 5-star card enough to cross the axis moves tick off card bottom", () => {
    // Force a huge expansion so the card bottom passes X_AXIS_Y
    const hugeHeight = X_AXIS_Y - cardTopY(5) + 100;
    const result = tickTopY(5, hugeHeight);
    expect(result).toBe(cardTopY(5) + hugeHeight + 6);
    expect(result).toBeGreaterThan(X_AXIS_Y);
  });
});
