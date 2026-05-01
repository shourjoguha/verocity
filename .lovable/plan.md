
## Goal

Make the app feel native on touch devices (phones in PWA mode) by fixing tap targets, gesture conflicts, scroll/zoom quirks, and adding a single config-driven touch system used everywhere.

## Current pain points (verified)

1. **Tap targets too small.** Many controls are `h-3 w-3` / `p-1` / `px-1.5 py-0.5` (chevrons, Replace, Settings2, complete checkbox `h-4 w-4`, rest "go" button, set checkbox, +/- chevrons in StepperInput). Apple/Android guideline = 44px / 48dp. On 393px viewport these are very hard to hit.
2. **Gesture conflicts.** `SetRow` uses Framer Motion `drag="x"` while sitting inside horizontally scrolling tables (`overflow-x-auto`) and inside a vertically scrolling page. No `touchAction` constraint → swipe sometimes scrolls the table or page instead of revealing delete. Same for the timeline scroller and metrics row.
3. **iOS quirks.** Missing `viewport-fit=cover` is set, but app uses no safe-area padding (notch / home indicator overlap the floating selection bar at `bottom-4` and the TopBar). No `-webkit-tap-highlight-color`. No `user-select: none` on chrome → long-press selects text.
4. **Native zoom on inputs.** `StepperInput` uses `text-xs` (~12px) → iOS Safari auto-zooms on focus. Same for the rest seconds input.
5. **300ms / double-tap zoom.** No `touch-action: manipulation` on buttons.
6. **Long-press hook** uses `onTouchStart` without preventing native context-menu / text-selection callouts; no movement cancellation (any small finger drift still fires long-press).
7. **Hover-only affordances.** Section title edit/remove buttons use `opacity-0 group-hover:opacity-100` → invisible & unusable on touch.
8. **Popovers / Sheets** open at desktop widths; some content (rest editor, Settings2 menu) clips on 360–393px screens.
9. **No PWA manifest** so "Add to Home Screen" install is half-broken; status bar color, standalone display, and safe-area behavior aren't declared.

## Solution — config driven

### 1. Extend `src/config/app.config.ts` with a `touch` block

```ts
touch: {
  minTargetPx: 44,         // global min tap target
  inputMinFontPx: 16,      // prevents iOS zoom-on-focus
  longPressMs: 450,
  longPressMoveTolerancePx: 8,
  swipe: {
    revealPx: 96,          // half-reveal distance for swipe-to-delete
    deleteThresholdPx: 160,
    velocityDeletePxPerSec: 800,
  },
  hapticsEnabled: true,    // wired through navigator.vibrate when present
  safeArea: { top: true, bottom: true },
}
```

Anything that currently hard-codes 44/88/long-press/etc. reads from here.

### 2. Global CSS additions (`src/index.css`)

- `html { -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; }`
- `body { user-select: none; -webkit-user-select: none; touch-action: manipulation; overscroll-behavior: none; }`
- Re-enable `user-select: text` on `input, textarea, [contenteditable], .selectable`.
- New utility classes:
  - `.touch-target` — `min-h-[44px] min-w-[44px] inline-flex items-center justify-center` (applied to icon buttons across Logger / Home / TopBar).
  - `.no-zoom-input` — `font-size: 16px` on phones via `@media (max-width: 640px)`; applied to all numeric/text inputs (StepperInput, rest seconds, section rename).
  - `.swipe-row` — `touch-action: pan-y;` so horizontal Framer drag captures cleanly without fighting page scroll.
  - `.h-scroll` — `touch-action: pan-x; overscroll-behavior-x: contain;` for `edge-fade-x` containers (timeline, metric tables).
  - `.safe-top` / `.safe-bottom` — `padding-top/bottom: env(safe-area-inset-*)`.

### 3. PWA install + standalone correctness

- Add `public/manifest.webmanifest` with `name`, `short_name`, `display: standalone`, `theme_color`, `background_color`, `start_url: "/"`, icons (use existing `placeholder.svg` + a generated 192/512 PNG).
- `index.html`: link the manifest, add `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">`, `<meta name="mobile-web-app-capable" content="yes">`, apple-touch-icon link.
- **No service worker** (per project guidance — install-only, not full PWA).

### 4. Component-level fixes (apply utilities, no logic changes)

- **Logger TopBar / SessionTimer / floating selection bar**: wrap with `safe-top` / `safe-bottom`; rebuild action row to wrap and use `.touch-target`.
- **ItemRow header buttons** (`Replace`, `Settings2`, `RestEditor` "go", complete checkbox): swap `p-1` / `h-4 w-4` → `.touch-target` with `h-4 w-4` icon inside.
- **StepperInput**: input gets `.no-zoom-input`; chevrons become 28×28 hit area (still visually small) using `.touch-target` + smaller inner icon. Also add `inputMode="decimal"` and `pattern="[0-9]*\\.?[0-9]*"` for native numeric keypad.
- **SetRow swipe**: add `className="swipe-row"`; replace hard-coded `REVEAL=88`, `DELETE_THRESHOLD=REVEAL*1.8`, `vx<-800` with `appConfig.touch.swipe.*`. On successful reveal/delete, fire `navigator.vibrate?.(10)`.
- **Long-press hook (`useLongPress`)**: read `longPressMs` + `longPressMoveTolerancePx` from config; track `touchmove` and cancel if movement exceeds tolerance; add `event.preventDefault()` only when `triggered.current` to avoid breaking scroll. Add `style={{ WebkitTouchCallout: 'none' }}` via a returned `style` prop or wrap in `.no-callout` utility.
- **SectionTitle**: replace hover-revealed pencil/trash with always-visible `.touch-target` icons at reduced opacity; tap to act.
- **Home progress timeline**: container gets `.h-scroll`; bars get `.touch-target` wrapper while keeping the visible 6×24px bar inside (tap area expands invisibly so peek popovers reliably trigger).
- **Rest "go" / "rest" / preset chips / notation chips**: swap `px-1.5 py-0.5` → use `.touch-target` (square) where they're icon-only, otherwise add `min-h-[36px]` for text chips to stay shootable without bloating.
- **Popover / Sheet content**: cap width at `min(92vw, 360px)` for any popover used inside Logger, so they don't overflow.

### 5. Files to edit

- `src/config/app.config.ts` — add `touch` block.
- `src/index.css` — global rules + utilities.
- `index.html` — manifest link + PWA meta tags.
- `public/manifest.webmanifest` (new), `public/icon-192.png`, `public/icon-512.png` (new, generated).
- `src/hooks/useLongPress.ts` — config-driven, movement tolerance.
- `src/pages/Logger.tsx` — apply `.touch-target` / `.swipe-row` / `.no-zoom-input`, safe-area wrappers, swipe constants from config, SectionTitle visibility.
- `src/pages/Home.tsx` — `.h-scroll` on timeline, `.touch-target` on bars and quick-action grid.
- `src/components/TopBar.tsx` — `.safe-top`.
- `src/pages/Plan.tsx`, `src/pages/Calendar.tsx`, `src/pages/Stats.tsx`, `src/pages/Library.tsx`, `src/pages/ActivityLogger.tsx` — pass over with same utility classes (no logic changes).

## Out of scope

- No service worker / offline cache (per project PWA guidance).
- No layout redesign — only sizing, spacing, gesture handling, and PWA manifest.
- No new Capacitor/native wrapper; this is web-PWA only.

## Acceptance

- Every interactive control has ≥44px hit area on phones.
- Inputs do not trigger iOS zoom on focus.
- Swipe-to-delete on a set never accidentally horizontally scrolls the metric table; vertical scrolling never accidentally triggers swipe.
- Floating selection bar and TopBar respect notch / home indicator.
- App can be installed to home screen and opens standalone with correct theme color.
- All thresholds (tap target size, long-press, swipe distances, haptics) read from `appConfig.touch`.
