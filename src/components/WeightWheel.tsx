/** WeightWheel — vertical drum picker for weight, 0.5kg increments, 0–500kg.
 *  Uses framer-motion drag + inertia + snap. Light haptic per step.
 *  Has a "kbd" toggle to switch to a numeric input for desktop typing. */
import { useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { animate, motion, useMotionValue } from "framer-motion";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";

const STEP = 0.5;
const MIN = 0;
const MAX = 500;
const COUNT = Math.round((MAX - MIN) / STEP) + 1; // 1001
const ROW_PX = 40;

function indexOf(value: number) {
  return Math.max(0, Math.min(COUNT - 1, Math.round((value - MIN) / STEP)));
}
function valueOf(index: number) {
  return MIN + index * STEP;
}

export function WeightWheel({
  open,
  initial,
  onClose,
  onCommit,
}: {
  open: boolean;
  initial: number | null | undefined;
  onClose: () => void;
  onCommit: (v: number) => void;
}) {
  const startVal = typeof initial === "number" ? initial : 0;
  const [value, setValue] = useState<number>(startVal);
  const [keyboard, setKeyboard] = useState(false);
  const [text, setText] = useState<string>(String(startVal));
  const y = useMotionValue(-indexOf(startVal) * ROW_PX);
  const lastIdxRef = useRef(indexOf(startVal));

  useEffect(() => {
    if (open) {
      const v = typeof initial === "number" ? initial : 0;
      setValue(v);
      setText(String(v));
      const idx = indexOf(v);
      lastIdxRef.current = idx;
      y.set(-idx * ROW_PX);
    }
  }, [open, initial, y]);

  useEffect(() => {
    if (keyboard) return;
    const unsub = y.on("change", (latest) => {
      const idx = Math.max(0, Math.min(COUNT - 1, Math.round(-latest / ROW_PX)));
      if (idx !== lastIdxRef.current) {
        lastIdxRef.current = idx;
        setValue(valueOf(idx));
        try { navigator.vibrate?.(8); } catch { /* noop */ }
      }
    });
    return () => unsub();
  }, [y, keyboard]);

  function snap() {
    const idx = Math.max(0, Math.min(COUNT - 1, Math.round(-y.get() / ROW_PX)));
    animate(y, -idx * ROW_PX, { type: "spring", stiffness: 400, damping: 40 });
    setValue(valueOf(idx));
  }

  function commit() {
    const v = keyboard ? Math.max(MIN, Math.min(MAX, Number(text) || 0)) : value;
    onCommit(Math.round(v / STEP) * STEP);
    onClose();
  }

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent>
        <DrawerHeader className="flex flex-row items-center justify-between pr-4">
          <DrawerTitle className="font-display text-lg uppercase tracking-[-0.03em]">Weight</DrawerTitle>
          <button
            onClick={() => setKeyboard((k) => !k)}
            className={cn("border hairline px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] flex items-center gap-1", keyboard && "bg-foreground text-background border-foreground")}
            aria-label="Toggle keyboard input"
          >
            <Keyboard className="h-3 w-3" /> kbd
          </button>
        </DrawerHeader>

        {keyboard ? (
          <div className="px-6 py-8 flex items-center justify-center">
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
              className="font-display text-5xl tracking-[-0.04em] bg-transparent border-b hairline focus:border-foreground focus:outline-none w-48 text-center"
            />
            <span className="ml-2 text-sm text-muted-foreground uppercase tracking-[0.16em]">kg</span>
          </div>
        ) : (
          <div className="relative h-[280px] overflow-hidden select-none touch-none">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 border-y hairline pointer-events-none" />
            <motion.div
              className="absolute inset-x-0"
              style={{ y, top: "calc(50% - 20px)" }}
              drag="y"
              dragMomentum
              dragConstraints={{ top: -(COUNT - 1) * ROW_PX, bottom: 0 }}
              onDragEnd={snap}
            >
              {Array.from({ length: COUNT }).map((_, i) => {
                const v = valueOf(i);
                const isCurrent = i === lastIdxRef.current;
                return (
                  <div
                    key={i}
                    className={cn(
                      "h-10 flex items-center justify-center font-mono tabular-nums",
                      isCurrent ? "font-display text-3xl tracking-[-0.02em]" : "text-base text-muted-foreground/60",
                    )}
                  >
                    {v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}
                  </div>
                );
              })}
            </motion.div>
          </div>
        )}

        <DrawerFooter className="flex flex-row gap-2 justify-end">
          <button onClick={onClose} className="ll-btn">Cancel</button>
          <button onClick={commit} className="ll-btn bg-foreground text-background border-foreground">Done</button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}