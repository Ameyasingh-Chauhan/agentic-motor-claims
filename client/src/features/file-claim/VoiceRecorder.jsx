import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mic, Pause, Play, RotateCcw, Square, Upload } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui/Button";
import { MAX_RECORD_S } from "./constants";

const BARS = 24;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function pickMime() {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  return "";
}

/**
 * Voice note (§10.6 step 3): click to start/stop or hold to talk, live level meter, timer (max 3 min), playback, re-record, or
 * upload an existing audio file. Calls `onReady(file)` with the recording; the parent sends it to the Intake agent.
 */
export function VoiceRecorder({ onReady, disabled }) {
  const [state, setState] = useState("idle"); // idle | recording | recorded | denied | unsupported
  const [elapsed, setElapsed] = useState(0);
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const bars = useRef([]);
  const rec = useRef(null);
  const stream = useRef(null);
  const raf = useRef(0);
  const t0 = useRef(0);
  const hold = useRef({ timer: 0, active: false });
  const audio = useRef(null);
  const actx = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => () => { cleanup(); if (url) URL.revokeObjectURL(url); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function cleanup() {
    cancelAnimationFrame(raf.current);
    actx.current?.close().catch(() => {});
    actx.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  function setRecording(f) {
    if (url) URL.revokeObjectURL(url);
    setFile(f);
    setUrl(URL.createObjectURL(f));
    setState("recorded");
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setState("unsupported"); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch { setState("denied"); return; }
    const mime = pickMime();
    const mr = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      cleanup();
      const type = (mr.mimeType || "audio/webm").split(";")[0];
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      setRecording(new File(chunks, `voice-note.${ext}`, { type }));
    };
    rec.current = mr;
    mr.start(250);
    t0.current = performance.now();
    setElapsed(0);
    setState("recording");
    const ctx = new AudioContext();
    actx.current = ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 64;
    ctx.createMediaStreamSource(stream.current).connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    const loop = () => {
      an.getByteFrequencyData(data);
      bars.current.forEach((el, i) => { if (el) el.style.transform = `scaleY(${Math.max(0.08, (data[i % data.length] || 0) / 255)})`; });
      const s = (performance.now() - t0.current) / 1000;
      setElapsed(s);
      if (s >= MAX_RECORD_S) { stop(); return; }
      raf.current = requestAnimationFrame(loop);
    };
    loop();
  }

  function stop() {
    if (rec.current?.state === "recording") rec.current.stop();
  }

  const onPointerDown = () => {
    if (state === "recording") return;
    hold.current.timer = window.setTimeout(() => { hold.current.active = true; }, 350);
    start();
  };
  const onPointerUp = () => {
    clearTimeout(hold.current.timer);
    if (hold.current.active) { hold.current.active = false; stop(); }
  };
  const onClick = () => { if (state === "recording" && !hold.current.active) stop(); };

  const toggleplay = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };

  const recording = state === "recording";
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-bg-subtle p-6">
      {state !== "recorded" ? (
        <>
          <div className="relative">
            <AnimatePresence>
              {recording && <motion.span aria-hidden="true" className="absolute inset-0 rounded-full bg-primary" initial={{ opacity: 0.35, scale: 1 }}
                animate={{ opacity: 0, scale: 1.6 }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }} />}
            </AnimatePresence>
            <button type="button" disabled={disabled}
              onPointerDown={state === "recording" ? undefined : onPointerDown} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onClick={onClick}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); recording ? stop() : start(); } }}
              aria-label={recording ? "Stop recording" : "Start recording"} aria-pressed={recording}
              className={cn("relative flex h-20 w-20 items-center justify-center rounded-full shadow-md transition-colors duration-150",
                recording ? "bg-danger text-on-status" : "bg-primary text-on-primary hover:bg-primary-hover", disabled && "opacity-50")}>
              {recording ? <Square size={28} aria-hidden="true" /> : <Mic size={32} aria-hidden="true" />}
            </button>
          </div>
          <div className="flex h-10 items-end gap-1" aria-hidden="true">
            {Array.from({ length: BARS }, (_, i) => (
              <span key={i} ref={(el) => { bars.current[i] = el; }} className={cn("wz-level-bar h-10 w-1.5 rounded-full", recording ? "bg-primary" : "bg-border-strong")}
                style={{ transform: "scaleY(0.08)" }} />
            ))}
          </div>
          <p className="num text-sm text-text" aria-live="off">{recording ? `${fmt(elapsed)} / ${fmt(MAX_RECORD_S)}` : "Click to start · or hold to talk"}</p>
          {state === "denied" && <p className="text-sm text-danger">Microphone access was blocked. Allow it in the browser's address bar, or upload an audio file.</p>}
          {state === "unsupported" && <p className="text-sm text-danger">This browser can't record audio. Upload an audio file instead.</p>}
          {!recording && (
            <Button variant="ghost" size="sm" icon={Upload} onClick={() => fileInput.current?.click()}>Upload an audio file</Button>
          )}
        </>
      ) : (
        <div className="flex w-full flex-col items-center gap-4">
          <audio ref={audio} src={url} onEnded={() => setPlaying(false)} preload="metadata" />
          <div className="flex items-center gap-3">
            <Button variant="secondary" icon={playing ? Pause : Play} onClick={toggleplay}>{playing ? "Pause" : "Play back"}</Button>
            <span className="text-sm text-muted">{file?.name} · {fmt(elapsed || 0)}</span>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" icon={RotateCcw} onClick={() => { setState("idle"); setFile(null); setElapsed(0); }} disabled={disabled}>Re-record</Button>
            <Button icon={Mic} onClick={() => onReady(file)} loading={disabled}>Send to the Intake agent</Button>
          </div>
        </div>
      )}
      <input ref={fileInput} type="file" accept="audio/*" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setRecording(f); e.target.value = ""; }} />
    </div>
  );
}
