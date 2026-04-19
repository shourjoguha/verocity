/** Long-press hook for mouse + touch. */
import { useCallback, useRef } from "react";
import { appConfig } from "@/config/app.config";

export function useLongPress(onLong: () => void, onClick?: () => void, ms = appConfig.ui.longPressMs) {
  const timer = useRef<number | null>(null);
  const triggered = useRef(false);

  const start = useCallback(() => {
    triggered.current = false;
    timer.current = window.setTimeout(() => {
      triggered.current = true;
      onLong();
    }, ms);
  }, [onLong, ms]);

  const clear = useCallback(
    (clicked = false) => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      if (clicked && !triggered.current && onClick) onClick();
    },
    [onClick]
  );

  return {
    onMouseDown: start,
    onMouseUp: () => clear(true),
    onMouseLeave: () => clear(false),
    onTouchStart: start,
    onTouchEnd: () => clear(true),
    onTouchCancel: () => clear(false),
  } as const;
}
