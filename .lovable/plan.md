## Goal

Two related fixes to how plan-day workouts are picked:

1. **Sequential week per day-type** — when starting a plan day (e.g. "Upper A"), the week selected should be `(# of completed logs of that day-type) + 1`, not the calendar week relative to the plan's start date. This handles skipped/flexible scheduling.
2. **Remove day-name tags** from the plan picker, keeping the same vertical spacing so layout doesn't shift.

## Changes

### 1. Sequential week selection (`src/components/AddSessionMenu.tsx`)

- Replace `weekFromDate()` with `nextWeekForDayType(dayName, dayType)`:
  - Query `workout_logs` for current user where `status = 'done'` and `day_key` starts with `${dayName} — ${dayType}` (matches the format Logger writes: `${dayName} — ${planDay.type}`).
  - Return `count + 1`, clamped to `[1, 16]`. If no plan day match, fall back to 1.
- Pre-fetch completed log counts when the dialog opens (one query: `select day_key` filtered by user + status=done) and build a `Map<dayKey, count>` so the picker is instant.
- `pickPlanDay` uses the computed sequential week instead of `weekFromDate()`. The `?date=` param is still passed so the log is dated correctly; only the `week` differs.
- Remove `planStartDate` state and the related fetch field — no longer needed for week math (the plan query stays for `parsed`).

### 2. Logger fallback (`src/pages/Logger.tsx`, line ~141-142)

- When `?week=` is missing and we need a fallback, use the same sequential rule instead of `isoWeekIndexFromStart(planRow.start_date)`. Extract a small helper `nextWeekForDayType(userId, dayKey)` in `src/lib/lastPerformance.ts` (or a new `src/lib/weekPicker.ts`) so both AddSessionMenu and Logger share it.
- `isoWeekIndexFromStart` can stay (still referenced elsewhere) but is no longer the default for new sessions.

### 3. Remove day-name tag in plan picker (`src/components/AddSessionMenu.tsx`)

Inside the `step === "plan"` block, each button currently renders:

```tsx
<div className="font-display text-base ...">{d.type}</div>
<div className="text-[0.6rem] uppercase ... mt-0.5">{d.dayName}</div>
```

- Remove the `{d.dayName}` line but keep the spacing reserved with an empty placeholder of the same height/margin (e.g. `<div className="text-[0.6rem] mt-0.5" aria-hidden>&nbsp;</div>`) so the cards don't visually shrink.

### Out of scope

- `DayPreviewDialog` still shows "Monday · Week N" — the user mentioned the picker, so leaving that header alone unless they call it out.
- Plan editor table layout (`Plan.tsx`) is unchanged.

## Files touched

- `src/components/AddSessionMenu.tsx`
- `src/pages/Logger.tsx`
- `src/lib/weekPicker.ts` (new, small shared helper)
