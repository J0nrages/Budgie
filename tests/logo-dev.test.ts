import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMerchantLogoUrl, normalizeLogoDomain } from "@/lib/logo-dev";

describe("normalizeLogoDomain", () => {
  it("strips protocol and path from full URL", () => {
    expect(normalizeLogoDomain("https://www.wholefoodsmarket.com/foo?x=1")).toBe(
      "www.wholefoodsmarket.com",
    );
  });

  it("accepts plain hostname", () => {
    expect(normalizeLogoDomain("shopify.com")).toBe("shopify.com");
  });

  it("returns undefined for invalid hostnames", () => {
    expect(normalizeLogoDomain("not a domain")).toBeUndefined();
    expect(normalizeLogoDomain("")).toBeUndefined();
    expect(normalizeLogoDomain("sweet green")).toBeUndefined();
  });

  it("handles AT&T style hostnames when pasted as URL", () => {
    expect(normalizeLogoDomain("https://att.com")).toBe("att.com");
  });
});

describe("buildMerchantLogoUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when token is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY", "");
    expect(
      buildMerchantLogoUrl({ canonicalName: "Shopify", logoDomain: "shopify.com" }),
    ).toBeNull();
  });

  it("uses domain path when logoDomain normalizes", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY", "test-token");
    const url = buildMerchantLogoUrl({
      canonicalName: "Ignored for path",
      logoDomain: "https://shopify.com/path",
    });
    expect(url).not.toBeNull();
    expect(url).toMatch(/^https:\/\/img\.logo\.dev\/shopify\.com\?/);
    expect(url).toContain("token=test-token");
  });

  it("uses name path with encodeURIComponent when no domain", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY", "tok");
    const url = buildMerchantLogoUrl({ canonicalName: "AT&T" });
    expect(url).toContain("/name/AT%26T");
    expect(url).toContain("token=tok");
  });

  it("passes optional query params", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY", "k");
    const url = buildMerchantLogoUrl(
      { canonicalName: "X", logoDomain: "x.com" },
      { size: 64, format: "png", fallback: "404" },
    );
    expect(url).toContain("size=64");
    expect(url).toContain("format=png");
    expect(url).toContain("fallback=404");
  });
});
