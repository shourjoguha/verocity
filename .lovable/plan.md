## Logger: Framer Motion swipe-to-delete + visible Swap icon

Two scoped UI changes inside `src/pages/Logger.tsx`. One new dependency.

---

### 1. Rebuild swipe-to-delete with Framer Motion

Today `SetRow` uses a hand-rolled pointer-event/translateX state machine (`idle | revealed | frictionLocked`) with rubber-band math. The user reports it feels sticky. We'll replace it with a Framer Motion `motion.tr` driven by `drag="x"`, which gives native-feeling momentum, elastic over-drag, and snap animations for free.

**Dependency**
- Add `framer-motion` (`bun add framer-motion`).

**`SetRow` rewrite (`src/pages/Logger.tsx`, lines ~1320–1458)**
- Replace `<tr>` with `motion.tr`.
- Use a single `useMotionValue` `x`, no `phase` state, no manual pointer handlers, no friction timer.
- Drag config:
  ```ts
  drag="x"
  dragConstraints={{ left: -REVEAL, right: 0 }}  // REVEAL = 88
  dragElastic={{ left: 0.35, right: 0 }}         // elastic past reveal, no right pull
  dragMomentum={false}
  ```
- `onDragEnd((_, info) => { ... })` decides the snap based on `info.offset.x`:
  - `offset.x <= -DELETE_THRESHOLD` (-REVEAL * 1.8 ≈ -160) **or** `info.velocity.x < -800` → call `props.onRemove()`. Parent's removal triggers React unmount; the row's `exit` animation handles the slide-up.
  - Else if `offset.x <= -REVEAL_SNAP` (-REVEAL/2 = -44) → `animate(x, -REVEAL, { type: "spring", stiffness: 500, damping: 40 })` (revealed).
  - Else → `animate(x, 0, { type: "spring", stiffness: 500, damping: 40 })` (snap closed).
- "Halfway shows the button": the red action panel is always rendered behind the row (absolute, width = REVEAL, right-aligned). Its visibility is driven by `useTransform(x, [-REVEAL/2, -REVEAL], [0, 1])` opacity, so the Delete button fades in at 50% pull and is fully visible at full reveal. The button stays clickable once `x <= -REVEAL/2`.
- Delete button content: red background + `Trash2` icon + "Delete" label (text only visible at full reveal via the same opacity transform). Clicking it calls `props.onRemove()`.
- Tap-outside / new drag past 0 closes (handled automatically by snap-to-0 logic).

**Slide-up of remaining items on delete**
- Wrap `<tbody>`'s `item.sets.map(...)` in `<AnimatePresence initial={false}>`.
- The `motion.tr` gets `layout`, `initial={false}`, and:
  ```ts
  exit={{ height: 0, opacity: 0, x: -400, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
  ```
- `layout` on each row makes the rows below smoothly slide up to fill the gap (Framer's shared-layout transition).
- Note: animating `<tr>` height inside a `<table>` works in modern browsers; if visual jitter shows up, we'll wrap each row in a `motion.div` inside a single-cell layout — but `<tr>` first since it's a smaller change.

**Remove dead code**
- Delete the `phase`, `frictionTimer`, `REVEAL_THRESHOLD`, `FRICTION_MS`, `animatingRef`, `closeSwipe`, and the manual `onPointerDown/Move/Up` handlers. Constants reduce to `REVEAL`, `REVEAL_SNAP`, `DELETE_THRESHOLD`.

---

### 2. Surface the Swap icon on the movement card

Today swap is buried inside the `Settings2` popover (line 1105). The user wants the Swap action visible directly on the card, to the **left of the rest timer**.

**Change (`src/pages/Logger.tsx`, lines ~1098–1113, the right-side action cluster of the movement header)**

Current order (right side of the card):
```
[Rest timer]  [Settings2 ⚙]  [☐ complete]
```

New order:
```
[⇄ Swap]  [Rest timer]  [Settings2 ⚙]  [☐ complete]
```

- Insert a new icon button just before `<RestEditor>`:
  ```tsx
  <button
    onClick={props.onSwap}
    className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-slow ease-swiss"
    title="Swap movement"
    aria-label="Swap movement"
  >
    <Replace className="h-3.5 w-3.5" />
  </button>
  ```
- Reuse the existing `Replace` lucide icon (already imported, used in the popover).
- Keep the popover's "Swap" entry as-is — it stays as a redundant access point so muscle memory isn't broken, and it groups with other movement actions.

`onSwap` already exists on `MovementCard` props (line 1044) and triggers the `LibraryPicker` flow — no wiring changes required.

---

### Files touched

```
package.json             — add framer-motion
src/pages/Logger.tsx     — SetRow rewrite (Framer drag + AnimatePresence + layout),
                            add Swap icon button left of RestEditor in MovementCard header
```

No DB, schema, routing, or other component changes. No changes to the swipe behavior in any other list (Plan view, Home, etc.) — scoped to the in-workout movement set rows as requested.
