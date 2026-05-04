/** Logo.dev image CDN — publishable token is browser-safe per https://www.logo.dev/docs/logo-images/introduction */

const LOGO_DEV_IMG_ORIGIN = "https://img.logo.dev";

export type MerchantLogoSource = {
  canonicalName: string;
  logoDomain?: string | null;
};

export type BuildMerchantLogoUrlOptions = {
  size?: number;
  format?: "jpg" | "png" | "webp";
  theme?: "auto" | "light" | "dark";
  greyscale?: boolean;
  /** Default monogram from Logo.dev; use `404` for empty response + local placeholder. */
  fallback?: "monogram" | "404";
  retina?: boolean;
};

/**
 * Normalize user input to a hostname suitable for Logo.dev domain path (`img.logo.dev/{host}`).
 * Returns `undefined` if the value cannot be interpreted as a hostname.
 */
export function normalizeLogoDomain(raw: string): string | undefined {
  let s = raw.trim();
  if (s.length === 0) return undefined;

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      const u = new URL(s);
      s = u.hostname;
    } else if (s.startsWith("//")) {
      const u = new URL(`https:${s}`);
      s = u.hostname;
    } else {
      const slash = s.indexOf("/");
      if (slash !== -1) s = s.slice(0, slash);
      const q = s.indexOf("?");
      if (q !== -1) s = s.slice(0, q);
      const hash = s.indexOf("#");
      if (hash !== -1) s = s.slice(0, hash);
      if (s.includes("@")) {
        const at = s.lastIndexOf("@");
        s = s.slice(at + 1);
      }
    }
  } catch {
    return undefined;
  }

  s = s.trim().toLowerCase();
  if (s.endsWith(".")) s = s.replace(/\.+$/, "");
  if (s.length === 0) return undefined;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(s) && s !== "localhost") {
    return undefined;
  }
  if (s.length > 253) return undefined;
  return s;
}

function getPublishableToken(): string | undefined {
  const t = process.env.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY?.trim();
  return t && t.length > 0 ? t : undefined;
}

/**
 * Build a Logo.dev image URL for a curated merchant, or `null` if no publishable token is configured.
 * Prefers `logoDomain` when set and valid; otherwise uses the name lookup path with `canonicalName`.
 */
export function buildMerchantLogoUrl(
  merchant: MerchantLogoSource,
  options?: BuildMerchantLogoUrlOptions,
): string | null {
  const token = getPublishableToken();
  if (!token) return null;

  const canonical = merchant.canonicalName.trim();
  const domainFromField =
    merchant.logoDomain != null && String(merchant.logoDomain).trim().length > 0
      ? normalizeLogoDomain(String(merchant.logoDomain))
      : undefined;

  const u = new URL(LOGO_DEV_IMG_ORIGIN);
  if (domainFromField) {
    u.pathname = `/${domainFromField}`;
  } else {
    if (canonical.length === 0) return null;
    u.pathname = `/name/${encodeURIComponent(canonical)}`;
  }

  u.searchParams.set("token", token);

  const o = options ?? {};
  if (o.size !== undefined) u.searchParams.set("size", String(o.size));
  if (o.format !== undefined) u.searchParams.set("format", o.format);
  if (o.theme !== undefined) u.searchParams.set("theme", o.theme);
  if (o.greyscale === true) u.searchParams.set("greyscale", "true");
  if (o.fallback !== undefined) u.searchParams.set("fallback", o.fallback);
  if (o.retina === true) u.searchParams.set("retina", "true");

  return u.toString();
}
