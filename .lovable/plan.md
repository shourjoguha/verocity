

## Fix: Plan Progress bars — anchor to logs, not plan dates

### Why it's broken now

`buildTimeline` walks dates from `plan.start_date` → `plan.end_date`. If the plan has `start_date = null` (the network response shows it's missing), the code falls back to `new Date()` (today) as the start, so **all past logs (Apr 18, Apr 19) are never visited** by the cursor and never rendered as solid bars. The recents and Calendar work because they query logs directly without a plan window.

Additionally the timeline reads from `allLogs` which is correctly refetched on realtime/visibility, but the rendering window doesn't include log dates outside `[start..end]`.

### New behavior (per user spec)

A horizontal scrollable strip of day-bars where:

- **Solid colored bar** = a saved log on that date (color from primary tag, same logic as Calendar's `colorForLog`).
- **Hollow colored bar** = future date that matches a planned `PlanDay.dayName`, up through plan end (or +30 days if no plan end).
- **Blank/muted bar** = no log + not planned (rest, gap, off-plan day).
- **Today** marker: subtle outline on the today bar.

**Window**:
- Left edge = the date of the **30th-most-recent completed log** (or earliest log if fewer than 30, or 30 days before today if no logs).
- Right edge = `plan.end_date` if set, else `today + 30 days`.
- This guarantees the last 30 completed logs are always represented, with rest/inactive days as blanks between, and upcoming planned sessions extending to the right.

**Scroll**: auto-scroll on mount so the **most recent completed log** (or today if none) is centered/right-aligned in view. Scroll left reveals older logs, scroll right reveals upcoming planned sessions.

### Implementation (`src/pages/Home.tsx`)

1. **Use `allLogs` as the source of truth** for both completed bars and window calculation. The existing `allLogs` fetch + realtime subscription already update correctly — confirmed by the network log showing both Apr 18 + Apr 19 done.
2. **Rewrite `buildTimeline(plan, logs)`**:
   - Build `logByDate` from all `done`/`in_progress` logs in `allLogs`.
   - Compute window start: take the 30th most-recent completed-log date; fallback to `today - 30d`.
   - Compute window end: `plan.end_date` (if any) else `today + 30d`.
   - Walk every date in `[start..end]`. For each:
     - If a log exists → `state: "done"`, color from `colorForLog(log)` (mirror Calendar's helper exactly).
     - Else if date ≥ today AND matches a `PlanDay.dayName` → `state: "planned"`, color from `dayTypeTag`.
     - Else → `state: "blank"` (muted grey, low opacity).
   - Drop the old `"skipped"` state — past unsaved planned days now just render blank, matching the user's "blanks for inactive days" intent.
3. **Color helper**: extract `colorForLog` to match Calendar so a strength log on Home shows the same hue as on Calendar. Currently Home uses `primaryTagColor(tags)` which only checks tags; align it with Calendar's `tags[0] ?? activity_type ?? "strength"` fallback.
4. **Scroll anchor**: change the `useEffect` from "scroll to today" to "scroll to most-recent-done (or today if none)", right-aligned with ~20% padding so a few upcoming hollow bars peek into view.
5. **Peek popover**: keep current click-to-peek behavior; for done bars show the abbreviated `day_key` second half (e.g. "UppA"); for planned bars show abbreviated plan day type; for blanks show "Rest" or just the date.
6. **Realtime / refresh**: no change needed — `allLogs` is already wired to the realtime channel and visibility/focus refetch.

### Files touched

```
src/pages/Home.tsx   — rewrite buildTimeline window logic, align color helper with Calendar, retarget scroll anchor
```

No DB or config changes. No changes to Calendar or Logger.

