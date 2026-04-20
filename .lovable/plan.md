

## Fix: Today marker + solid bars — timezone & most-recent-log logic

### Root cause

`ymd()` uses `d.toISOString().slice(0,10)` which converts to **UTC**. For users west of UTC (e.g. user is presumably in a -hours timezone), `ymd(new Date())` returns **tomorrow's** date string. Result:
- The `isToday` outline lands one bar to the right of the actual "today" column.
- `cursor.getTime() >= today.getTime()` comparison is also skewed — Apr 18/19 logs (local dates) get compared against a today computed in UTC, so they may fall on the "future" side and render as hollow planned bars instead of solid done bars.
- Conversely the log_date strings stored in the DB are local-date strings (e.g. `"2026-04-19"`), so when the cursor walks UTC dates, `logByDate.get(dateStr)` may miss matches.

The Calendar uses a **local** ymd formatter (`d.getFullYear()/getMonth()+1/getDate()`), which is why Calendar shows the bars correctly — Home is the only file with the UTC bug.

Plus: when multiple logs share a date, the current loop keeps the **first** entry seen, which after `order("log_date", desc)` is non-deterministic for tiebreakers — should explicitly keep the **most recently created** log.

### Fix (`src/pages/Home.tsx`)

1. **Replace `ymd(d)`** with local-date formatter matching Calendar:
   ```ts
   function ymd(d: Date) {
     return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
   }
   ```

2. **Most-recent-log per date**: change query in `fetchAll` for `allLogsData` to also order by `created_at desc` after `log_date desc` so when iterating, the first match per date is the most recently saved. Update `buildTimeline` log-indexing loop to reflect "most recent wins" explicitly (current `if (!logByDate.has)` already keeps first — so just ensure ordering puts newest first).

3. **Today bar styling**: keep the `isToday` outline. The fix in (1) makes it land on the correct column. No state-logic change needed — today with no log naturally becomes a hollow `planned` bar (since today's day name will match a `PlanDay`), or a blank if today is a rest day.

4. **Done-state matching**: with corrected `ymd`, Apr 18/19 log_date strings will match the cursor's local-date strings, rendering them as solid black (strength color).

### Files touched

```
src/pages/Home.tsx   — replace ymd() with local formatter; add created_at to query + secondary order
```

No DB or schema changes.

