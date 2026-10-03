import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Minus,
  Plus,
  RotateCcw,
  ScanSearch,
  SplitSquareHorizontal,
  X,
} from "lucide-react";
import { useEscape, useFocusTrap, useScrollLock } from "../../hooks/useOverlay";
import { ImagePlaceholder } from "./Illustrations";
import { EASE } from "../../lib/motion";
import { cn } from "../../lib/cn";

const MIN_Z = 1;
const MAX_Z = 5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Severity → colour token + label for annotation boxes (colour is always paired with a text label). */
export const ANNOTATION_SEVERITY = {
  minor: { label: "Minor", color: "var(--blue-600)" },
  moderate: { label: "Moderate", color: "var(--warning)" },
  severe: { label: "Severe", color: "var(--danger)" },
  pre_existing: { label: "Pre-existing", color: "var(--neutral-flag)" },
};

function ToolButton({ icon: Icon, label, onClick, active, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={label}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md text-on-dark transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-on-dark/20" : "hover:bg-on-dark/10",
      )}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

/**
 * Lightbox (§7). items: [{ src, alt, thumb?, caption?, annotations?: [{x,y,w,h,label,severity}] (0–1 fractions),
 * reference?: src of a "before" image, exif?: { key: value } }]
 * Zoom 1–5× (wheel, pinch, buttons, +/−), capped at the image's native resolution so small photos never look
 * pixelated; pan (drag), ←/→, thumbnails, annotations toggle (A),
 * compare slider, download, EXIF panel (I). Esc closes.
 */
export function Lightbox({ open, onClose, items = [], index: startIndex = 0 }) {
  return createPortal(
    <AnimatePresence>{open && items.length > 0 && <LightboxInner onClose={onClose} items={items} startIndex={startIndex} />}</AnimatePresence>,
    document.body,
  );
}

function LightboxInner({ onClose, items, startIndex }) {
  const [index, setIndex] = useState(clamp(startIndex, 0, items.length - 1));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showAnno, setShowAnno] = useState(true);
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);
  const [showInfo, setShowInfo] = useState(false);
  const [failed, setFailed] = useState({});
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  // Highest zoom at which one image pixel still covers at least one CSS pixel (≤ MAX_Z); measured per image.
  const [measured, setMeasured] = useState({ src: null, limit: MIN_Z });
  const maxZRef = useRef(MIN_Z);

  useFocusTrap(rootRef, true);
  useEscape(true, onClose);
  useScrollLock(true);

  const item = items[index];
  const maxZ = measured.src === item.src ? measured.limit : MIN_Z;
  maxZRef.current = maxZ;
  const hasAnno = Boolean(item.annotations?.length);
  const canCompare = Boolean(item.reference);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const go = useCallback(
    (dir) => {
      setIndex((i) => (i + dir + items.length) % items.length);
      reset();
      setCompare(false);
    },
    [items.length, reset],
  );

  /** Zoom to `next`, keeping the point (cx, cy) — relative to the stage centre — fixed on screen. */
  const zoomAt = useCallback((next, cx = 0, cy = 0) => {
    setZoom((z) => {
      const nz = clamp(next(z), MIN_Z, maxZRef.current);
      setPan((p) => (nz === 1 ? { x: 0, y: 0 } : { x: cx - ((cx - p.x) * nz) / z, y: cy - ((cy - p.y) * nz) / z }));
      return nz;
    });
  }, []);

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.offsetWidth) return;
    // Vector images never pixelate (an SVG's naturalWidth is only its nominal size), so they keep the full range.
    const vector = /\.svg(\?|#|$)/i.test(img.currentSrc || img.src) || /^data:image\/svg/i.test(img.src);
    const limit = vector ? MAX_Z : clamp(img.naturalWidth / img.offsetWidth, MIN_Z, MAX_Z);
    maxZRef.current = limit;
    setMeasured({ src: img.getAttribute("src"), limit });
    setZoom((z) => (z > limit ? limit : z));
  }, []);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") zoomAt((z) => z + 0.5);
      else if (e.key === "-") zoomAt((z) => z - 0.5);
      else if (e.key === "0") reset();
      else if (e.key.toLowerCase() === "a" && hasAnno) setShowAnno((v) => !v);
      else if (e.key.toLowerCase() === "i") setShowInfo((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, zoomAt, reset, hasAnno]);

  // Non-passive wheel listener so we can preventDefault page zoom/scroll.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - (r.left + r.width / 2);
      const cy = e.clientY - (r.top + r.height / 2);
      zoomAt((z) => z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), cx, cy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e) => {
    if (e.target.closest("[data-compare-handle]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    } else {
      gesture.current = { type: "pan", x: e.clientX, y: e.clientY, pan };
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(() => (g.zoom * d) / g.dist);
    } else if (g.type === "pan" && zoom > 1) {
      setPan({ x: g.pan.x + e.clientX - g.x, y: g.pan.y + e.clientY - g.y });
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };

  const startSplitDrag = (e) => {
    e.stopPropagation();
    const frame = frameRef.current;
    const move = (ev) => {
      const r = frame.getBoundingClientRect();
      setSplit(clamp(((ev.clientX - r.left) / r.width) * 100, 0, 100));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const severities = hasAnno ? [...new Set(item.annotations.map((a) => a.severity))] : [];

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer: ${item.alt || item.caption || "image"} (${index + 1} of ${items.length})`}
      className="fixed inset-0 z-[90] flex flex-col bg-panel-dark text-on-dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      {/* Toolbar */}
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.caption || item.alt}</p>
          <p className="num text-caption text-on-dark-muted">
            {index + 1} / {items.length} · {Math.round(zoom * 100)}%
          </p>
        </div>
        <ToolButton icon={Minus} label="Zoom out (−)" onClick={() => zoomAt((z) => z - 0.5)} disabled={zoom <= MIN_Z} />
        <ToolButton icon={Plus} label={maxZ <= MIN_Z ? "Shown at full resolution" : "Zoom in (+)"} onClick={() => zoomAt((z) => z + 0.5)} disabled={zoom >= maxZ} />
        <ToolButton icon={RotateCcw} label="Reset zoom (0)" onClick={reset} disabled={zoom === 1} />
        <span className="mx-1 h-6 w-px bg-on-dark/20" aria-hidden="true" />
        <ToolButton icon={ScanSearch} label="Show AI annotations (A)" onClick={() => setShowAnno((v) => !v)} active={showAnno && hasAnno} disabled={!hasAnno} />
        <ToolButton icon={SplitSquareHorizontal} label="Before / after compare" onClick={() => setCompare((v) => !v)} active={compare} disabled={!canCompare} />
        <ToolButton icon={Info} label="Image info (I)" onClick={() => setShowInfo((v) => !v)} active={showInfo} />
        <a
          href={item.src}
          download
          aria-label="Download image"
          title="Download image"
          className="flex h-10 w-10 items-center justify-center rounded-md text-on-dark transition-colors duration-150 hover:bg-on-dark/10"
        >
          <Download size={20} aria-hidden="true" />
        </a>
        <span className="mx-1 h-6 w-px bg-on-dark/20" aria-hidden="true" />
        <ToolButton icon={X} label="Close (Esc)" onClick={onClose} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Stage */}
        <div
          ref={stageRef}
          className={cn("relative flex min-w-0 flex-1 touch-none items-center justify-center overflow-hidden select-none", zoom > 1 ? "cursor-grab active:cursor-grabbing" : maxZ > MIN_Z ? "cursor-zoom-in" : "cursor-default")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            const r = stageRef.current.getBoundingClientRect();
            if (zoom > 1) reset();
            else zoomAt(() => 2.5, e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
          }}
        >
          <button type="button" onClick={() => go(-1)} aria-label="Previous image (←)" className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-panel-dark/80 text-on-dark shadow-lg transition-colors duration-150 hover:bg-on-dark/20" onPointerDown={(e) => e.stopPropagation()}>
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next image (→)" className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-panel-dark/80 text-on-dark shadow-lg transition-colors duration-150 hover:bg-on-dark/20" onPointerDown={(e) => e.stopPropagation()}>
            <ChevronRight size={24} aria-hidden="true" />
          </button>

          <div
            ref={frameRef}
            className="relative"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transition: gesture.current ? "none" : "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            {failed[index] ? (
              <ImagePlaceholder className="h-96 w-160 max-w-full rounded-lg" />
            ) : (
              <img
                key={item.src}
                ref={imgRef}
                onLoad={measure}
                src={item.src}
                alt={item.alt || item.caption || ""}
                draggable={false}
                onError={() => setFailed((f) => ({ ...f, [index]: true }))}
                className="block max-w-[80vw] rounded-md object-contain"
                style={{ maxHeight: "calc(100dvh - 15rem)" }}
              />
            )}

            {compare && canCompare && (
              <>
                <img
                  src={item.reference}
                  alt="Reference (before)"
                  draggable={false}
                  className="absolute inset-0 h-full w-full rounded-md object-cover"
                  style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                />
                <div className="pointer-events-none absolute inset-y-0" style={{ left: `${split}%` }}>
                  <span className="absolute inset-y-0 -left-px w-0.5 bg-on-dark shadow-lg" />
                  <button
                    type="button"
                    data-compare-handle
                    aria-label="Drag to compare before and after"
                    role="slider"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(split)}
                    onPointerDown={startSplitDrag}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft") (e.preventDefault(), e.stopPropagation(), setSplit((s) => clamp(s - 5, 0, 100)));
                      if (e.key === "ArrowRight") (e.preventDefault(), e.stopPropagation(), setSplit((s) => clamp(s + 5, 0, 100)));
                    }}
                    className="pointer-events-auto absolute top-1/2 -left-5 flex h-10 w-10 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-on-dark text-panel-dark shadow-lg"
                  >
                    <SplitSquareHorizontal size={20} aria-hidden="true" />
                  </button>
                </div>
                <span className="absolute top-2 left-2 rounded-sm bg-panel-dark/80 px-2 py-1 text-caption">Before</span>
                <span className="absolute top-2 right-2 rounded-sm bg-panel-dark/80 px-2 py-1 text-caption">After</span>
              </>
            )}

            <AnimatePresence>
              {showAnno && hasAnno && !compare && (
                <motion.svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  aria-hidden="true"
                >
                  {item.annotations.map((a, i) => {
                    const c = ANNOTATION_SEVERITY[a.severity]?.color ?? "var(--blue-600)";
                    return (
                      <rect
                        key={i}
                        x={a.x * 100}
                        y={a.y * 100}
                        width={a.w * 100}
                        height={a.h * 100}
                        fill={c}
                        fillOpacity="0.12"
                        stroke={c}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                        rx="0.8"
                      />
                    );
                  })}
                </motion.svg>
              )}
            </AnimatePresence>
            {showAnno && hasAnno && !compare &&
              item.annotations.map((a, i) => (
                <span
                  key={i}
                  className="pointer-events-none absolute rounded-sm px-1 text-caption text-on-status shadow-sm"
                  style={{
                    left: `${a.x * 100}%`,
                    top: `${a.y * 100}%`,
                    transform: `translateY(-100%) scale(${1 / zoom})`,
                    transformOrigin: "bottom left",
                    background: ANNOTATION_SEVERITY[a.severity]?.color ?? "var(--blue-600)",
                  }}
                >
                  {a.label}
                </span>
              ))}
          </div>

          {showAnno && hasAnno && !compare && (
            <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-md bg-panel-dark/90 px-3 py-2 text-caption shadow-lg">
              <span className="text-on-dark-muted">AI annotations:</span>
              {severities.map((s) => (
                <span key={s} className="inline-flex items-center gap-1">
                  <span className="h-3 w-3 rounded-sm border-2" style={{ borderColor: ANNOTATION_SEVERITY[s]?.color }} aria-hidden="true" />
                  {ANNOTATION_SEVERITY[s]?.label ?? s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* EXIF / info panel */}
        <AnimatePresence initial={false}>
          {showInfo && (
            <motion.aside
              className="w-80 shrink-0 overflow-y-auto border-l border-on-dark/10 p-4"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: EASE }}
              aria-label="Image information"
            >
              <h2 className="mb-3 text-base font-semibold">Image information</h2>
              {item.exif && Object.keys(item.exif).length ? (
                <dl className="flex flex-col gap-3">
                  {Object.entries(item.exif).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-caption text-on-dark-muted">{k}</dt>
                      <dd className="mono text-sm break-words">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-on-dark-muted">No EXIF metadata was found in this image.</p>
              )}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Thumbnails */}
      {items.length > 1 && (
        <div className="flex h-24 shrink-0 items-center justify-center gap-2 overflow-x-auto px-4" role="listbox" aria-label="Images">
          {items.map((it, i) => (
            <button
              key={it.src + i}
              type="button"
              role="option"
              aria-selected={i === index}
              aria-label={`Image ${i + 1}: ${it.alt || it.caption || ""}`}
              onClick={() => {
                setIndex(i);
                reset();
                setCompare(false);
              }}
              className={cn(
                "relative h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-[border-color,opacity] duration-150",
                i === index ? "border-primary opacity-100" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              <img src={it.thumb || it.src} alt="" className="h-full w-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
