

## Reduce hollow bar border opacity

Trivial styling tweak in `src/pages/Home.tsx` (lines 354–358). For `state === "planned"` bars, apply 50% opacity to the border color while keeping the fill transparent so completed (solid) bars contrast more strongly.

**Change**: Wrap `p.color` in an HSL/RGB color-mix or simply set `borderColor` with reduced alpha. Since `p.color` comes from `appConfig.activity.tagColors` (likely hex/hsl strings), the cleanest approach is using CSS `color-mix`:

```ts
style.borderColor = `color-mix(in srgb, ${p.color} 50%, transparent)`;
```

This preserves the hue per activity tag, just at half opacity. No other bar states change.

### Files touched
```
src/pages/Home.tsx   — planned-state borderColor uses color-mix at 50%
```

