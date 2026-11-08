import { afterEach, describe, expect, it, vi } from "vitest";
import { calcDiscount, cn, formatPrice, randomDelay } from "./utils";

describe("cn", () => {
  it("joins classes and drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("lets later tailwind classes win over conflicting earlier ones", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("formatPrice", () => {
  // Intl uses a narrow no-break space before the currency sign; normalise it.
  const norm = (s: string) => s.replace(/\s/g, " ");

  it("formats EUR in German notation", () => {
    expect(norm(formatPrice(89.99))).toBe("89,99 €");
    expect(norm(formatPrice(1234.5))).toBe("1.234,50 €");
  });

  it("supports other currencies", () => {
    expect(norm(formatPrice(10, "USD"))).toBe("10,00 $");
  });
});

describe("calcDiscount", () => {
  it("returns the rounded percentage saved", () => {
    expect(calcDiscount(149.99, 89.99)).toBe(40);
    expect(calcDiscount(100, 100)).toBe(0);
    expect(calcDiscount(3, 2)).toBe(33);
  });

  it("returns 0 for a non-positive original price", () => {
    expect(calcDiscount(0, 10)).toBe(0);
    expect(calcDiscount(-5, 1)).toBe(0);
  });

  it("goes negative when the sale price is higher", () => {
    expect(calcDiscount(100, 120)).toBe(-20);
  });
});

describe("randomDelay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a duration within [min, max]", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setTimeout");
    vi.spyOn(Math, "random").mockReturnValue(0.999999);

    let done = false;
    const p = randomDelay(100, 200).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(199);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 200);
  });

  it("uses the minimum when Math.random returns 0", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setTimeout");
    vi.spyOn(Math, "random").mockReturnValue(0);
    const p = randomDelay(50, 80);
    await vi.advanceTimersByTimeAsync(50);
    await p;
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 50);
  });
});
