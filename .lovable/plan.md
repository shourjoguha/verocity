

## Home page: recent list cleanup + plan-progress bar chart

### 1. Recent list refinements (`src/pages/Home.tsx`, lines 102–125)
- **Filter out** `planned` and `cancelled` rows from the query; show only `done` (and `in_progress` if present).
- **Limit** to 5 (already 7 — change to 5).
- **Layout**: replace the `flex justify-between` row with a left-aligned stack:
  - Left color bar (3px wide, full row height) using `appConfig.activity.tagColors[primaryTag]` to indicate session type.
  - Column 1 (left-aligned, `flex-1 min-w-0`): bold session name `{day_key ?? "Session"}` on top, `[n] days ago` below in muted xs.
  - Column 2 (right, fixed): duration in mono.
  - Drop the status chip entirely. Drop tag chips (color bar replaces them).
- Helper `daysAgo(iso)` → `"Today" | "Yesterday" | "N days ago"`.
- Use `truncate` + `min-w-0` to prevent overlap on narrow widths.

### 2. New plan-progress bar chart (above the day-rail section, ~line 86)
A horizontal scrollable timeline of every day in the active plan, one thin bar per day:

- **Data window**: from `plan.start_date` to `plan.end_date` (or +16 weeks fallback). For each date in range, classify:
  - **Solid colored** — a `done` log exists → color by primary tag (`appConfig.activity.tagColors`).
  - **Hollow colored** (border only) — date is `today`..`today+10`, scheduled in plan (matches a `PlanDay.dayName`), no log → "planned".
  - **Greyed solid** — past date, scheduled but no log saved (skipped) OR rest day OR not on plan.
  - For dates beyond `today+10`: still render hollow if scheduled, grey if rest, so user can scroll the full plan.
- **Bars**: `w-1.5 h-6` (~6px), `gap-0.5`, rounded-none. Today gets a 1px foreground top/bottom accent or small dot above to mark position.
- **Container**: horizontally scrollable (`overflow-x-auto edge-fade-x`), auto-scrolls so today is centered on mount. No labels, no axis text. Subtle border-bottom hairline only.
- **No click handlers** (purely visual indicator).

Helper logic added inline in `Home.tsx`:
```
buildTimeline(plan, logs) → Array<{date, state: 'done'|'planned'|'rest'|'skipped', color}>
```
where `state` drives fill style and `color` comes from log tag or plan day type via `appConfig.activity.dayTypeTag`.

### Files touched

```
src/pages/Home.tsx   — query filter, recent list rewrite, new ProgressTimeline component
```

No config or schema changes. All colors sourced from existing `appConfig.activity.tagColors`.

