/** Long-press hook for mouse + touch. */
import { useCallback, useRef } from "react";
import { appConfig } from "@/config/app.config";

export function useLongPress(onLong: () => void, onClick?: () => void, ms = appConfig.touch.longPressMs) {
  const timer = useRef<number | null>(null);
  const triggered = useRef(false);
  const startPt = useRef<{ x: number; y: number } | null>(null);
  const tolerance = appConfig.touch.longPressMoveTolerancePx;

  const start = useCallback((x = 0, y = 0) => {
    triggered.current = false;
    startPt.current = { x, y };
    timer.current = window.setTimeout(() => {
      triggered.current = true;
      if (appConfig.touch.hapticsEnabled && typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { (navigator as Navigator).vibrate?.(10); } catch { /* noop */ }
      }
      onLong();
    }, ms);
  }, [onLong, ms]);

  const clear = useCallback(
    (clicked = false) => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      startPt.current = null;
      if (clicked && !triggered.current && onClick) onClick();
    },
    [onClick]
  );

  const move = useCallback((x: number, y: number) => {
    if (!startPt.current || !timer.current) return;
    const dx = x - startPt.current.x;
    const dy = y - startPt.current.y;
    if (Math.hypot(dx, dy) > tolerance) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, [tolerance]);

  return {
    onMouseDown: (e: React.MouseEvent) => start(e.clientX, e.clientY),
    onMouseUp: () => clear(true),
    onMouseLeave: () => clear(false),
    onMouseMove: (e: React.MouseEvent) => move(e.clientX, e.clientY),
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start(t?.clientX ?? 0, t?.clientY ?? 0);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    },
    onTouchEnd: () => clear(true),
    onTouchCancel: () => clear(false),
  } as const;
}
