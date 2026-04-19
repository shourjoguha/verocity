

## Workout Logger — Plan

A mobile-first, Swiss-minimalist workout logger for you and up to ~20 friends. Single global access key, per-user data, plan-driven sessions parsed from your Markdown.

### Access & users
- Single global access key (entered once, stored locally) gates the whole app.
- Lightweight per-user identity: pick/create a username on first entry. All logs, plans, and custom movements are scoped to that user.
- "Switch user" + "Sign out" available from the home menu.

### Core data model (minimal tables)
1. `users` — id, display_name, created_at
2. `movements` — shared library (seeded from your uploaded library file) + per-user customs (owner_user_id nullable = global). Fields: name, category, tags, default_metrics (weight/reps/rpe/distance/time), default_rest_seconds.
3. `plans` — owner_user_id, name, start_date, end_date, parsed JSON (blocks → weeks → days → exercises with sets/reps/RPE/notations).
4. `workout_logs` — owner_user_id, plan_id (nullable), date, started_at, ended_at, status (planned/in_progress/paused/done/cancelled), notes, structured JSON of groups → movements → sets (with metrics, rest, notation tags).

Per-user scoping enforced via RLS using a simple `current_user_id` context (set after username pick). No auth passwords beyond the global key.

### Central config (single source of truth)
A `src/config/app.config.ts` (TOML-style structure) holds: palette, typography, animation curves, metric definitions, default rest, notation glossary `(p)`, `(t)`, `+5%`, `→`, `/side`, RPE scale, block names, deload rules, timer behavior. Nothing hardcoded in components.

### Plan upload flow
- Upload `.md` (or paste text).
- Strict Markdown parser first (matches your sample's block table + per-day W1..W16 tables).
- On failure, fall back to Lovable AI Gateway (edge function, structured tool-calling) to extract the same shape.
- Review screen: confirm inferred sessions, primary metric per movement (auto-detected: weight+reps+RPE for mains, reps for bodyweight, time for planks/carries, distance/trips for sled), sets, notation tags. Edit then save.

### Views
1. **Home** — today's session card, quick "Start workout", recent sessions, week strip. Persistent back + home buttons everywhere.
2. **Logger** (the heart of the app):
   - Compact accordion sections: Warm-up / Main / Secondary / Finisher.
   - Each movement = a row in a tight table inside the accordion: set #, planned vs actual columns (weight, reps, RPE, distance, time — only the metrics that apply, others hidden).
   - Inline notation chips (`p`, `t`, `+5%`, `/side`) editable via popover.
   - **Long-press** to multi-select movements → group as superset/circuit, or break apart. Selected rows show a floating action bar (stays in place).
   - **Rest timers**: manual-start, configurable per movement. Separate inter-movement rest (inside supersets) and post-set rest. Big readable timer, pause/resume/skip.
   - **Session timer**: start / pause / resume / cancel / restart, with started/ended timestamps saved.
   - Swap movement → opens library picker (search + filter by tag/category) or "Add custom".
   - Smooth horizontal scroll for the set-metric table on narrow screens; vertical scroll for movement list. Subtle animated cues on scroll boundaries.
3. **Calendar** — month view, dot per logged session, color intensity by session length/volume. Tap a day → session summary → open log to edit actuals.
4. **Stats (Essentials)**:
   - Per-movement weight & estimated 1RM trend
   - Weekly total volume per movement category
   - Session count + total time in gym per week
   - Plan adherence: % of planned sets completed
5. **Library** — browse shared library + your customs, edit defaults (primary metric, default rest, tags), add custom movement.

### Style system (Swiss minimal, mobile-tuned)
- Palette: bg `#f2f2f2`, text `#111111`, grays `#bfbfbf` → `#d9d9d9`, `#838282` for secondary text.
- Type: Clash Display (headings, weight 700, tracking -0.05em, leading 0.9), Satoshi (body, 500). Loaded via Fontshare.
- Echo effect on key page headers (4 layered repetitions with offsets).
- 700ms `cubic-bezier(0.77, 0, 0.175, 1)` transitions; grayscale → color hover; subtle 1.05x scale.
- No emojis. No icon clutter. Sharp borders, hairline dividers, tight spacing. Pop-out menus anchored in place (Radix popovers, no auto-close on scroll).
- Compact tables inside accordions; minimal padding; horizontal scroll where needed with animated edge fades.

### Backend
- Lovable Cloud (Supabase) for tables + RLS.
- Edge function `parse-plan` calls Lovable AI Gateway for the fallback parse with structured tool output.
- All AI prompts live server-side.

### Out of scope for v1
- Body metrics / weigh-in tracking
- Multi-device sync conflict resolution beyond last-write-wins
- Social/sharing features

