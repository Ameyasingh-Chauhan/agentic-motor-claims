import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Languages } from "lucide-react";
import { Badge } from "./Badge";
import { formatDuration } from "../../lib/format";
import { cn } from "../../lib/cn";

/** Deterministic pseudo-waveform when no precomputed peaks are supplied. */
function fallbackPeaks(seed = "audio", n = 64) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const env = Math.sin((i / n) * Math.PI) * 0.6 + 0.4;
    out.push(0.2 + ((h % 1000) / 1000) * 0.8 * env);
  }
  return out;
}

/**
 * AudioPlayer (§7): play/pause, scrub (click/drag waveform or arrow keys), waveform bars,
 * speed 1× / 1.5×, transcript + translation with detected-language tag.
 */
export function AudioPlayer({ src, peaks, title = "Voice note", language, transcript, translation, className }) {
  const audioRef = useRef(null);
  const waveRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState(false);
  const bars = useMemo(() => peaks ?? fallbackPeaks(src), [peaks, src]);
  const pct = duration ? time / duration : 0;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return undefined;
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onEnd = () => setPlaying(false);
    const onErr = () => setError(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a || error) return;
    if (a.paused) {
      try {
        await a.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seekTo = (fraction) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    a.currentTime = Math.max(0, Math.min(duration, fraction * duration));
    setTime(a.currentTime);
  };
  const seekFromPointer = (e) => {
    const r = waveRef.current.getBoundingClientRect();
    seekTo((e.clientX - r.left) / r.width);
  };

  return (
    <div className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={error}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-[background-color,transform,opacity] duration-150 hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" className="translate-x-px" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="truncate text-sm font-medium text-text">{title}</span>
            {language && (
              <Badge tone="blue" icon={Languages}>
                {language}
              </Badge>
            )}
          </div>
          <div
            ref={waveRef}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${formatDuration(time)} of ${formatDuration(duration)}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekFromPointer(e);
            }}
            onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") (e.preventDefault(), seekTo((time + 5) / (duration || 1)));
              if (e.key === "ArrowLeft") (e.preventDefault(), seekTo((time - 5) / (duration || 1)));
              if (e.key === " ") (e.preventDefault(), toggle());
            }}
            className="flex h-8 cursor-pointer touch-none items-center gap-0.5 rounded-sm"
          >
            {bars.map((p, i) => {
              const played = i / bars.length < pct;
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  className={cn("w-1 flex-1 origin-center rounded-full transition-colors duration-150", played ? "bg-blue-600" : "bg-border-strong")}
                  style={{ height: "100%", transform: `scaleY(${p})` }}
                />
              );
            })}
          </div>
        </div>
        <span className="num w-20 shrink-0 text-right text-caption text-subtle">
          {formatDuration(time)} / {formatDuration(duration)}
        </span>
        <button
          type="button"
          onClick={() => setRate((r) => (r === 1 ? 1.5 : 1))}
          aria-label={`Playback speed ${rate}×`}
          className="num h-8 w-12 shrink-0 rounded-sm border border-border-strong text-caption text-muted transition-colors duration-150 hover:bg-bg-muted"
        >
          {rate}×
        </button>
      </div>
      {error && <p className="mt-2 text-caption text-danger">This recording couldn't be played.</p>}
      {(transcript || translation) && (
        <div className="mt-4 grid gap-3 border-t border-border pt-3 md:grid-cols-2">
          {transcript && (
            <div>
              <p className="mb-1 text-caption text-subtle">Transcript{language ? ` (${language})` : ""}</p>
              <p className="text-sm text-text">{transcript}</p>
            </div>
          )}
          {translation && (
            <div>
              <p className="mb-1 text-caption text-subtle">English translation</p>
              <p className="text-sm text-text">{translation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
