import { useState } from "react";
import { initials } from "../../lib/format";
import { cn } from "../../lib/cn";

const sizes = { xs: "h-6 w-6 text-caption", sm: "h-8 w-8 text-caption", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base", xl: "h-16 w-16 text-xl" };


/** Avatar: image if available, initials fallback (never a broken image). Optional status ring. */
export function Avatar({ name, src, size = "md", className, ring = false }) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
        sizes[size],
        !showImg && "bg-bg-muted text-blue-700",
        ring && "ring-2 ring-surface",
        className,
      )}
      aria-label={name}
      role="img"
    >
      {showImg ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
