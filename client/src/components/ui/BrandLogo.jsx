import { useEffect, useState } from "react";
import { BRAND_NAME, LOGO_CANDIDATES } from "../../config/app";
import { cn } from "../../lib/cn";

// Resolve the first logo candidate that loads, once per session, shared by every BrandLogo.
let resolved; // undefined = unknown, null = none found, string = url
let pending;
function resolveLogo() {
  if (resolved !== undefined) return Promise.resolve(resolved);
  if (pending) return pending;
  pending = (async () => {
    for (const url of LOGO_CANDIDATES) {
      const ok = await new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img.naturalWidth > 0);
        img.onerror = () => res(false);
        img.src = url;
      });
      if (ok) return (resolved = url);
    }
    return (resolved = null);
  })();
  return pending;
}

/**
 * BrandLogo (CLAUDE.md rule 11): tries the official AutomationEdge logo files; falls back to a text
 * wordmark ("Automation" + orange "Edge"). Never draws an imitation logo.
 * - `compact` shows the "AE" wordmark fallback (collapsed sidebar).
 * - `variant="onDark"` places an image logo on a white rounded plate and uses white wordmark text.
 */
export function BrandLogo({ compact = false, variant = "default", className, imgClassName = "h-7" }) {
  const [url, setUrl] = useState(resolved);
  useEffect(() => {
    let alive = true;
    if (url === undefined) resolveLogo().then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [url]);
  const onDark = variant === "onDark";

  if (url && !compact) {
    const img = <img src={url} alt={BRAND_NAME} className={cn("block w-auto", imgClassName)} />;
    return (
      <span className={cn("inline-flex items-center", onDark && "rounded-md bg-on-dark px-2 py-1", className)}>{img}</span>
    );
  }

  if (url === undefined) {
    // Reserve space while resolving to avoid layout shift.
    return <span className={cn("inline-block w-32", imgClassName, className)} aria-hidden="true" />;
  }

  const text = onDark ? "text-on-dark" : "text-text";
  const edge = onDark ? "text-orange-500" : "text-orange-700";
  if (compact) {
    return (
      <span className={cn("inline-flex items-center text-xl font-bold tracking-tight", text, className)} aria-label={BRAND_NAME}>
        A<span className={edge}>E</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center text-lg font-semibold tracking-tight whitespace-nowrap", text, className)} aria-label={BRAND_NAME}>
      Automation<span className={edge}>Edge</span>
    </span>
  );
}
