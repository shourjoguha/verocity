/** Sequential week picker: choose week based on count of completed sessions
 *  for a given day-type, not on calendar dates. Lets users skip / shift
 *  workouts without losing their place in the plan progression. */
import { supabase } from "@/integrations/supabase/client";

const MAX_WEEK = 16;

/** day_key format used by Logger: `${dayName} — ${planDay.type}` */
export function makeDayKey(dayName: string, dayType: string) {
  return `${dayName} — ${dayType}`;
}

/** Count completed logs whose day_key matches, return that + 1 (clamped). */
export async function nextWeekForDayKey(userId: string, dayKey: string): Promise<number> {
  const { count } = await supabase
    .from("workout_logs")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId)
    .eq("status", "done")
    .eq("day_key", dayKey);
  const next = (count ?? 0) + 1;
  return Math.max(1, Math.min(MAX_WEEK, next));
}

/** Pre-fetch all completed day_keys for the user and return a count map. */
export async function loadDoneCountsByDayKey(userId: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("workout_logs")
    .select("day_key")
    .eq("owner_user_id", userId)
    .eq("status", "done");
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const k = row.day_key;
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

export function nextWeekFromMap(map: Map<string, number>, dayKey: string): number {
  const next = (map.get(dayKey) ?? 0) + 1;
  return Math.max(1, Math.min(MAX_WEEK, next));
}