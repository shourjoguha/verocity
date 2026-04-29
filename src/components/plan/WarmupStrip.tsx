/** Compressed warm-up strip used by Plan view and Day preview dialog. */
import { appConfig } from "@/config/app.config";
import { cn } from "@/lib/utils";
import type { PlanExercise } from "@/lib/types";

export function WarmupStrip({ exercises, freeText }: { exercises: { idx: number; ex: PlanExercise }[]; freeText?: string }) {
  if (exercises.length === 0 && !freeText) return null;
  const marker = appConfig.blocks.sectionMarkers["Warm-up"];
  const names = exercises.map((e) => e.ex.variant ?? e.ex.name).join(" · ");
  return (
    <div className="mb-2 flex items-stretch border hairline border-dashed">
      <span className={cn("w-1 shrink-0", marker.className)} aria-label="Warm-up" />
      <div className="flex-1 px-2 py-2 text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground leading-relaxed">
        <span className="font-display tracking-[0.18em] mr-2">Warm-up</span>
        {names}
        {freeText && (
          <span className="italic normal-case tracking-normal">
            {names ? " · " : ""}{freeText}
          </span>
        )}
      </div>
    </div>
  );
}