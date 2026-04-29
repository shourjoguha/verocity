## Active workout polish + day-card preview + supersets-from-plan

Five related changes spanning Home, Logger, and a small shared preview component. Each item is scoped to a single concern and one file group.

---

### 1. Tap day card → workout preview popup (no auto-start)

Currently the `DayRail` card just selects the day and shows a meta block with a `Start workout` button. New behavior: the **Start workout** button still navigates to the Logger; tapping the day-card itself opens a **preview dialog** that mirrors the Plan-tab table for that day (warm-up strip + main movements grid).

**Files:**
- `src/components/DayPreviewDialog.tsx` — new component. Uses shadcn `Dialog`. Body reuses the same partition + rendering logic that `DayTable` uses in `src/pages/Plan.tsx` (warm-up strip up top, main exercises in a single compressed table). To avoid duplication, extract `WarmupStrip` and a thin `DayPlanGrid` (read-only, no week-by-week, single column showing the *current week's* planned cell only — Home doesn't have logs context to compute "best actual"). The dialog footer has `Start workout` (same nav as today's button) and `Close`.
- `src/pages/Home.tsx` — `DayRail` card `onClick` opens the dialog (state `previewDay: PlanDay | null`). Keep the existing selected-day meta block. The `Start workout` button inside the meta block still works.
- `src/pages/Plan.tsx` — export `WarmupStrip` (or move it into a small shared file `src/components/plan/WarmupStrip.tsx`) so the dialog can reuse identical visuals.

The dialog grid uses only the current `week` (already computed in `Home`) so it stays compact and fits a phone modal — full week-by-week grid lives on the Plan tab.

---

### 2. Timer auto-starts on session start; auto-stops on Save / Finish

Today the user has to click **Start** in `SessionTimer` to begin the stopwatch. New behavior: the moment a Logger session is created (i.e. user clicked `Start workout` from Home / preview), the stopwatch starts automatically; clicking **Save** or **Finish** stops it.

**File:** `src/pages/Logger.tsx`

- In the new-log branch of the initial `useEffect` (after the doc is built and prefilled, around line 142), also call `startSession()` so `status` flips to `"in_progress"` and the stopwatch begins. Skip auto-start when the user opened an *existing* log (`logId` was already set on mount) and when `isCustomMode` (custom workouts may want the user to opt in — match same auto-start there too for consistency; confirm if you'd rather it stay manual).
- `saveLog()` (line 165) — at the top, call `sw.pause()` so a manual Save also stops the clock. `finishSession()` (line 233) already pauses; no change.
- The `Start` button in `SessionTimer` becomes a no-op for the auto-started case (status is `in_progress` so the button isn't rendered anyway). Restart still resets correctly.

---

### 3. Auto-populate weight / reps / RPE from last performance — already wired, surface it

The infrastructure is already in place (`src/lib/lastPerformance.ts` → `prefillFromHistory`, called on initial Logger load lines 119, 141). The values are stored on `set.actual` with `prefilled: true` and rendered in italic+muted via `StepperInput`. The user's request implies (a) it should also cover **RPE**, and (b) it should re-prefill if the underlying history changes.

**File:** `src/lib/lastPerformance.ts`

- Add `"rpe"` to the `FILLABLE` array (line 47). Currently RPE is excluded because it's not in `Metric` union as a fillable... it actually is `"rpe"` per `Metric` type — just add it to `FILLABLE` so the prefill loop copies it. Skip the `it.metrics.includes(m)` check is already there → RPE only fills when the movement tracks RPE. ✅

That's the only code change. The "update from logs" part is already automatic: the next time the Logger opens, `loadHistory` picks up the most recent done log including any edits the user made. No retroactive backfill into existing in-progress logs (consistent with current behavior — only fresh logs get prefilled).

---

### 4. Logger set-row simplification + elastic swipe-to-delete

Two sub-changes inside `src/pages/Logger.tsx` `SetRow` (lines 1163–1289) and the column header in `ItemRow` (lines 958–988).

**4a. Hide per-set planned/tags column; show tags once near movement name**

- In `ItemRow` header (line 936–956), render `item.sets[0]?.planned?.raw` as a small subtext under/next-to `item.name` (e.g. `<span className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground font-mono">4×10/side R7</span>`). Source: the first set's `planned.raw` plus the union of `set.notations` across all sets (deduped) joined by space — these don't change set-to-set.
- In the table `<thead>` (line 960), remove the `<th>Planned</th>`. In `SetRow`, remove the `<td>` that holds the planned text + tags popover (lines 1218–1243). Drop the matching `<th className="w-8">#</th>` is kept.
- Per-set notation editing is removed from the row. To preserve the ability to add/remove notations occasionally, add a small `tags` button to the movement-options Popover (the `Settings2` menu, lines 947–953) → opens the same notation chip grid currently inside the per-set popover, but applies the toggle to **set 0** (or to all sets — confirm; default: all sets, since they're displayed as movement-level).

Result row becomes: `# | weight | reps | rpe | rest | ✓` — pure data entry.

**4b. Elastic swipe-to-reveal X with friction at threshold**

Current implementation (lines 1174–1206) snaps directly to `-REVEAL` (72px) and only fires `onRemove` when the user re-taps the X. The user wants: (1) elastic feel while dragging, (2) reveal X at threshold with friction for ~0.5s, (3) continuing to drag past it = delete.

Rewrite the swipe logic:

- Track three states: `idle` → `revealed` → `confirmDelete`.
- During drag (`onPointerMove`), apply rubber-band easing once `|delta| > REVEAL`: `dx = -REVEAL - (overshoot * 0.35)` so it visually resists.
- On `onPointerUp`:
  - If `delta > -THRESHOLD` (~30px) → snap back to `0`, state `idle`.
  - If `-REVEAL_FULL < delta <= -THRESHOLD` → snap to `-REVEAL` (72px), state `revealed`. Start a 500ms "friction window" timer where further drag is ignored (gives the elastic settle feel).
  - If `delta <= -REVEAL_FULL` (e.g. ~140px, well past the X) → call `props.onRemove()` immediately.
- During the friction window (500ms after reveal), drag deltas accumulate but don't move the row. After the window expires, additional leftward drag past another `-THRESHOLD` triggers `onRemove`.
- Use `cubic-bezier(0.34, 1.56, 0.64, 1)` (elastic-out) for the snap-back transition to give the bounce.
- Tapping the revealed X still works as a fallback (keeps current behavior).

State held in `useState`: `phase: "idle" | "revealed" | "frictionLocked"` plus existing `dx` and `startX`. Cleanup: clear the friction timeout on unmount and on phase reset.

---

### 5. Add superset from movement-settings menu

Today, supersets are formed via long-press multi-select → bottom action bar. The user wants a one-tap path from the movement's `Settings2` Popover that pops a picker showing **other movements already in the same day's plan** plus an option to add a brand-new one.

**File:** `src/pages/Logger.tsx`

- New menu item in the `ItemRow` `Settings2` Popover (after `Add set`): **Superset with…** (icon: `Group`).
- Clicking it opens a new `<SupersetPicker>` modal listing every other `LogItem` across `doc.sections` (excluding the current item and items already in this group) with their section name as a subtitle. A pinned bottom row says `+ New movement…` which falls through to the existing `LibraryPicker` (set `pickerOpen` to `{ kind: "add", sectionId }` with a follow-up callback).
- On pick of an existing item: call a new mutator `mergeIntoSuperset(currentSection, currentGroup, currentIdx, srcSection, srcGroup, srcIdx)` that:
  1. Removes the source item from its group (and prunes the group if empty), as `removeItem` does.
  2. Locates the target group; if it's currently `"single"`, flip it to `"superset"` and seed `restWithinSeconds` / `restAfterRoundSeconds` from `appConfig.timer.defaults`.
  3. Pushes the source `LogItem` into `targetGroup.items` after the current index.
- On pick of `+ New movement…`: open `LibraryPicker`. On pick, add the movement *into the current group* (similar to `addMovement` but appending to `targetGroup.items` and converting `kind` if needed) — not as a new group.

UI rendering is already correct: an item-group with `kind === "superset"` displays the bordered block with `Within`/`After round` rest editors at the top (lines 866–876). No CSS changes needed.

Cross-section moves are blocked (matches current `groupSelected` rule that throws "Group items within the same section.") — `SupersetPicker` greys out items from other sections with a "different section" tag, or filters them out entirely (default: filter out, since the use case is a same-day plan).

---

### Files touched

```
src/components/DayPreviewDialog.tsx        (NEW)         — issue 1
src/components/plan/WarmupStrip.tsx        (NEW)         — extracted from Plan.tsx for reuse
src/pages/Home.tsx                                       — issue 1: open dialog from card tap
src/pages/Plan.tsx                                       — import WarmupStrip from new location
src/pages/Logger.tsx                                     — issues 2, 4, 5
src/lib/lastPerformance.ts                               — issue 3: add "rpe" to FILLABLE
```

No DB, schema, or config changes.

---

### Open clarifications (will assume defaults if not answered)

1. **Issue 2 / custom workouts** — auto-start the timer for `?mode=custom` too? Default: **yes**, for consistency.
2. **Issue 4a / movement-level notations** — when toggling a notation from the `Settings2` menu, apply it to **all sets** (default) or just set 1?
3. **Issue 5 / cross-section supersets** — filter out items from other sections in the picker (default), or show them disabled?
