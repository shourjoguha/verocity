/** SetShapeStrip — thin vertical bars per completed set.
 *  - 3px wide, 1px gap.
 *  - Height ∝ reps (or time/distance fallback), normalized per session, 20% min.
 *  - Opacity ∝ rpe (6→0.4, 10→1.0), default 0.7 when missing.
 *  - CSS only. Renders nothing if no completed sets. */
import type { LogDocument } from "@/lib/types";

export function SetShapeStrip({
  data,
  color,
  height = 24,
}: {
  data?: LogDocument | null;
  color: string;
  height?: number;
}) {
  if (!data?.sections) return null;
  const values: { mag: number; opacity: number }[] = [];
  for (const sec of data.sections) {
    for (const grp of sec.groups ?? []) {
      for (const it of grp.items ?? []) {
        for (const s of it.sets ?? []) {
          if (!s.actual?.completed) continue;
          const mag =
            (typeof s.actual.reps === "number" && s.actual.reps) ||
            (typeof s.actual.time === "number" && s.actual.time) ||
            (typeof s.actual.distance === "number" && s.actual.distance) ||
            1;
          const rpe = typeof s.actual.rpe === "number" ? s.actual.rpe : null;
          let opacity = 0.7;
          if (rpe != null) {
            const t = Math.max(0, Math.min(1, (rpe - 6) / 4));
            opacity = 0.4 + t * 0.6;
          }
          values.push({ mag, opacity });
        }
      }
    }
  }
  if (values.length === 0) return null;
  const max = Math.max(...values.map((v) => v.mag));
  return (
    <div
      className="flex items-end gap-px"
      style={{ height }}
      aria-hidden
    >
      {values.map((v, i) => {
        const ratio = max > 0 ? v.mag / max : 1;
        const h = Math.max(0.2, ratio) * 100;
        return (
          <span
            key={i}
            style={{
              width: 3,
              height: `${h}%`,
              backgroundColor: color,
              opacity: v.opacity,
            }}
          />
        );
      })}
    </div>
  );
}