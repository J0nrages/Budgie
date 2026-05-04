"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { buildMerchantLogoUrl, type MerchantLogoSource } from "@/lib/logo-dev";

function initialsFromCanonicalName(canonicalName: string): string {
  const parts = canonicalName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0];
    return w.length >= 2 ? w.slice(0, 2).toUpperCase() : w.slice(0, 1).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase() || "?";
}

type Props = {
  merchant: MerchantLogoSource;
  className?: string;
  size?: number;
  /** Passed to Logo.dev `size` (default matches box). */
  logoSize?: number;
};

function MerchantLogoRaster({
  src,
  label,
  size,
  className,
  onBroken,
}: {
  src: string;
  label: string;
  size: number;
  className?: string;
  onBroken: () => void;
}) {
  return (
    // Plan: plain img for Logo.dev CDN (no next/image remotePatterns).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn("shrink-0 rounded-full object-contain", className)}
      style={{ width: size, height: size }}
      onError={onBroken}
    />
  );
}

/**
 * Logo.dev image when `NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY` is set; otherwise initials.
 * Uses plain `img` (no `next/image`) per product plan.
 */
export function MerchantLogo(props: Props) {
  const { merchant } = props;
  return (
    <MerchantLogoInner
      key={`${merchant.canonicalName}|${merchant.logoDomain ?? ""}`}
      {...props}
    />
  );
}

function MerchantLogoInner({ merchant, className, size = 32, logoSize }: Props) {
  const [showInitials, setShowInitials] = useState(false);
  const src = buildMerchantLogoUrl(merchant, {
    size: logoSize ?? size,
    format: "png",
  });

  const label = `${merchant.canonicalName} logo`;
  const rasterKey = src ?? "";

  if (!src || showInitials) {
    return (
      <div
        role="img"
        aria-label={label}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-muted text-[0.65rem] font-semibold text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {initialsFromCanonicalName(merchant.canonicalName)}
      </div>
    );
  }

  return (
    <MerchantLogoRaster
      key={rasterKey}
      src={src}
      label={label}
      size={size}
      className={className}
      onBroken={() => setShowInitials(true)}
    />
  );
}
