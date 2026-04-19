

## 7-point logger & plan refinements

### 1. Number steppers on focus
Wrap each set-input cell in a small component: when the input is **focused or hovered**, two stacked chevron buttons appear absolutely positioned on the right edge (▲▼). Click increments by metric-specific step (`weight`/`rpe` → 0.5, `reps`/`time`/`distance` → 1; long-press accelerates). Implemented inline in `SetRow` — no new file, ~30 lines.

### 2. Movement-level "complete all" checkbox
Add a checkbox at the right end of the **movement header row** (next to the `Settings2` gear in `ItemRow`). Indeterminate state when partially complete; clicking it sets `actual.completed` on every set in the movement (true if any incomplete, false if all complete). New mutator `toggleItemComplete` in `Logger.tsx`.

### 3. Swipe-left to reveal delete
Replace the current "Remove" via popover with a **swipe-to-reveal delete** on each set row:
- Each `<tr>` becomes wrapped in a `SwipeRow` div: `transform: translateX(-72px)` revealed when user drags left ≥40px, snapping to either 0 or -72px on release.
- Behind the row: a dark suede red (`#6e1f1f`) panel with a white `X` icon, ~72px wide.
- Clicking the X triggers `onRemove`. Tapping the row body snaps it back closed.
- Touch + mouse drag handlers; uses pointer events (no library). Lives as a small component inside `Logger.tsx`.

### 4. "Move to section" in movement filter
In the existing per-movement settings popover (line 788), add a **"Move to…"** entry. Clicking it expands an inline submenu listing all sibling sections in this log (`doc.sections.map(...)`). Picking a section calls a new `moveItem(srcSectionId, groupId, itemIdx, dstSectionId)` mutator that pulls the item out (preserving its sets) and creates a new single-kind group in the destination.

### 5. Auto-suggest "Add set" after marking last set
When the user toggles **complete on the last set** and the movement is **not** marked fully complete via the global checkbox (#2), append a **ghost row** under the table:
- Greyed-out, dashed top border, compressed (~24px tall), text "+ add set" in muted color.
- Clicking it calls existing `addSet`, which becomes a real row.
- Disappears when the next set after it is added, or when #2 marks the movement complete.
- Implemented via a derived `showGhostAdd` flag in `ItemRow`.

### 6. Plan editor
Extend `src/pages/Plan.tsx` with an **Edit mode** toggle (button in the header). When on:
- Each day card gets a drag handle (hamburger icon) → reorder via HTML5 drag-and-drop (`draggable`, `onDragStart/Over/Drop`). Persists to `plans.parsed.days` order.
- Each table row gets edit affordances:
  - Click movement name → inline rename
  - Click any week cell → text input to edit the planned `raw` string (re-parsed via `parsePlannedCell` from `planParser.ts`)
  - Trash icon at row end → remove exercise
  - "+ Add movement" button under each day's table → opens existing `LibraryPicker` and appends a new `PlanExercise` with empty weeks
- All mutations build a new `ParsedPlan` and `UPDATE plans SET parsed = $1` on save (debounced auto-save, same pattern as Logger).

### 7. Auto-fill from last performance (per section)
On Logger load, **after** `buildLogDocument` runs, for every item with a `movementId` (or by name match if no id), query:
```sql
select data from workout_logs
where owner_user_id = $user
  and status = 'done'
  and data::text ilike '%movement-name%'
order by log_date desc
limit 20
```
Then in JS, walk the returned `LogDocument`s to find the **most recent set** of that same movement **inside a section whose name matches the current item's section name** (case-insensitive). Pre-fill `actual.weight` and `actual.reps` (or whichever swappable metric is active) on every set of the new item — but only on sets where `planned` doesn't already specify a value and where actual is empty. Mark these prefilled values visually as muted (italic, lighter color) so the user knows they're suggestions; first edit promotes them to normal.

New helper file: `src/lib/lastPerformance.ts` exporting `prefillFromHistory(doc, history)`.

### Files touched

```text
src/pages/Logger.tsx          steppers (#1), item checkbox (#2), SwipeRow (#3),
                              Move-to submenu (#4), ghost add-set (#5),
                              prefill call on load (#7)
src/pages/Plan.tsx            edit mode, drag-reorder days, inline cell edit,
                              add/remove movement (#6)
src/lib/lastPerformance.ts    new — query + prefill logic (#7)
src/lib/types.ts              add `prefilled?: boolean` flag on LogSetActual
```

### Notes
- All values, steps, and section names stay sourced from `appConfig`.
- No DB schema changes — plan edits write to existing `plans.parsed`, prefill reads existing `workout_logs.data`.
- Swipe gesture works on touch + mouse; doesn't conflict with long-press multi-select (long-press fires on the header row, swipe on set rows).
- Drag-and-drop uses native HTML5 (no new dep).

