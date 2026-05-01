## Goal

Replace the cluttered up/down chevron buttons on numeric inputs (weight, reps, RPE, distance, time) inside movement cards with a **touch-to-scrub** interaction: tap-and-hold the number, it gently magnifies, then drag vertically to change the value with low sensitivity. Keyboard input still works on tap (no drag).

All tunables added to `appConfig.touch.scrub` so behavior is config-driven.

## Interaction spec

- **Tap (no drag)** → focuses the input as today; on-screen numeric keypad opens. Value can be typed normally.
- **Press & hold (>120ms)** OR **drag immediately on press** → enters *scrub mode*:
  - The number visually scales to ~1.25×, gains a subtle ring, and the input loses focus (so the keyboard does not appear).
  - Vertical drag changes the value. **Up = increase, Down = decrease.**
  - **Sensitivity: 1 step per ~12px of vertical movement** (configurable). So a 36px drag = 3 steps. Slight wobbles (<12px) do nothing.
  - Step size matches today's logic: `0.5` for weight & RPE, `1` for reps/distance/time.
  - Horizontal movement is ignored. Movement past the configured deadzone (4px) commits to scrub mode and prevents page scroll (`touch-action: none` while scrubbing).
  - Light haptic tick (`navigator.vibrate(5)`) on every step change when `appConfig.touch.hapticsEnabled`.
  - RPE clamps to `[appConfig.rpe.min, appConfig.rpe.max]` (1–10). Weight/reps/distance/time clamp to `>= 0`.
- **Release** → exit scrub mode: number scales back, no keyboard opens, value persists. The chevron up/down buttons are removed entirely.
- **Mouse** (desktop): same drag-to-scrub works with mouse; double-click to focus the input for typing. Wheel is intentionally not bound (avoids accidental edits while scrolling the page).

## Visual

```text
   normal                      scrubbing
   ┌─────┐                     ┌─────────┐
   │ 7.5 │                     │   7.5   │   ← scale 1.25, ring-1 ring-foreground/40
   └─────┘                     └─────────┘
   underline                   underline pulses
```

No chevrons. No layout shift (the magnified number renders via CSS transform, not flow).

## Config additions (`src/config/app.config.ts`)

Append under `touch`:

```ts
scrub: {
  enabled: true,
  pxPerStep: 12,            // vertical pixels per 1 step
  deadzonePx: 4,            // movement before scrub engages
  pressHoldMs: 120,         // hold-to-engage without movement
  magnifyScale: 1.25,
  hapticPerStepMs: 5,
  invertY: false,           // up = increase
}
```

RPE clamp uses existing `appConfig.rpe.min/max`.

## Files to edit

1. **`src/config/app.config.ts`** — add `touch.scrub` block.
2. **`src/pages/Logger.tsx`** — rewrite `StepperInput` (≈lines 1251–1338):
   - Remove `ChevronUp`/`ChevronDown` buttons and the `startRepeat`/`stopRepeat` long-press repeater.
   - Add a new `clamp` prop (`{ min?: number; max?: number }`) so RPE can pass `{min:1,max:10}`. Other metrics pass `{min:0}`.
   - Wrap the `<input>` in a `motion.div` (framer-motion already in the project) that:
     - Captures `onPointerDown` → records start Y, starts a `pressHoldMs` timer.
     - On `onPointerMove`: if `|dy| > deadzonePx` OR hold-timer fired → engage scrub: `input.blur()`, `setPointerCapture`, set `style.touchAction='none'`, scale to `magnifyScale`. Compute `steps = Math.trunc(-dy / pxPerStep)` (negative because screen Y grows downward). On step change, call `adjust(stepsDelta)`; reset reference Y by `stepsDelta * pxPerStep` so further movement is relative.
     - On `onPointerUp`/`onPointerCancel`: release capture, reset transform, clear timers. If never engaged → allow the natural `focus` (tap-to-type).
   - `adjust` clamps to `[clamp.min ?? 0, clamp.max ?? Infinity]` and respects `decimals` from step.
   - Keep existing `inputMode="decimal"`, `no-zoom-input`, prefilled italic styling.
3. **`src/pages/Logger.tsx`** — `StepperInput` call site (~line 1400): pass `clamp={ m === 'rpe' ? { min: appConfig.rpe.min, max: appConfig.rpe.max } : { min: 0 } }`.
4. **`src/index.css`** — add a tiny `.scrubbing` utility:
   ```css
   .scrubbing { touch-action: none; cursor: ns-resize; }
   ```
   (transform/scale handled inline via framer-motion `animate`).

## Edge cases handled

- Two-finger / pinch: ignored — only the first pointer is tracked (`pointerId` recorded on down).
- If user scrolls vertically the page outside the input, no change — scrub only engages once pointer is down on the input.
- Empty value: scrub starts from `0` (matches current `adjust` logic).
- Reduced-motion users: skip the magnify animation (CSS `@media (prefers-reduced-motion)` already zeros transitions globally).
- Accessibility: keep `aria-label` on the input; expose `role="spinbutton"` with `aria-valuemin`/`aria-valuemax`/`aria-valuenow` so screen readers and keyboard arrow keys still adjust the value (Up/Down arrow on focused input → ±step, like the native number input already does).

## Out of scope

- Replacing chevrons elsewhere (e.g., rest seconds editor) — this change is scoped to per-set numeric fields inside movement cards. We can extend to other steppers in a follow-up if you want.
- Changing units, step sizes, or formatting.
