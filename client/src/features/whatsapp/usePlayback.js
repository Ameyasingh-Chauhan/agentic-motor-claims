import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTimer } from "animejs";

const GAP = 450;   // pause after each message (ms at 1×)

/**
 * Playback schedule for a scripted chat (§10.9): every message gets a typing window (business messages only) and an appear time.
 * One anime.js timer drives the clock; React state is derived from `time`, so play / pause / speed / step / scrub are all just
 * seeks on the same timer.
 */
export function buildSchedule(messages) {
  let t = 300;
  return messages.map((m) => {
    const typing = m.from === "business" ? Math.min(1600, 600 + (m.text?.length ?? 40) * 6) : 350;
    const start = t;
    const at = start + typing;
    t = at + GAP + (m.type === "voice" || m.type === "images" ? 500 : 0);
    return { start, at };
  });
}

export function usePlayback(messages, { autoplay = true } = {}) {
  const schedule = useMemo(() => buildSchedule(messages), [messages]);
  const total = schedule.length ? schedule[schedule.length - 1].at + 600 : 0;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const timer = useRef(null);

  useEffect(() => {
    if (!total) return undefined;
    const t = createTimer({
      duration: total,
      autoplay: false,
      onUpdate: (self) => setTime(self.currentTime),
      onComplete: () => setPlaying(false),
    });
    t.speed = speed;
    timer.current = t;
    setTime(0);
    if (autoplay) { t.play(); setPlaying(true); } else setPlaying(false);
    return () => { t.pause(); t.revert(); timer.current = null; };
  }, [total, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => schedule.filter((s) => s.at <= time).length, [schedule, time]);
  const typing = visible < messages.length && messages[visible].from === "business" && time >= schedule[visible].start;

  const seek = useCallback((ms) => {
    const t = timer.current;
    if (!t) return;
    const clamped = Math.max(0, Math.min(total, ms));
    t.seek(clamped);
    setTime(clamped);
  }, [total]);

  const play = useCallback(() => {
    const t = timer.current;
    if (!t) return;
    if (t.currentTime >= total - 1) t.seek(0);
    t.play();
    setPlaying(true);
  }, [total]);
  const pause = useCallback(() => { timer.current?.pause(); setPlaying(false); }, []);
  const restart = useCallback(() => { seek(0); play(); }, [seek, play]);
  const setSpeed = useCallback((v) => { if (timer.current) timer.current.speed = v; setSpeedState(v); }, []);
  /** Jump to the moment message `i` appears (i = -1 → empty chat). */
  const showUpTo = useCallback((i) => seek(i < 0 ? 0 : schedule[Math.min(i, schedule.length - 1)].at), [seek, schedule]);
  const stepForward = useCallback(() => { pause(); showUpTo(visible); }, [pause, showUpTo, visible]);
  const stepBack = useCallback(() => { pause(); showUpTo(visible - 2); }, [pause, showUpTo, visible]);

  return { schedule, total, time, visible, typing, playing, speed, play, pause, restart, setSpeed, seek, showUpTo, stepForward, stepBack };
}
