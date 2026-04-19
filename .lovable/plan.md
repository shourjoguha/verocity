

## Three refinements

### 1. Save-without-start = retroactive log

**Logger.tsx**

- Add a **"Save as done"** button to the SessionTimer when `status === "planned"` (alongside "Start"). Clicking it:
  - Sets `status = "done"`
  - Sets `startedAt = endedAt = log_date at noon` (so it has a sensible timestamp)
  - Leaves `total_seconds` as whatever was logged (likely 0 unless user set per-set times); since this is a retroactive log, that's expected
  - Calls `saveLog(true)` and navigates home
- Wire as `onSaveAsDone` prop on `SessionTimer`.
- This means the user can fill in sets after the workout, hit "Save as done", and skip the timer entirely.
- Bonus: when status is `done`, the **Home progress timeline** already classifies it as "done" → solid color bar. No extra work needed; the existing query (`status in ('done','in_progress')`) will pick it up immediately on next Home visit.

### 2. Plan-progress bar tap-to-peek

**Home.tsx → ProgressTimeline**

- Track `peekIndex: number | null` state.
- Each bar becomes a `<button>` (not a `<div>`); clicking sets `peekIndex = i` (toggle off if same).
- Render a small absolutely-positioned popover above the tapped bar:
  - Width ~auto, padding `px-2 py-1`, `bg-foreground text-background text-[0.6rem] uppercase tracking-[0.12em] font-mono`
  - Content: abbreviation derived from plan day type — `abbrev(type)` helper that strips vowels & lowercase, keeps caps + digits, then truncates to 5 chars (e.g. "Upper A" → "UppA", "Lower B" → "LwrB", "Conditioning" → "Cnd"). Falls back to "Rest" / done log's day_key.
  - Date in even tinier muted line below.
- Outside-click / touch-outside dismisses: attach a `useEffect` that listens to `pointerdown` on `document` and clears `peekIndex` if the target isn't inside the timeline container.
- Pure visual; no navigation on tap (matches "no click handlers" intent but adds peek).

### 3. Plan upload — format hint + adopt from other users

**PlanUpload.tsx**

**a) Format hint inside textarea area**
- Replace the bare `placeholder="Or paste markdown here..."` with: textarea kept, but below it (when textarea is empty) show a small **collapsible "See expected format"** disclosure. Click expands a code block showing a minimal example skeleton:
  ```
  # Plan title
  **Start:** 2026-01-01
  **End:** 2026-04-22
  **Goal:** ...

  ## Block Structure
  | Block | Weeks | ... |

  ## Weekly Template
  | Day | Type | Focus | Conditioning |

  ## 16-Week Progression by Day
  ### MONDAY — Lower A
  | Block | Exercise | W1 | W2 | ... |
  ```
- Built as a `<details><summary>` with hairline border, mono text, neutral colors.

**b) Adopt from other users**
- New section under the format hint: **"Adopt an existing plan"** with a button "Browse plans".
- Clicking opens a shadcn `Dialog` listing all `plans` rows from other users (`.neq("owner_user_id", user.id)`), select fields: `id, name, owner_user_id, parsed, start_date, end_date`. Join display name via existing `app_users` table by owner id.
- List items show: plan name, owner display name, dates, day count. Click a row → expand inline to a **compact preview** (like the existing parsed preview but smaller — a 2-column grid of day cards with just `dayName` + `type` + exercise count; max-height with internal scroll).
- "Adopt this plan" button inside the expanded preview → reads the source plan's `parsed` + `source_markdown`, calls the same `save()` path with the current user as owner, marks as active. Navigates home.
- All inside a single `Dialog` — no new route. Closes on outside click (Radix default).

### Files touched

```text
src/pages/Logger.tsx        + "Save as done" button + handler
src/pages/Home.tsx          ProgressTimeline: clickable bars, peek popover, outside-click
src/pages/PlanUpload.tsx    format hint <details>, Adopt dialog with preview & adopt action
```

No DB changes. RLS already allows reading other users' plans (open read policy on `plans`).

