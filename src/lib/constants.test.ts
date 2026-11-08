import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_OPTIONS,
  MOCK_ALERTS,
  MOCK_EVENTS,
  MOCK_MODELS,
  MOCK_SNAPSHOTS,
  SHOPS,
  SIZE_OPTIONS,
} from "./constants";
import { calcDiscount } from "./utils";

const shopSlugs = new Set(SHOPS.map((s) => s.slug));
const modelIds = new Set(MOCK_MODELS.map((m) => m.id));

describe("SHOPS", () => {
  it("has unique slugs", () => {
    expect(shopSlugs.size).toBe(SHOPS.length);
  });

  it("references logo files that exist in public/", () => {
    for (const shop of SHOPS) {
      const file = path.join(process.cwd(), "public", shop.logo);
      expect(existsSync(file), shop.logo).toBe(true);
    }
  });

  it("uses https URLs and hex colours", () => {
    for (const shop of SHOPS) {
      expect(new URL(shop.url).protocol).toBe("https:");
      expect(shop.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("mock data consistency", () => {
  it("models have unique ids and known brands", () => {
    expect(modelIds.size).toBe(MOCK_MODELS.length);
    for (const m of MOCK_MODELS) expect(BRAND_OPTIONS).toContain(m.brand);
  });

  it("snapshots point to existing models and shops", () => {
    for (const s of MOCK_SNAPSHOTS) {
      expect(modelIds.has(s.model_id)).toBe(true);
      expect(shopSlugs.has(s.site)).toBe(true);
      expect(s.model?.id).toBe(s.model_id);
    }
  });

  it("snapshot and alert discounts match their prices", () => {
    // Hand-written mock values may be truncated instead of rounded, so allow 1 point.
    for (const s of MOCK_SNAPSHOTS) {
      expect(s.price).toBeLessThan(s.original_price!);
      expect(Math.abs(s.discount_pct! - calcDiscount(s.original_price!, s.price))).toBeLessThanOrEqual(1);
    }
    for (const a of MOCK_ALERTS) {
      expect(a.discount_pct).toBe(calcDiscount(a.old_price, a.new_price));
      expect(modelIds.has(a.model_id)).toBe(true);
      expect(shopSlugs.has(a.site)).toBe(true);
    }
  });

  it("events have valid ISO dates and known shops", () => {
    for (const e of MOCK_EVENTS) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(e.date))).toBe(false);
      if (e.site) expect(shopSlugs.has(e.site)).toBe(true);
    }
  });

  it("size options are sorted ascending without duplicates", () => {
    const sorted = [...SIZE_OPTIONS].sort((a, b) => a - b);
    expect(SIZE_OPTIONS).toEqual(sorted);
    expect(new Set(SIZE_OPTIONS).size).toBe(SIZE_OPTIONS.length);
  });
});
