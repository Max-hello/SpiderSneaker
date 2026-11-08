import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROBOTS_URL = "https://www.zalando.de/robots.txt";
const PRODUCT_URL = "https://www.zalando.de/nike-air-max-90.html";

type Responder = (url: string) => Response | Promise<Response>;

function mockFetch(responder: Responder) {
  const fn = vi.fn((input: RequestInfo | URL) => Promise.resolve(responder(String(input))));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function html(body: string) {
  return new Response(`<html><head></head><body>${body}</body></html>`, { status: 200 });
}

function jsonLd(data: unknown) {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

async function loadRoute(cronSecret?: string) {
  vi.resetModules();
  vi.stubEnv("CRON_SECRET", cronSecret ?? "");
  return import("./route");
}

async function callGet(headers: Record<string, string> = {}, cronSecret?: string) {
  const { GET } = await loadRoute(cronSecret);
  const pending = GET(new Request("http://localhost/api/cron/check-prices", { headers }));
  // The route waits a random 2–5 s between requests; skip the wait.
  await vi.runAllTimersAsync();
  const res = await pending;
  return { res, body: await res.json() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/check-prices – auth", () => {
  it("rejects requests without the right bearer token when CRON_SECRET is set", async () => {
    const fetchMock = mockFetch(() => new Response("", { status: 404 }));
    const { res, body } = await callGet({ authorization: "Bearer wrong" }, "s3cret");
    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the correct bearer token", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    const { res } = await callGet({ authorization: "Bearer s3cret" }, "s3cret");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/cron/check-prices – scraping", () => {
  it("parses price and original price from JSON-LD and computes the discount", async () => {
    const fetchMock = mockFetch((url) => {
      if (url === ROBOTS_URL) return new Response("User-agent: *\nDisallow: /cart\n");
      if (url === PRODUCT_URL)
        return html(
          jsonLd({
            "@type": "Product",
            offers: [{ price: "89.99", priceSpecification: { price: "149.99" } }],
          }),
        );
      throw new Error(`unexpected fetch ${url}`);
    });

    const { res, body } = await callGet();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.checked).toBe(1);
    expect(body.results[0]).toEqual({
      model_id: "1",
      site: "zalando",
      price: 89.99,
      original_price: 149.99,
      discount_pct: 40,
      url: PRODUCT_URL,
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to price elements with German number format", async () => {
    mockFetch((url) => {
      if (url === ROBOTS_URL) return new Response("", { status: 404 });
      return html(
        `${jsonLd("not json-ld product")}<script type="application/ld+json">{broken</script>` +
          `<div data-testid="price"><span>74,99 €</span></div>` +
          `<span data-testid="original-price">119,99 €</span>`,
      );
    });

    const { body } = await callGet();
    expect(body.results[0]).toMatchObject({ price: 74.99, original_price: 119.99, discount_pct: 38 });
  });

  it("leaves the discount empty when there is no reduction", async () => {
    mockFetch((url) => {
      if (url === ROBOTS_URL) return new Response("", { status: 404 });
      return html(jsonLd({ "@type": "Product", offers: { price: "100" } }));
    });

    const { body } = await callGet();
    expect(body.results[0]).toMatchObject({ price: 100, original_price: null, discount_pct: null });
  });

  it("skips scraping when robots.txt disallows everything", async () => {
    const fetchMock = mockFetch(() => new Response("User-agent: *\nDisallow: /\n"));
    const { body } = await callGet();
    expect(body.checked).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(ROBOTS_URL);
  });

  it("treats an unreachable robots.txt as allowed", async () => {
    mockFetch((url) => {
      if (url === ROBOTS_URL) throw new Error("network down");
      return html(jsonLd({ "@type": "Product", offers: { price: "50" } }));
    });
    const { body } = await callGet();
    expect(body.checked).toBe(1);
  });

  it("drops products whose page returns an error or throws", async () => {
    mockFetch((url) => {
      if (url === ROBOTS_URL) return new Response("", { status: 404 });
      return new Response("blocked", { status: 403 });
    });
    expect((await callGet()).body.checked).toBe(0);

    mockFetch((url) => {
      if (url === ROBOTS_URL) return new Response("", { status: 404 });
      throw new Error("timeout");
    });
    expect((await callGet()).body.checked).toBe(0);
  });
});
