

## Compress + visually separate Warm-up in Plan and Logger views

### What "Warm-up" looks like today

Two sources of warm-up content exist in the data model:

1. **`PlanDay.warmup`** — a free-form string parsed from "**Warm-up...:**" lines (e.g. *"5 min row + dynamic stretches"*). **Currently never displayed anywhere.**
2. **Warm-up section** — when the plan table has rows tagged Warm-up/Mobility/Cardio (via `sectionAliases`), they become a `LogSection`/`PlanExercise` block named "Warm-up". Currently rendered identically to Main/Secondary/Finisher (same accordion row weight, same table row height, same font sizes).

The legend already lists Warm-up with a `bg-muted` marker bar, so the marker stays — only the rendering of warm-up content needs to compress.

### Plan view (`src/pages/Plan.tsx`)

Inside `DayTable`, partition `day.exercises` into `warmupExercises` (where the resolved `sectionKey === "Warm-up"`) and `mainExercises` (everything else).

- Render the **main table** as today using `mainExercises` only.
- Above (or below — above reads better) the main table, render a **compressed warm-up strip**: a single horizontal one-liner, not a full week-grid. Format:
  ```
  WARM-UP  ▎ Goblet Squat · Band Pull-Apart · Hip CARs   [+ free-text warmup if present]
  ```
  Styling: `text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground py-2 px-2 border hairline border-dashed`, with the `bg-muted` marker bar on the left to match legend. Movement names separated by `·`. No per-week sets/reps (warm-ups don't progress week-over-week and the user just wants a reminder of what the routine is).
- Append `day.warmup` free-text (if present) as a faint italic suffix on the same strip: `... · 5 min row + dynamic stretches`.
- In edit mode the strip stays read-only (warm-ups aren't progression-tracked); add/remove/rename of warm-up movements still works via the existing main flow if the user adds an exercise tagged Warm-up.

### Logger view (`src/pages/Logger.tsx`)

In the section accordion loop (lines 633–683), detect `section.name === "Warm-up"` and render a **compact variant** instead of the standard AccordionItem:

- **Default collapsed**: remove Warm-up from `defaultValue={doc.sections.map((s) => s.id)}` so it starts closed (main work is what the user opens to).
- **Compressed trigger**: smaller font (`text-xs` instead of `text-xl`), tighter padding (`py-1.5` instead of `py-3`), `bg-muted/30` background, dashed bottom border. Same "X mvts · Y sets" meta on the right.
- **Compressed content** when expanded: render groups in a **stacked single-column list** (movement name + sets inline as `4×8 @ bodyweight`) rather than the full table-with-set-rows used by `GroupBlock`. No per-set rest timers, no long-press selection, no metric headers — warm-ups are bookkeeping, not data capture. A user can still tap a movement to mark it complete (bulk `toggleItemComplete`).
- If `day.warmup` free-text exists for this session, show it as a one-line italic note inside the warm-up section content. (Logger doesn't currently know `day.warmup` — pull it from the active plan during initial load and stash on a new `warmupNote` state.)

### Legend update

Both Plan's `Legend` and any inline section-marker legend already include "Warm-up" with the muted bar — same marker is reused on both the compressed strip (Plan) and the compressed accordion item (Logger), so **no legend copy change is needed**. The marker stays; the rendering of the content under that marker is what differs. (If on inspection the Plan legend reads as "section in the table" rather than "warm-up routine", we'll add a small "(compressed)" qualifier next to the Warm-up legend chip — confirmed on implementation.)

### Files touched

```
src/pages/Plan.tsx     — DayTable: split exercises, add WarmupStrip subcomponent above table
src/pages/Logger.tsx   — accordion loop: branch on "Warm-up", new CompactWarmupSection subcomponent;
                          load + pass day.warmup free-text into the section
```

No DB, schema, parser, or config changes.

