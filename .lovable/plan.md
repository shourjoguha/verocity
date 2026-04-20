

## Add diagonal cross-hatch texture to blank bars

Bars are only 6px wide × 24px tall, so a real cross-hatch pattern would be invisible. Instead, render a single diagonal stripe pattern using `repeating-linear-gradient` as the bar's background, sized small enough to read at 6px width. Slightly bump opacity from `0.4` → `0.55` so the texture is discernible without competing with done/planned bars.

### Change in `src/pages/Home.tsx` (lines 359–363)

Replace the blank state styling:

```ts
} else {
  // blank (rest / off-plan / past unplanned) — diagonal hatch texture
  style.backgroundImage = `repeating-linear-gradient(
    45deg,
    hsl(var(--muted-foreground) / 0.35) 0,
    hsl(var(--muted-foreground) / 0.35) 1px,
    transparent 1px,
    transparent 3px
  )`;
  style.backgroundColor = "hsl(var(--muted) / 0.25)";
  style.opacity = 0.55;
}
```

This produces fine 45° diagonal lines (1px stroke, 3px gap) over a faint muted fill, mimicking the reference image at the bar's tiny scale. Opacity raised from 0.4 → 0.55 (very slight bump, as requested).

### Files touched

```
src/pages/Home.tsx   — blank-state bars get diagonal-hatch backgroundImage + 0.55 opacity
```

No other states affected. No DB or config changes.

