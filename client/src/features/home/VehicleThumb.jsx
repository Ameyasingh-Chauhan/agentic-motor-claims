import { useState } from "react";
import { Bike, Car, Truck } from "lucide-react";
import { cn } from "../../lib/cn";

const TYPE_ICON = { Car, "2W": Bike, CV: Truck };
// Seeded media points at neutral placeholders until real stock photos are fetched (§18, PROGRESS decision 18).
const isPlaceholder = (url) => !url || /\/fallback(-thumb)?\.(webp|svg|png)$/.test(url);

/**
 * Fixed-size image box (§8.4): blur placeholder behind the photo, fade-in on load, never a broken-image icon and
 * no layout shift. When only the generic placeholder exists, shows a theme-aware vehicle-type tile instead.
 */
export function VehicleThumb({ vehicle, src, blur, alt = "", label, className, iconSize = 16 }) {
  const [state, setState] = useState("loading");
  const url = src ?? vehicle?.thumb;
  const Icon = TYPE_ICON[vehicle?.type] ?? Car;

  if (isPlaceholder(url) || state === "error") {
    return (
      <span className={cn("relative flex shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-sm bg-tint-blue-bg text-tint-blue", className)}
        role="img" aria-label={alt || (vehicle ? `${vehicle.make} ${vehicle.model}` : "Vehicle")}>
        <Icon size={iconSize} aria-hidden="true" />
        {label && <span className="text-caption text-muted">{label}</span>}
      </span>
    );
  }
  const placeholder = blur ?? vehicle?.blur_data;
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden rounded-sm bg-bg-muted bg-cover bg-center", className)}
      style={placeholder ? { backgroundImage: `url("${placeholder}")` } : undefined}
    >
      <img
        src={url}
        alt={alt || (vehicle ? `${vehicle.make} ${vehicle.model}` : "")}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        className={cn("h-full w-full object-cover transition-opacity duration-200", state === "loaded" ? "opacity-100" : "opacity-0")}
      />
    </span>
  );
}
