## Disable pinch-to-zoom on mobile

Update the viewport meta tag in `index.html` so the app fits the device and users can't pinch-zoom.

### Change

In `index.html`, replace:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```
with:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

### Notes

- `user-scalable=no` + `maximum-scale=1.0` disables pinch-to-zoom on iOS (modern Safari) and Android.
- Existing CSS already enforces 16px input font (`src/index.css`), so iOS won't auto-zoom on focus.
- `touch-action: manipulation` is already set on `body`, which also blocks double-tap zoom.
- No other code changes needed — this is purely a presentation/meta change.