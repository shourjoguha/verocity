/** Countdown / count-up timer hook. */
import { useEffect, useRef, useState, useCallback } from "react";

export function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const ref = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (ref.current) window.clearInterval(ref.current);
    ref.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    if (ref.current) return;
    setRunning(true);
    ref.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          stop();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [stop]);

  const reset = useCallback((s?: number) => {
    stop();
    setSeconds(s ?? initialSeconds);
  }, [initialSeconds, stop]);

  useEffect(() => () => { if (ref.current) window.clearInterval(ref.current); }, []);

  return { seconds, running, start, stop, reset, setSeconds };
}

export function useStopwatch() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<number | null>(null);

  const start = useCallback(() => {
    if (ref.current) return;
    setRunning(true);
    ref.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
  }, []);

  const pause = useCallback(() => {
    if (ref.current) window.clearInterval(ref.current);
    ref.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    if (ref.current) window.clearInterval(ref.current);
    ref.current = null;
    setRunning(false);
    setSeconds(0);
  }, []);

  useEffect(() => () => { if (ref.current) window.clearInterval(ref.current); }, []);

  return { seconds, running, start, pause, reset, setSeconds };
}

export function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function fmtLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return fmt(seconds);
}
