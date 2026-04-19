

## Logger & dashboard refinements

Seven targeted changes across Logger, Home, and the data layer. No new tables — extend `workout_logs` with two columns and adapt the existing `data` JSON shape; the metrics already live inside that JSON.

### 1. Date picker on save
Add a date control in the Logger header next to Week. Defaults to today. Uses shadcn `Popover` + existing `Calendar` component (`src/components/ui/calendar.tsx`). Selected date drives `log_date` on save (overriding the current "derive from startedAt" line). Visible at all times before finishing.

### 2. In-app confirm dialogs (no `window.confirm`)
Replace both `confirm(...)` calls in `Logger.tsx` (cancel session, restart timer) with shadcn `AlertDialog`. Same Swiss styling as the rest of the app — black border, hairline, no rounded pills. Add a small `useConfirm()` hook so we can reuse it for "Remove movement" and "Remove set" too.

### 3. Swappable metric columns + always-on weight + meters/seconds
- **Config update** (`src/config/app.config.ts`): change unit labels — `distance: "m"`, `time: "s"`, drop "trips" everywhere user-facing. Add a `swappableMetrics: ["reps","time","distance"]` group.
- **LogItem shape**: ensure `metrics` always contains `"weight"`. `buildLogDocument` and `addMovement` enforce this; existing logs are migrated on load (one-line normalizer).
- **Set storage** already keys by metric (`actual.weight`, `actual.reps`, …) so type+value is preserved — no DB schema change to the JSON shape needed beyond making sure each set carries the metric keys it uses.
- **Swap UI**: column header in `SetRow`'s table becomes a popover button. Clicking the `REPS` / `TIME` / `DIST` header opens a 3-option chooser. Switching a column rewrites that movement's `metrics` array (replaces the old swappable metric with the new one) and clears stale values for the replaced metric across that movement's sets. Weight column is fixed and not swappable.
- **Planned cell**: when the planned notation implies seconds ("3x20s") or trips/m, the column auto-picks the correct swappable metric on build.

### 4. Plan overview view (compressed table per day)
New route `/plan` and a "Plan" tile on Home. Renders one collapsible table per `PlanDay` (Lower 1, Upper 1, …):
- **Frozen first column** = movement name (sticky via `position: sticky; left: 0` inside an `overflow-x-auto` wrapper, with edge fade).
- **No section column**: section is shown via a small left-edge accent bar + tooltip (Warm-up = light gray, Main = solid black bar, Secondary = mid-gray, Finisher = dashed). Defined in config under `blocks.sectionMarkers`.
- **Columns** = W1…W16 with the planned `raw` string in each cell.
- **Last completed week**: query the user's most recent `done` log, find its `week_number` for that day; that column is highlighted and shows actuals (best set: weight × reps) instead of planned. Other weeks remain compressed.
- Accordion per day, collapsed by default; tap to expand.

### 5. Scrollable session selector on Home
Replace the single "today's session" card with a horizontal, snap-scrolling rail of all 7 plan days (condensed chips: day name + type). The chip matching today is auto-active. Tapping any chip expands it inline (smooth height transition) showing exercise count, last completion date, and a "Start workout" button. Out-of-sequence selection just routes to `/log/new?day=…&week=…` like today, so no Logger change required.

### 6. Custom workout logger (define your own sections)
On `/log/new` add a "Blank workout" entry path. New flow:
- Logger accepts `?mode=custom`. `buildLogDocument` gets a sibling `buildBlankDocument()` returning an empty `LogDocument`.
- Section list is editable: an "Add section" button at the bottom (input for name, e.g. "Main", "Finisher", "Skill"). Sections can be renamed (click title) and removed (popover). Section names are no longer constrained to the 4 hardcoded ones — `appConfig.blocks.sections` becomes only a default seed.
- Add-movement flow inside each section already exists.

### 7. Custom activity logging + activity tags
- **Config**: add `activityTags: ["sport","recovery","mobility","strength","conditioning"]`.
- **Schema migration**: `ALTER TABLE workout_logs ADD COLUMN activity_type text DEFAULT 'strength'` and `ADD COLUMN tags text[] DEFAULT '{}'`. (Two columns, no new tables.)
- **Activity Logger**: a lightweight variant of Logger at `/log/activity`. Just a single form: title, tag picker (chips), date (uses #1 picker), duration (start/stop or manual minutes), notes. Saved to `workout_logs` with `data: {}`, `activity_type` set, `tags` populated.
- **Auto-tag normal sessions**: when saving a plan-driven session, infer a tag from the day type ("Conditioning"/"Recovery" → conditioning; everything else → strength). Stored in `tags`.
- Calendar/Stats read `tags` to color-code.

### Files touched

```text
src/config/app.config.ts          metric units, swappable group, section markers, activity tags
src/lib/types.ts                  LogDocument: allow free-form section names; LogItem ensure weight
src/lib/logBuilder.ts             enforce weight metric; new buildBlankDocument()
src/pages/Logger.tsx              date picker, AlertDialog confirms, swappable headers,
                                  custom-section editing, mode=custom path
src/pages/Home.tsx                horizontal scrollable day rail, "Plan" tile, "Blank workout"
                                  + "Activity" entry points
src/pages/Plan.tsx        (new)   compressed plan table view (4)
src/pages/ActivityLogger.tsx (new) custom activity form (7)
src/components/ConfirmDialog.tsx (new)  reusable AlertDialog wrapper + useConfirm()
src/App.tsx                       routes: /plan, /log/activity
supabase migration                add activity_type + tags columns to workout_logs
```

### Notes / risks

- Existing logs load fine: weight column is added on read if missing; metric values are untouched.
- The frozen-first-column trick works in Tailwind via `sticky left-0 bg-background z-10` on the `<th>`/`<td>` and `overflow-x-auto` on the wrapper. Already used elsewhere in shadcn table.
- All choices stay config-driven — section names, activity tags, swappable metrics, section markers all live in `appConfig`.

