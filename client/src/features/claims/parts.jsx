import { useLayoutEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "../../lib/cn";

/** Long text clamped to 4 lines with "Show more" (§10.4 F). */
export function ClampText({ children, lines = 4, className }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [children]);
  return (
    <div className={className}>
      <p ref={ref} className="text-sm text-text whitespace-pre-line" style={open ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {children}
      </p>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-sm font-medium text-blue-600 hover:underline">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/** Two-column key/value list. rows: [label, value] (falsy values render "—"). */
export function KV({ rows, className }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-2 text-sm", className)}>
      {rows.filter(Boolean).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-text">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Photo that never shows a broken-image icon: blur placeholder, fade-in, "Image unavailable" tile on error/missing. */
export function Photo({ src, blur, alt, className, imgClassName, children, onLoad }) {
  const [state, setState] = useState(src ? "loading" : "error");
  if (!src || state === "error") {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 bg-bg-muted text-subtle", className)} role="img" aria-label={alt || "Image unavailable"}>
        <ImageOff size={24} aria-hidden="true" />
        <span className="text-caption">Image unavailable</span>
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden bg-bg-muted bg-cover bg-center", className)} style={blur ? { backgroundImage: `url("${blur}")` } : undefined}>
      <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setState("error")}
        onLoad={(e) => { setState("loaded"); onLoad?.(e); }}
        className={cn("h-full w-full transition-opacity duration-200", state === "loaded" ? "opacity-100" : "opacity-0", imgClassName)} />
      {state === "loaded" && children}
    </div>
  );
}

export const BOX_TONE = {
  fresh: { border: "border-success", bg: "bg-success", label: "Fresh damage" },
  review: { border: "border-warning", bg: "bg-warning", label: "Low confidence / overquoted" },
  old: { border: "border-danger", bg: "bg-danger", label: "Pre-existing" },
};

/** box_2d [ymin, xmin, ymax, xmax] (0–1000) → fractions for absolute positioning / the Lightbox. */
export const toRect = ([y0, x0, y1, x1]) => ({ x: x0 / 1000, y: y0 / 1000, w: (x1 - x0) / 1000, h: (y1 - y0) / 1000 });

/** Image with AI annotation boxes laid over it (object-contain-safe: the overlay matches the rendered image box). */
export function AnnotatedImage({ src, blur, alt, boxes, show, className }) {
  return (
    <Photo src={src} blur={blur} alt={alt} className={className} imgClassName="object-contain">
      {show && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {boxes.map((b, i) => {
            const r = toRect(b.box_2d);
            const t = BOX_TONE[b.tone];
            return (
              <div key={i} className={cn("absolute rounded-sm border-2", t.border)}
                style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
                <span className={cn("absolute -top-6 max-w-64 truncate rounded-sm px-1 text-caption whitespace-nowrap text-on-status", r.x + r.w > 0.6 ? "right-0" : "left-0", t.bg)}>{b.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </Photo>
  );
}
