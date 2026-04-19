/** Pre-fill set actuals from the most recent matching performance.
 *  Matches by (movement name, section name) — case-insensitive.
 *  Only fills empty actual fields; never overwrites planned values or user input. */
import type { LogDocument, LogItem, LogSet } from "./types";
import { supabase } from "@/integrations/supabase/client";
import type { Metric } from "@/config/app.config";

interface HistoryRow { data: LogDocument; log_date: string }

/** Loads recent done logs for the user. */
export async function loadHistory(userId: string, limit = 50): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from("workout_logs")
    .select("data,log_date")
    .eq("owner_user_id", userId)
    .eq("status", "done")
    .order("log_date", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as HistoryRow[]);
}

/** Find best/most-recent set for a movement within a matching section name. */
function findRecentSet(history: HistoryRow[], movementName: string, sectionName: string): LogSet | null {
  const mn = movementName.trim().toLowerCase();
  const sn = sectionName.trim().toLowerCase();
  for (const row of history) {
    for (const sec of row.data?.sections ?? []) {
      if ((sec.name ?? "").trim().toLowerCase() !== sn) continue;
      for (const grp of sec.groups) {
        for (const it of grp.items) {
          if ((it.name ?? "").trim().toLowerCase() !== mn) continue;
          // Find best completed set; fall back to last set with weight/reps.
          const completed = it.sets.filter((s) => s.actual.completed);
          const candidates = completed.length ? completed : it.sets;
          for (let i = candidates.length - 1; i >= 0; i--) {
            const s = candidates[i];
            if (s.actual && (s.actual.weight != null || s.actual.reps != null || s.actual.time != null || s.actual.distance != null)) {
              return s;
            }
          }
        }
      }
    }
  }
  return null;
}

const FILLABLE: Metric[] = ["weight", "reps", "time", "distance"];

/** Mutates `doc` in place; returns it for convenience. */
export function prefillFromHistory(doc: LogDocument, history: HistoryRow[]): LogDocument {
  for (const sec of doc.sections) {
    for (const grp of sec.groups) {
      for (const it of grp.items) {
        const recent = findRecentSet(history, it.name, sec.name);
        if (!recent) continue;
        for (const set of it.sets) {
          // Skip if user already has data, or if fully completed.
          const hasUserData = FILLABLE.some((m) => set.actual[m] != null);
          if (hasUserData) continue;
          let didFill = false;
          for (const m of FILLABLE) {
            if (!it.metrics.includes(m)) continue;
            const v = recent.actual[m];
            if (v == null) continue;
            // Don't override planned numeric reps if planned has it.
            (set.actual as Record<string, unknown>)[m] = v;
            didFill = true;
          }
          if (didFill) set.actual.prefilled = true;
        }
      }
    }
  }
  return doc;
}
