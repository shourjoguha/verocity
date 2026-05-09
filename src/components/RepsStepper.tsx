/** Anchored mini-stepper popover for the reps cell.
 *  Replaces the press-hold-drag StepperInput which is unusable on mobile.
 *  Tap-only: ▲ / ▼ chevrons + numeric input. Tap-outside commits + closes.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { appConfig } from "@/config/app.config";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  value: number | null | undefined;
  /** Hard ceiling for the up arrow. Use Infinity for AMRAP. */
  max?: number;
  /** Element to anchor the popover against. */
  anchorEl: HTMLElement | null;
  onCommit: (v: number) => void;
  onClose: () => void;
}

const haptic = (ms = 5) => {
  if (!appConfig.touch.hapticsEnabled) return;
  try { navigator.vibrate?.(ms); } catch { /* noop */ }
};

export function RepsStepper({ open, value, max = Infinity, anchorEl, onCommit, onClose }: Props) {
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const initialRef = useRef<number | null>(value ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<number | null>(null);
  const holdRef = useRef<number | null>(null);
  const escRef = useRef(false);

  // Reseed on open.
  useEffect(() => {
    if (!open) return;
    initialRef.current = value ?? null;
    setDraft(value == null ? "" : String(value));
    escRef.current = false;
    // Defer focus + select so Popover is fully mounted.
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, [open, value]);

  function clampUp(n: number) { return Math.min(max, Math.max(0, n)); }

  function nudge(delta: 1 | -1) {
    setDraft((prev) => {
      const cur = prev === "" ? 0 : parseInt(prev, 10) || 0;
      const next = clampUp(cur + delta);
      if (next !== cur) haptic(5);
      return String(next);
    });
  }

  function startRepeat(delta: 1 | -1) {
    nudge(delta);
    holdRef.current = window.setTimeout(() => {
      repeatRef.current = window.setInterval(() => nudge(delta), 125);
    }, 400);
  }
  function stopRepeat() {
    if (holdRef.current) { window.clearTimeout(holdRef.current); holdRef.current = null; }
    if (repeatRef.current) { window.clearInterval(repeatRef.current); repeatRef.current = null; }
  }
  useEffect(() => () => stopRepeat(), []);

  function commitAndClose() {
    const parsed = draft === "" ? NaN : parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      const v = Math.max(0, Math.min(max, parsed));
      if (v !== (initialRef.current ?? null)) onCommit(v);
    }
    onClose();
  }

  function handleOpenChange(next: boolean) {
    if (next) return;
    if (escRef.current) { onClose(); return; }
    commitAndClose();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor virtualRef={{ current: anchorEl } as React.RefObject<HTMLElement>} />
      <PopoverContent
        side="top"
        align="center"
        sideOffset={4}
        className="w-auto max-w-[220px] p-2 bg-surface border hairline shadow-md"
        style={{ maxHeight: "25vh" }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { escRef.current = true; onClose(); }
        }}
      >
        <div className="flex items-center gap-1">
          <button
            aria-label="Increment"
            className={cn(
              "inline-flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-colors",
            )}
            style={{ minWidth: appConfig.touch.minTargetPx, minHeight: appConfig.touch.minTargetPx }}
            onPointerDown={(e) => { e.preventDefault(); startRepeat(1); }}
            onPointerUp={stopRepeat}
            onPointerLeave={stopRepeat}
            onPointerCancel={stopRepeat}
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <input
            ref={inputRef}
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              setDraft(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitAndClose(); }
              else if (e.key === "ArrowUp") { e.preventDefault(); nudge(1); }
              else if (e.key === "ArrowDown") { e.preventDefault(); nudge(-1); }
            }}
            className="w-[80px] text-center font-mono tabular-nums no-zoom-input bg-transparent border-b hairline focus:border-foreground focus:outline-none text-3xl tracking-[-0.04em] py-1"
          />
          <button
            aria-label="Decrement"
            className={cn(
              "inline-flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-colors",
            )}
            style={{ minWidth: appConfig.touch.minTargetPx, minHeight: appConfig.touch.minTargetPx }}
            onPointerDown={(e) => { e.preventDefault(); startRepeat(-1); }}
            onPointerUp={stopRepeat}
            onPointerLeave={stopRepeat}
            onPointerCancel={stopRepeat}
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}