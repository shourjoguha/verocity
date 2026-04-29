/** Compact day-of-plan preview: warm-up strip + main movements (current week only). */
import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { WarmupStrip } from "@/components/plan/WarmupStrip";
import { appConfig } from "@/config/app.config";
import { cn } from "@/lib/utils";
import type { PlanDay, PlanExercise } from "@/lib/types";

export function DayPreviewDialog({
  day,
  week,
  open,
  onOpenChange,
  onStart,
}: {
  day: PlanDay | null;
  week: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onStart: () => void;
}) {
  const partition = useMemo(() => {
    if (!day) return { warmupExercises: [], mainExercises: [] };
    const wu: { idx: number; ex: PlanExercise }[] = [];
    const main: { idx: number; ex: PlanExercise }[] = [];
    day.exercises.forEach((ex, idx) => {
      const sectionKey = (appConfig.sectionAliases[ex.block.toLowerCase()] ?? ex.block) as string;
      if (sectionKey === "Warm-up") wu.push({ idx, ex });
      else main.push({ idx, ex });
    });
    return { warmupExercises: wu, mainExercises: main };
  }, [day]);

  if (!day) return null;
  const markers = appConfig.blocks.sectionMarkers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-[-0.04em] uppercase">{day.type}</DialogTitle>
          <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">{day.dayName} · Week {week}</div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          <WarmupStrip exercises={partition.warmupExercises} freeText={day.warmup} />
          <div className="border hairline divide-y hairline">
            {partition.mainExercises.map(({ idx, ex }) => {
              const sectionKey = (appConfig.sectionAliases[ex.block.toLowerCase()] ?? ex.block) as string;
              const marker = markers[sectionKey] ?? markers["Main"];
              const planned = ex.weeks[week];
              return (
                <div key={idx} className="flex items-stretch">
                  <span className={cn("w-1 shrink-0", marker.className)} aria-label={sectionKey} />
                  <div className="flex-1 flex items-center justify-between gap-2 px-2 py-2">
                    <span className="font-display text-sm tracking-[-0.03em] truncate">{ex.variant ?? ex.name}</span>
                    <span className="font-mono text-[0.7rem] text-muted-foreground shrink-0">
                      {planned?.raw ?? "·"}
                    </span>
                  </div>
                </div>
              );
            })}
            {partition.mainExercises.length === 0 && (
              <div className="px-2 py-3 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">No movements</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="ll-btn">Close</button>
          <button onClick={onStart} className="ll-btn bg-foreground text-background border-foreground">Start workout</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}