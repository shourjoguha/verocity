

## Fix: "Save as done" not persisting status

### Root cause

In `Logger.tsx`, `saveAsDone()` calls `setStatus("done")` / `setStartedAt` / `setEndedAt`, then schedules `saveLog(true)` via `setTimeout(0)` followed immediately by `nav("/")`. Two problems:

1. **Stale closure** — `saveLog` reads `status`, `startedAt`, `endedAt` from the component's React state at the time the timeout fires. React state updates from `saveAsDone` aren't guaranteed flushed before the timeout callback, so the PATCH body still contains `"status":"planned"` (confirmed in the network log: `PATCH …status:"planned"`).
2. **Nav races the await** — `nav("/")` runs synchronously after scheduling the save, unmounting the component while the PATCH is in flight.

DB confirms the row is still `status=planned`. That's why:
- Calendar bar shows (it includes everything `≠ cancelled`) but the "This month" list label says `planned`.
- Home recents (filters `in (done, in_progress)`) shows nothing.
- Home progress timeline (same filter) shows the slot as planned/skipped instead of solid.

### Fix

Rewrite `saveAsDone` to bypass React state entirely and PATCH with explicit values, then navigate after the await resolves:

```ts
async function saveAsDone() {
  if (!user || !doc) return;
  const noon = new Date(logDate);
  noon.setHours(12, 0, 0, 0);
  const iso = noon.toISOString();
  const payload = {
    owner_user_id: user.id,
    plan_id: planId,
    day_key: dayKey,
    week_number: weekNumber || null,
    status: "done",
    started_at: startedAt ?? iso,
    ended_at: iso,
    total_seconds: accumSec,
    data: doc as never,
    log_date: format(logDate, "yyyy-MM-dd"),
    activity_type: activityType,
    tags,
  };
  if (logId) {
    const { error } = await supabase.from("workout_logs").update(payload).eq("id", logId);
    if (error) { toast.error("Save failed"); return; }
  } else {
    const { data, error } = await supabase.from("workout_logs").insert([payload]).select("id").single();
    if (error || !data) { toast.error("Save failed"); return; }
  }
  // Mirror state so any rendering before nav is consistent
  setStatus("done");
  setStartedAt(payload.started_at);
  setEndedAt(payload.ended_at);
  toast.success("Saved as done");
  nav("/");
}
```

Apply the same pattern (await before nav) to `finishSession` for consistency — currently `finishSession` calls `setStatus("done")` then `void saveLog(true)` without awaiting, suffering the same race when followed by navigation. Make it `async`, await `saveLog`, then nav.

### One-time DB cleanup

The existing log `57005629-...` is stuck at `planned` even though the user's sets are filled in and they tapped "Save as done". After the code fix, future saves work — but this row needs to be flipped to `done` so the user sees it on Home/Recents immediately. Run a one-line migration:

```sql
update public.workout_logs
set status = 'done',
    started_at = coalesce(started_at, (log_date::timestamp + interval '12 hours') at time zone 'UTC'),
    ended_at   = coalesce(ended_at,   (log_date::timestamp + interval '12 hours') at time zone 'UTC')
where id = '57005629-b01d-462c-9cb6-22f226f1a8e3';
```

### Files touched

```
src/pages/Logger.tsx                          — rewrite saveAsDone, await finishSession
supabase/migrations/<new>.sql                 — one-shot fix the stuck row
```

No schema or RLS changes. Realtime subscription on `workout_logs` already added previously will push the corrected status to the open Home tab the moment the migration runs.

