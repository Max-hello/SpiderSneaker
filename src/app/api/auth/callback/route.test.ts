import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { exchangeCodeForSession } = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({ auth: { exchangeCodeForSession } }),
}));

const call = (query: string) => GET(new Request(`https://app.example/api/auth/callback${query}`));

beforeEach(() => {
  exchangeCodeForSession.mockReset();
});

describe("GET /api/auth/callback", () => {
  it("exchanges the code and redirects to `next`", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await call("?code=abc&next=/watchlist");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example/watchlist");
  });

  it("redirects to the home page when `next` is missing", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await call("?code=abc");
    expect(res.headers.get("location")).toBe("https://app.example/");
  });

  it("redirects home when the exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("invalid code") });
    const res = await call("?code=bad&next=/settings");
    expect(res.headers.get("location")).toBe("https://app.example/");
  });

  it("redirects home without calling Supabase when no code is given", async () => {
    const res = await call("?next=/settings");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://app.example/");
  });
});
