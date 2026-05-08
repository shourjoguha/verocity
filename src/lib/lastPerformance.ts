/** Pre-fill weight from the user's all-time max for each movement (case-insensitive name match).
 *  Reps and RPE are seeded from the prescription in logBuilder; this only handles weight. */
import type { LogDocument } from "./types";
import { supabase } from "@/integrations/supabase/client";

/** Scan user's done logs and return the max numeric actual.weight per movement name (lowercased+trimmed). */
export async function loadMaxWeightByMovement(userId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data } = await supabase
    .from("workout_logs")
    .select("data")
    .eq("owner_user_id", userId)
    .eq("status", "done")
    .limit(500);
  for (const row of (data ?? []) as unknown as { data: LogDocument }[]) {
    for (const sec of row.data?.sections ?? []) {
      for (const grp of sec.groups ?? []) {
        for (const it of grp.items ?? []) {
          const key = (it.name ?? "").trim().toLowerCase();
          if (!key) continue;
          for (const s of it.sets ?? []) {
            const w = s.actual?.weight;
            if (typeof w === "number" && isFinite(w) && w > 0) {
              const prev = out.get(key) ?? 0;
              if (w > prev) out.set(key, w);
            }
          }
        }
      }
    }
  }
  return out;
}

/** Seed actual.weight on every set of every item from the max-by-movement map.
 *  Only fills empty weight slots; never overwrites user input. Marks set.actual.prefilled = true. */
export function prefillWeightsFromMax(doc: LogDocument, maxByMovement: Map<string, number>): LogDocument {
  for (const sec of doc.sections) {
    for (const grp of sec.groups) {
      for (const it of grp.items) {
        if (!it.metrics.includes("weight")) continue;
        const max = maxByMovement.get((it.name ?? "").trim().toLowerCase());
        if (max == null) continue;
        for (const set of it.sets) {
          if (set.actual.weight == null) {
            set.actual.weight = max;
            set.actual.prefilled = true;
          }
        }
      }
    }
  }
  return doc;
}
