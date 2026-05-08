## Goal

Make every set in a freshly-opened workout auto-populate consistently:
- **reps** + **rpe** ← from the prescription (`set.planned`)
- **weight** ← max weight ever lifted for that movement across all prior `done` logs

Same prefilled values for every set of a movement — no taper across set index.

---

## Changes

### 1. `src/lib/logBuilder.ts`

In `plannedToLogSets(planned, defaultRest)`:
- For each generated `LogSet`, build `actual` inline:
  - If `planned?.reps` is a number → `actual.reps = planned.reps`. If it's `"max"` (AMRAP) or undefined → leave empty.
  - `actual.rpe = planned?.rpe ?? appConfig.rpe.default` (only when the item tracks rpe — checked by caller via `it.metrics.includes("rpe")`; since this lives in the helper, gate by passing the item's metrics in, or do the rpe seeding back in `buildLogDocument` after building sets).
  - If anything was seeded → `actual.prefilled = true`.

Cleanest shape: change `plannedToLogSets` signature to `plannedToLogSets(planned, defaultRest, metrics)` so it knows whether to seed reps/rpe. Both callers already have the metrics list.

Delete `seedRpeDefaults` (now redundant). Update `migrateDocument` to drop the `seedRpeDefaults(it)` call — existing logs are unaffected; we only want fresh seeding on new builds. (Empty rpe on old docs stays empty; that matches today's behavior post-migrate.)

### 2. `src/lib/lastPerformance.ts`

Replace contents with:

- `loadMaxWeightByMovement(userId): Promise<Map<string, number>>`
  - Query `workout_logs` where `owner_user_id = userId` and `status = "done"`, select `data`, `.limit(500)`.
  - Walk every section → group → item → set. For each set with a numeric `actual.weight > 0`, update `max[name.trim().toLowerCase()] = max(prev, weight)`.
  - Return the map.

- `prefillWeightsFromMax(doc, maxByMovement): LogDocument`
  - For each item, look up `maxByMovement.get(it.name.trim().toLowerCase())`.
  - If found, for each set: only set `actual.weight` if it's currently null/undefined; if filled → also set `actual.prefilled = true`.
  - Per-metric guard: presence of seeded `reps`/`rpe` from `plannedToLogSets` does NOT block weight prefill (we only check `actual.weight == null`).

Keep `loadHistory` exported only if something else uses it; otherwise remove. (Quick grep confirms only `Logger.tsx` imports it.) → Remove.

### 3. `src/pages/Logger.tsx`

- Update import: `import { loadMaxWeightByMovement, prefillWeightsFromMax } from "@/lib/lastPerformance";`
- Replace both prefill call sites:
  - Custom mode: `const maxByMov = await loadMaxWeightByMovement(user.id); setDoc(prefillWeightsFromMax(blank, maxByMov));`
  - Plan-driven: same, on `built`.
- In `addMovement`, `addMovementToGroup`, and `swapMovement`: after creating the new item with one empty set, look up max weight for `mov.name` and seed `actual.weight` + `prefilled` on the new set(s). Cleanest: a tiny helper `seedWeightForNewItem(item, maxByMov)`. Cache the map in a ref populated on initial load (and refreshed after `saveLog` finishes if desired — out of scope; initial-load snapshot is fine). Add a `useRef<Map<string, number>>(new Map())` updated alongside the two prefill call sites.

---

## Behavior verification

- Plan-driven session with `4x5 @ rpe7`: every set shows reps=5, rpe=7, weight=max-ever (muted). ✅
- Plan-driven set with `3x max`: reps empty, rpe seeded from planned/default, weight from max. ✅
- Movement with no prior history: weight stays empty, reps/rpe still seeded from plan. ✅
- User types a weight → `prefilled` clears (existing `setActual` already does this). ✅
- Add movement via LibraryPicker mid-session → its single set gets max-weight prefilled. ✅
- Old in-progress logs (already saved) are not mutated; `migrateDocument` no longer re-seeds rpe. ✅

No new dependencies, no schema/RLS changes, no UI changes.
