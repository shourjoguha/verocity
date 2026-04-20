

## Fix Plan card header layout

Restructure the `AccordionTrigger` content in `src/pages/Plan.tsx` (lines 278–284) to a two-column layout:

- **Left column** (flex-1, left-aligned): Session name (e.g., "Lower A (Squat-Dominant)")
- **Right column** (shrink-0, right-aligned, stacked vertically): Day of week on top, "Last: W1" chip below

### Changes

1. **Reduce session name font size by ~50%**: `text-xl` (1.25rem) → `text-sm` (0.875rem). Keep `font-display`, `uppercase`, `tracking-[-0.04em]`. With smaller text the name fits on one line cleanly.

2. **Left-align session name**: Wrap in a `flex-1 min-w-0 text-left` container so it never centers and truncates/wraps left-aligned if needed.

3. **Stack metadata top-right**: Replace the inline day + chip with a `flex flex-col items-end gap-1 shrink-0` column:
   - Day of week (existing styling: `text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground`)
   - `Last: W1` chip below it (only when `lastWeek` exists)

4. Keep the drag handle (edit mode) on the far left of the left column.

### Snippet (replaces lines 278–285)

```tsx
<AccordionTrigger className="py-3 hover:no-underline">
  <div className="flex items-start justify-between gap-3 w-full">
    <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
      {editMode && <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />}
      <span className="font-display text-sm uppercase tracking-[-0.04em]">{day.type}</span>
    </div>
    <div className="flex flex-col items-end gap-1 shrink-0">
      <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">{day.dayName}</span>
      {props.lastWeek && <span className="chip">Last: W{props.lastWeek}</span>}
    </div>
  </div>
</AccordionTrigger>
```

### Files touched
```
src/pages/Plan.tsx — AccordionTrigger inner layout (lines 278–285)
```

No other files affected.

