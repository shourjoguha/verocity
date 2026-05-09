/** Date-based week picker: the week_number of any session is a pure function
 *  of the plan's start_date and the session's log_date. Backdating or editing
 *  a log no longer corrupts ordering — historical logs always resolve to the
 *  week they actually belong to. */
import { supabase } from "@/integrations/supabase/client";

const MAX_WEEK = 16;

/** Compute the 1..16 week index for a given log date relative to plan start. */
export function weekForDate(planStartIso: string | null, logDateIso: string): number {
  if (!planStartIso) return 1;
  const start = new Date(planStartIso + "T00:00:00").getTime();
  const log = new Date(logDateIso + "T00:00:00").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(log)) return 1;
  const w = Math.floor((log - start) / 86_400_000 / 7) + 1;
  return Math.max(1, Math.min(MAX_WEEK, w));
}

/** day_key format used by Logger: `${dayName} — ${planDay.type}` */
export function makeDayKey(dayName: string, dayType: string) {
  return `${dayName} — ${dayType}`;
}

/** Fetch the active plan's start_date once for week derivation. */
export async function loadActivePlanStart(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("plans")
    .select("start_date")
    .eq("owner_user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.start_date ?? null;
}

/** Backwards-compatible name used by callers that just pass an ISO date. */
export function nextWeekFromMap(planStartIso: string | null, logDateIso: string): number {
  return weekForDate(planStartIso, logDateIso);
}

/** Backwards-compatible: resolve week for a log_date by reading the active plan. */
export async function nextWeekForDayKey(userId: string, _dayKey: string, logDateIso?: string): Promise<number> {
  const start = await loadActivePlanStart(userId);
  const iso = logDateIso ?? new Date().toISOString().slice(0, 10);
  return weekForDate(start, iso);
}