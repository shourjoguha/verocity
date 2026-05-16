/** Autofill every set with the user's last completed performance of that movement.
 *  Match by movement name (case-insensitive, trimmed); ignores section. */
import type { LogDocument, LogItem } from "./types";
import { supabase } from "@/integrations/supabase/client";

export interface LastSetValues {
  weight?: number | null;
  reps?: number | null;
  rpe?: number | null;
  time?: number | null;
  distance?: number | null;
}

/** For each movement name, return the values of the LAST completed set in the
 *  most recent done log that contains that movement. */
export async function loadLastSetByMovement(userId: string): Promise<Map<string, LastSetValues>> {
  const out = new Map<string, LastSetValues>();
  const { data } = await supabase
    .from("workout_logs")
    .select("data")
    .eq("owner_user_id", userId)
    .eq("status", "done")
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  for (const row of (data ?? []) as unknown as { data: LogDocument }[]) {
    // Track which movement names this log already filled, so we use this log's
    // most recent (last in iteration order) completed set per movement.
    const filledThisLog = new Set<string>();
    const lastSetThisLog = new Map<string, LastSetValues>();
    for (const sec of row.data?.sections ?? []) {
      for (const grp of sec.groups ?? []) {
        for (const it of grp.items ?? []) {
          const key = (it.name ?? "").trim().toLowerCase();
          if (!key) continue;
          if (out.has(key)) continue; // already captured from a more recent log
          for (const s of it.sets ?? []) {
            if (!s.actual?.completed) continue;
            const vals: LastSetValues = {
              weight: typeof s.actual.weight === "number" ? s.actual.weight : null,
              reps: typeof s.actual.reps === "number" ? s.actual.reps : null,
              rpe: typeof s.actual.rpe === "number" ? s.actual.rpe : null,
              time: typeof s.actual.time === "number" ? s.actual.time : null,
              distance: typeof s.actual.distance === "number" ? s.actual.distance : null,
            };
            lastSetThisLog.set(key, vals);
            filledThisLog.add(key);
          }
        }
      }
    }
    for (const key of filledThisLog) {
      if (!out.has(key)) out.set(key, lastSetThisLog.get(key)!);
    }
  }
  return out;
}

const METRIC_KEYS = ["weight", "reps", "rpe", "time", "distance"] as const;

/** Apply prefill to a single item. Only fills empty fields, skips sets that have any user data. */
export function prefillItemFromLastSet(item: LogItem, lastByMovement: Map<string, LastSetValues>): void {
  const last = lastByMovement.get((item.name ?? "").trim().toLowerCase());
  if (!last) return;
  for (const set of item.sets) {
    const hasAny = METRIC_KEYS.some((k) => set.actual[k] != null);
    if (hasAny) continue;
    let wrote = false;
    for (const k of METRIC_KEYS) {
      if (!item.metrics.includes(k)) continue;
      const v = last[k];
      if (v == null) continue;
      set.actual[k] = v;
      wrote = true;
    }
    if (wrote) set.actual.prefilled = true;
  }
}

/** Apply prefill to every item in a doc. Mutates and returns the doc. */
export function prefillFromLastSet(doc: LogDocument, lastByMovement: Map<string, LastSetValues>): LogDocument {
  for (const sec of doc.sections) {
    for (const grp of sec.groups) {
      for (const it of grp.items) {
        prefillItemFromLastSet(it, lastByMovement);
      }
    }
  }
  return doc;
}
