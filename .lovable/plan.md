

## Calendar + plan reorder + cancel-delete refinements

Four targeted changes. No schema changes.

### 1. Calendar: color-coded bars, hide cancelled, click-to-add

**Bars**
- Replace the single grayscale opacity bar with **colored bars derived from `tags[]`**, one stacked bar per tag (or the primary tag). Make them ~40% wider and a bit taller (`h-1.5`, full row width minus 2px).
- Color map lives in `appConfig.activityTagColors` (new):
  - `strength` → `#111111` (foreground/black)
  - `conditioning` → `#d97706` (amber)
  - `sport` → `#2563eb` (blue)
  - `mobility` → `#16a34a` (green)
  - `recovery` → `#7c3aed` (violet)
  - fallback → `#737373` (muted)
- Multiple sessions on one day → stacked thin bars (one per log, colored by its dominant tag).
- Drop the "intensity = total time" opacity logic.

**Hide cancelled**
- Filter the Supabase query: `.neq("status", "cancelled")`. Cancelled logs no longer appear as dots/bars or in "This month" list.
- (See #4 below — we're also making cancel a hard delete, so this filter is belt-and-suspenders.)

**Click-to-add (forked menu)**
- Every day cell becomes clickable (even empty ones).
- If the day already has logs, clicking the cell area below the bars still opens the menu; clicking a bar opens the log (existing behavior preserved via separate hit area).
- New `AddSessionMenu` component — a shadcn `Dialog` that walks two steps:
  1. **Plan vs Activity** (two big buttons).
  2. If **Plan** → list of plan days from active plan + a "Custom (blank)" option.
     If **Activity** → grid of tags from `appConfig.activityTags` + "Custom".
- On pick, route to existing flows with a `?date=YYYY-MM-DD` query param:
  - Plan day → `/log/new?day=<key>&week=<n>&date=<ymd>`
  - Custom plan → `/log/new?mode=custom&date=<ymd>`
  - Activity tag → `/log/activity?tag=<tag>&date=<ymd>`
  - Custom activity → `/log/activity?date=<ymd>`
- `Logger.tsx` and `ActivityLogger.tsx` read `?date` and seed the date picker (already present from earlier work).

### 2. Plan editor: drag the session, not the day label

Currently `Plan.tsx` reorders `parsed.days[]` directly, which moves the day label (Mon/Tue/…) along with the session.

- Treat the **day-of-week label as a fixed positional slot**. The draggable payload is the **session** (`PlanDay` minus its `dayOfWeek`/label).
- Implementation: keep `parsed.days[]` ordered by weekday slot (Sun…Sat). Drag-and-drop swaps the **session contents** (everything except the `day` field) between two slots. So dropping "Lower A" from Monday onto Sunday makes Sunday="Lower A" and Monday=whatever Sunday had.
- Empty slots (rest days) become valid drop targets — drop a session there and the source slot becomes empty/rest.

### 3. Plan editor: swap header / subheader

In `Plan.tsx` day card header:
- Currently: bold = day-of-week (`Sunday`), subheader = session name (`Lower A`).
- Switch to: **bold session name** (`Lower A`) as the primary, **muted day-of-week** (`Sunday`) as the subheader below/beside it in `text-muted-foreground text-xs uppercase tracking-[0.12em]`.
- Same change in the Home day-rail chips for consistency.

### 4. Cancel = permanent delete

- In `Logger.tsx`, the existing "Cancel session" confirm currently flips `status='cancelled'`. Change it to:
  - `await supabase.from("workout_logs").delete().eq("id", logId)`
  - Then `nav("/")`.
- Update the confirm dialog copy: "Delete this session? This cannot be undone."
- Remove all "cancelled" rendering paths (Calendar list, Stats, Home recents) since the row no longer exists. The `.neq("status","cancelled")` filter on Calendar stays as a safety net for any historical cancelled rows.
- One-time cleanup query on Calendar load: leave existing cancelled rows alone (user can manually clean later); the filter hides them.

### Files touched

```text
src/config/app.config.ts          + activityTagColors map
src/pages/Calendar.tsx            colored stacked bars, hide cancelled,
                                  cell click → AddSessionMenu
src/components/AddSessionMenu.tsx (new) two-step Dialog: Plan/Activity → pick
src/pages/Plan.tsx                drag swaps session contents (not day label),
                                  reversed header/subheader
src/pages/Home.tsx                day-rail chip header order swap (consistency)
src/pages/Logger.tsx              cancel = supabase delete, updated dialog copy
src/pages/ActivityLogger.tsx      read ?date & ?tag query params
```

### Notes

- No DB migration needed.
- Color tokens are added to config so they remain editable in one place.
- Drag-swap keeps weekday slots stable, which matches the user's mental model (Monday is always Monday).
- `AddSessionMenu` reuses existing routes — no new logging code paths.

