# Verocity Logger — 9-Feature Enhancement Pass

One feature pass, 5 dependency-ordered phases, each independently revertible. No new dependencies (only what's already installed: React, TS, shadcn, Tailwind, framer-motion, sonner, recharts, Supabase, TanStack Query, Zod, react-hook-form, date-fns, lucide-react). Reuse existing utilities (`useLongPress`, `useConfirm`, `useTimer`, `setRestTimer`, `appConfig`). No DB schema changes; reuse `tags` column and `data` jsonb. Only additive optional fields on existing types. No changes to save/load/realtime logic. Visual identity preserved (monospace numbers, uppercase tracking labels, hairline borders, `bg-surface`, no emoji, no gradients). Every feature degrades gracefully when its data source is missing.

---

## Phase A — Additive UI (lowest risk)

### A1. Set-shape strip on day cards (#2)
**New:** `src/components/SetShapeStrip.tsx`
- Props: `{ data: LogDocument; color: string; height?: number }` (default height 24).
- Walks `data.sections → groups → items → sets`; **skips uncompleted sets**.
- For each remaining set renders a thin vertical bar:
  - **3px wide, 1px gap** between bars.
  - **Height** scaled from `actual.reps` (or `actual.time`/`actual.distance` if reps is null) normalized to the session's max value, with a **20% minimum height** floor.
  - **Opacity** scaled from `actual.rpe`: RPE 6 → 0.4, RPE 10 → 1.0 (linear); default **0.7** when rpe missing.
  - **Background** = the `color` prop (caller passes `colorForLog(log)`).
- CSS only — no animation, no JS measurement.

**Wire:**
- `src/pages/Home.tsx` recent-log rows → render under each row, **24px tall**, color from existing `colorForLog(log)`.
- `src/pages/Calendar.tsx` day cells with `status === "done"` → **replace** existing color bar with `SetShapeStrip`. **Keep** the old color bar for `in_progress` (and any non-done) logs.

### A2. Rep-cliff warning (#4)
`src/pages/Logger.tsx` only. After each set row in the per-movement table render loop:
```
if set[N-1].actual.completed && set[N].actual.completed
   && same weight
   && (set[N-1].actual.reps - set[N].actual.reps) > 2
```
emit a single full-width row directly after set N:
```tsx
<tr><td colSpan={COLS} className="text-muted-foreground text-[0.65rem] uppercase tracking-[0.14em]">
  rep loss {N} — extend rest or stop early?
</td></tr>
```
Read-only, no actions, no dismissal — recomputed every render so it disappears automatically when the user edits.

### A3. Day-of-week consistency heatmap (#5)
`src/pages/Stats.tsx` only. Add a new **"Consistency"** section **between** "Weekly" table and "Top movements." Reuse current Stats data fetch — **no new query**.
- Grid: **7 rows (Mon–Sun) × 8 columns (last 8 ISO weeks, oldest left)**.
- Each cell: `aspect-square`, `1px hairline border`.
- `useMemo` builds `Map<dateISO, total_seconds>` from existing logs (latest log per date wins).
- Bucket each cell's seconds into **5 tiers** using `hsl(var(--foreground))` with opacity classes **20/40/60/80/100**; empty days = no fill.
- Subtitle: `Last 8 weeks · session intensity by weekday`.

---

## Phase B — Config + Stats grouping

### B1. Movement family roll-up (#6)
**Edit `src/config/app.config.ts`:** add a `movementFamilies` map keyed by lowercase family → array of lowercase movement-name patterns:
```ts
movementFamilies: {
  squat:    ["back squat", "front squat", "pause squat", "box squat", "goblet squat"],
  bench:    ["bench press", "pause bench", "close grip bench", "incline bench"],
  deadlift: ["deadlift", "romanian deadlift", "rdl", "deficit deadlift", "trap bar deadlift"],
  press:    ["overhead press", "ohp", "push press", "strict press"],
  row:      ["barbell row", "pendlay row", "chest supported row"],
}
```
Export:
```ts
export function familyOf(name: string): string {
  const n = name.trim().toLowerCase();
  // 1. exact match
  for (const [fam, list] of Object.entries(appConfig.movementFamilies))
    if (list.includes(n)) return fam;
  // 2. suffix containment
  for (const [fam, list] of Object.entries(appConfig.movementFamilies))
    if (list.some(p => n.endsWith(p))) return fam;
  return n;
}
```

**Edit `src/pages/Stats.tsx`:** add a **`By movement | By family`** toggle near the "Top movements" header (default **By family**). When family is on, group `perMovement` entries by `familyOf(it.name)` (merge arrays) **before** sort/slice top 8; card titles show family name capitalized. Brzycki calc and sparkline render unchanged.

---

## Phase C — Logger micro-interactions

### C1. Long-press set number → clone forward (#3)
`src/pages/Logger.tsx` only. The leftmost cell (`<td>{idx + 1}</td>`) becomes long-pressable using existing `useLongPress` (**500ms**). On long-press of a **completed** set:
- Copy `weight`, `reps`, **and the active swappable metric** (whichever of `time`/`distance` is in `item.metrics`) into the **next empty set** of the movement.
- **Skip auto-fill of reps if destination's `planned.reps === "max"`** (AMRAP).
- Mark `actual.prefilled = true` on filled cells (uses existing `setActual` path).
- **Arm rest timer** via existing `setRestTimer(item.restBetweenSetsSeconds)`.
- `navigator.vibrate(15)` haptic.
- **200ms framer-motion scale flash** on the destination row (1 → 1.03 → 1) via a transient `flashRowKey` state.
- Add a faint **`<ChevronDown />`** icon next to the set number on completed sets so the affordance is discoverable (`opacity-30`, `h-3 w-3`).
- The existing **multi-select long-press on the rest of the row stays unchanged** — only the set-number cell triggers clone-forward.

### C2. Vertical weight wheel input (#1)
**New:** `src/components/WeightWheel.tsx`
- Bottom-sheet (reuse shadcn `Drawer`).
- **Increments fixed at 0.5 kg** (do NOT infer plate-aware steps — user uses different equipment). **Range 0–500 kg**.
- `framer-motion` `useMotionValue` + `drag="y"` with **inertia** (`animate(y, snapped, { type: "inertia", power: 0.3 })`) and **snap to 0.5 kg**.
- Selected value sits in a **fixed center "barrel,"** larger and bolder (`font-display text-3xl`), hairline top/bottom borders.
- **Light haptic** `navigator.vibrate(8)` on each step (track last index in a ref).
- Sheet has a **"kbd" toggle** in the header to swap to a numeric input (`<input inputMode="decimal">`) for desktop typing.
- **"Done"** button commits via existing `setActual`.

**Wire `src/pages/Logger.tsx`:** the weight cell becomes a button that opens the wheel for `(sectionId, groupId, itemIndex, setIdx)`; commit → `setActual({ weight })`.

---

## Phase D — Capture features

### D1. Pre-session vibe check (#7)
**Edit `src/lib/types.ts`:** extend `LogDocument` (additive, optional, non-breaking):
```ts
session?: { vibe?: { sleep?: number; energy?: number; soreness?: number } };
```
**New:** `src/components/VibeCheck.tsx`
- One-screen modal. Title **"Vibe check"**, top-right **Skip** text button.
- Three labeled rows: **Sleep, Energy, Soreness**.
- Each row = 4-button picker rendered with **filled/outlined dots** mapping to integer **1–4**.
- **Start** button at bottom, **disabled until at least one row has a value**.
- On Start: store as `data.session.vibe = { sleep, energy, soreness }`.
- On Skip: store nothing, start timer immediately.

**Edit `src/pages/Logger.tsx`:**
- In the initial-load IIFE, on the **fresh-session branch (`logId === null`)**: **pause auto-start of the session timer** and show the modal first.
- **Do NOT show on resumed sessions** (when `logId` exists).
- Use a `hasShownVibe` ref to ensure it appears at most once per fresh session.
- Do not surface in Stats yet (follow-up).

### D2. "Why?" tag on missed/light days (#8)
**New:** `src/components/WhyTagPrompt.tsx`
- Bottom-sheet with a single row of 5 chips: **`sick`, `busy`, `felt off`, `deload`, `other`**, plus a text **skip**.
- **Single-select** (no multi). Tapping a chip resolves with that string; skip resolves with `null`.

**Edit `src/pages/Logger.tsx`:**
- **Cancel path** (`cancelSession`): after the existing confirm approves and **before** delete/navigate, show the prompt.
- **Finish-light path** (`finishSession`): compute `completedSets / plannedSets`; if `< 0.6` AND `plannedSets >= 4`, show **before** navigate.
- Append the chosen chip to the existing `tags` `string[]` (already saved into `workout_logs.tags`); skip appends nothing. Then proceed with the original action.

---

## Phase E — Voice rep entry, iOS-aware (#9)

**New:** `src/hooks/useVoiceInput.ts`
- Wraps Web Speech API: **`webkitSpeechRecognition` with fallback to `SpeechRecognition`**.
- Returns `{ supported, listening, start, stop, transcript, error }`.
- `lang = "en-US"`, `interimResults = false`, `maxAlternatives = 1`. Auto-stops on silence (default behavior).
- **Only render mic UI when `supported === true`** → works on iOS Safari + Safari-installed PWAs; correctly absent on iOS Chrome/Firefox.

**Edit `src/pages/Logger.tsx`:**
- Place a lucide **`Mic`** icon in the **rightmost cell of the active set only** (first non-completed set in each movement; **never on completed sets**).
- Tap → `start()` a single recognition session; icon **pulses** via framer-motion (`animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1 }}`).
- Parse final transcript **case-insensitively**:
  - `(\d+(\.\d+)?)\s*(by|x|×|at)\s*(\d+)` → first number = **weight**, second = **reps** (default to "weight first" — "120 by 5" is natural English).
  - Standalone number on **AMRAP set** (`planned.reps === "max"`) → **reps only**.
- On parse: fill via existing `setActual` with a **200ms framer-motion highlight** on the cells.
- On parse fail: sonner toast `Couldn't catch that — try "120 by 5"`.
- On **permission denied**: sonner toast and **hide the mic for the rest of this session** (session-scoped `voiceDenied` ref).

---

## Files matrix

**New (5):** `src/components/WeightWheel.tsx`, `src/components/SetShapeStrip.tsx`, `src/components/VibeCheck.tsx`, `src/components/WhyTagPrompt.tsx`, `src/hooks/useVoiceInput.ts`.

**Modified (6):** `src/pages/Logger.tsx`, `src/pages/Home.tsx`, `src/pages/Calendar.tsx`, `src/pages/Stats.tsx`, `src/config/app.config.ts`, `src/lib/types.ts`.

---

## Build order (each phase independently testable / revertible)

- **Phase A (additive UI, lowest risk):** A1 set-shape strip · A2 rep-cliff warning · A3 consistency heatmap.
- **Phase B (config + Stats):** B1 family roll-up.
- **Phase C (Logger micro-interactions):** C1 long-press clone-forward · C2 weight wheel.
- **Phase D (capture features):** D1 vibe check · D2 why tag.
- **Phase E (voice, feature-detected):** E1 voice input.

## Cross-cutting constraints (enforced every phase)

- No new dependencies.
- No DB schema changes; reuse `workout_logs.tags` and `workout_logs.data` jsonb.
- Only additive optional fields on existing types (e.g. `LogDocument.session.vibe`).
- No changes to existing save/load/realtime logic — every write goes through current `setActual` / `tags` / save pipeline.
- Visual identity preserved: monospace numbers, uppercase tracking labels, hairline borders, `bg-surface`, no emoji, no gradients.
- Graceful degradation: no e1RM history → wheel still works; no vibe → modal still skippable; no Web Speech → mic icon hidden; no completed sets → strip renders empty.
