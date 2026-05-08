/** VibeCheck — pre-session quick capture for sleep/energy/soreness on a 1–4 scale. */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Vibe = { sleep?: number; energy?: number; soreness?: number };

export function VibeCheck({
  open,
  onStart,
  onSkip,
}: {
  open: boolean;
  onStart: (v: Vibe) => void;
  onSkip: () => void;
}) {
  const [vibe, setVibe] = useState<Vibe>({});
  const ready = vibe.sleep != null || vibe.energy != null || vibe.soreness != null;

  function set(k: keyof Vibe, v: number) {
    setVibe((p) => ({ ...p, [k]: p[k] === v ? undefined : v }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSkip(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="flex flex-row items-baseline justify-between">
          <DialogTitle className="font-display text-xl uppercase tracking-[-0.04em]">Vibe check</DialogTitle>
          <button onClick={onSkip} className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors">Skip</button>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {(["sleep","energy","soreness"] as const).map((k) => (
            <div key={k}>
              <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground mb-2">{k}</div>
              <div className="flex gap-2">
                {[1,2,3,4].map((n) => {
                  const on = vibe[k] === n;
                  return (
                    <button
                      key={n}
                      onClick={() => set(k, n)}
                      aria-label={`${k} ${n}`}
                      className={cn(
                        "h-8 w-8 rounded-full border hairline flex items-center justify-center transition-colors",
                        on ? "bg-foreground border-foreground" : "hover:bg-secondary",
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", on ? "bg-background" : "bg-foreground/30")} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <button
            disabled={!ready}
            onClick={() => onStart(vibe)}
            className={cn(
              "w-full ll-btn bg-foreground text-background border-foreground",
              !ready && "opacity-40 cursor-not-allowed",
            )}
          >
            Start
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}