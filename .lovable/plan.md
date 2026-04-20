

## Plan

### Issue 1 — EchoHeadline indentation
Add `padding-left: 0.16em` to `.echo-headline` in `src/index.css` to compensate for the leftmost echo layer offset. Headlines on Plan, Home, Library, Logger, etc. will visually align with their `px-4` container content.

### Issue 2 — Strip day-of-week from session names
Mirror the **exact same logic** already used by the "Pick a day" rail. That section displays `PlanDay.type` (e.g., "Lower A (Squat-Dominant)") — the part **after** the `—` in `day_key`. The codebase already does this split inline in `Home.tsx:107` and `Plan.tsx:72` (`day_key.split("—")[0]` for the day-name half, `[1]` for the type half — see Home.tsx:286 which already uses `[1]` for the timeline label).

**Add helper** in `src/lib/utils.ts` consistent with that pattern:
```ts
export function sessionTypeFromDayKey(dayKey: string | null): string {
  if (!dayKey) return "Session";
  const parts = dayKey.split("—");
  return (parts[1] ?? parts[0]).trim() || "Session";
}
```

**Apply to display sites** (replace `l.day_key ?? "Session"`):
- `src/pages/Home.tsx:173` — Recent list item title
- `src/pages/Calendar.tsx:106, 107, 126` — bar `aria-label`/`title` + this-month list title

`Logger.tsx` is **not** changed — it edits/uses the full `day_key` value internally. Storage format unchanged so `lastByDay` indexing (which splits on `—`[0]) keeps working.

### Files touched
```
src/index.css           — .echo-headline padding-left: 0.16em
src/lib/utils.ts        — add sessionTypeFromDayKey() helper
src/pages/Home.tsx      — Recent list uses helper
src/pages/Calendar.tsx  — bar labels + month list use helper
```

