## Home/Logger/Stats refinements

Four independent changes across `Home.tsx`, `logBuilder.ts`, `Stats.tsx` and a new dialog component.

---

### 1. Section-based default rest

Today every set defaults to `appConfig.timer.defaults.betweenSetsSeconds` (90s). We'll drive it off the section name.

**Changes**
- `src/config/app.config.ts` — extend `timer.defaults` with a new `bySection` map:
  ```ts
  bySection: { "Main": 120, "Secondary": 90, "Warm-up": 30, "Finisher": 60 }
  ```
- `src/lib/logBuilder.ts` — in `buildLogDocument`, look up rest by resolved `sectionKey` (fallback to `betweenSetsSeconds`). Pass that value into `plannedToLogSets`, `restBetweenSetsSeconds`, and `restAfterRoundSeconds`.
- Library `default_rest_seconds` (per-movement) still wins when the user swaps/adds a movement via the picker — that path already overrides via `mov.default_rest_seconds`. Section default is only the initial seed for plan-built logs.

Note: user asked for Main 2:00 and Secondary 1:30 — using 120 / 90.

---

### 2. Hover/click peek label on progress bars

`ProgressTimeline` already has a click-to-peek popover (`peekIndex`) showing the abbreviated label and date. The user wants the **full** session name (e.g. "Upper A", "Lower A") and it should also appear on hover.

**Changes** (`src/pages/Home.tsx`, ~lines 285–399)
- In `buildTimeline`, store a `fullLabel` field on each `TimelinePoint`:
  - For done logs: parse `log.day_key` → use the part after `—` (the type), unabbreviated.
  - For planned days: use `planDay.type` directly.
  - For blanks: "Rest".
- In the bar `<button>`, add `onMouseEnter`/`onMouseLeave` handlers that set `peekIndex` (in addition to the existing click toggle). Add `title={p.fullLabel}` as a fallback.
- Replace the `{p.label}` line in the peek popover with `{p.fullLabel}` so it reads "Upper A" instead of "UprA".

---

### 3. Move Stats summary onto Home; sharper 1RM

**On Home (`src/pages/Home.tsx`)**
- Below the Recent section (and above the quick-actions grid), add a new `<section>` titled "Stats".
- Compute inline from `allLogs` (already loaded):
  - Sessions count
  - Total time (sum `total_seconds`)
  - All-time best e1RM per movement (top 5 by recency)
- Remove the **Stats** card from the quick-actions grid (the `nav("/stats")` button at lines 209–212).

**1RM formula change (`src/pages/Stats.tsx` and Home)**
- Replace Epley with **Brzycki** for stronger high-rep estimates and apply it to **all-time max** per movement, not last entry:
  ```ts
  // Brzycki: weight * 36 / (37 - reps), valid for reps < 37
  function brzycki(w: number, r: number) {
    return r >= 37 ? w * (1 + r / 30) : (w * 36) / (37 - r);
  }
  ```
  Brzycki yields ~5–8% higher estimates than Epley at moderate reps (8–12), matching the "more aggressive" ask.
- Per-movement 1RM = `max(brzycki(weight, reps))` across **every** completed set in `workout_logs`, not just the latest.
- Update `Stats.tsx` to use `brzycki` and label the column "1RM (Brzycki)".

---

### 4. Combine Blank workout + Activity into a single "Log" card

`AddSessionMenu` already implements the exact two-step picker (Plan/Activity → details). We'll reuse it.

**Changes (`src/pages/Home.tsx`)**
- Add state `const [logMenuOpen, setLogMenuOpen] = useState(false);`.
- In the quick-actions grid, **remove** the "Blank workout" and "Activity" buttons. Replace with a single `Log` card:
  ```tsx
  <button onClick={() => setLogMenuOpen(true)} className="border hairline p-4 ...">
    <div className="text-[0.6rem] uppercase ...">New</div>
    <div className="font-display text-lg mt-1">Log</div>
  </button>
  ```
- **Move** the quick-actions grid so it renders **above** the Recent section (currently below). Resize: change container to a tighter `grid-cols-3 sm:grid-cols-5 gap-2` so cards are smaller, since one slot was removed.
- Render `<AddSessionMenu open={logMenuOpen} onClose={() => setLogMenuOpen(false)} date={ymd(today)} />`.

Final Home order:
```
Today headline
Plan progress timeline
Pick a day / DayRail
Quick actions (Log, Plan, Calendar, Movements, Upload)   ← moved up, resized
Recent
Stats summary                                             ← new
```

---

### Files touched

```
src/config/app.config.ts        — add timer.defaults.bySection
src/lib/logBuilder.ts           — section-based rest seeding
src/pages/Home.tsx              — peek fullLabel + hover, combined Log card,
                                  reorder sections, inline Stats summary,
                                  remove Stats quick-action
src/pages/Stats.tsx             — Brzycki formula, all-time max 1RM
```

No DB, schema, or routing changes.
