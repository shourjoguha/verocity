# React Query refactor + root ErrorBoundary

Goal: replace ad-hoc `useEffect + useState` Supabase reads with TanStack Query (already installed, unused), centralize keys/fetchers, and add a root ErrorBoundary. No new dependencies, no schema changes.

## 1. Root error boundary

Create `src/components/ErrorBoundary.tsx`:
- Class component, `componentDidCatch` logs to `console.error`.
- State `{ error: Error | null }`, `reset()` clears it.
- Fallback UI uses existing tokens: `bg-surface border hairline`, uppercase `tracking-[0.16em]` muted labels, `font-display` headline, existing `ll-btn` buttons.
- Buttons: "Try again" (calls `reset`) and "Go home" (uses `window.location.assign("/")` — class component, no router hook).
- Shows `error.message` in a `text-xs font-mono` block.

Wrap `<GatedRoutes />` in `src/App.tsx` with `<ErrorBoundary>`.

## 2. QueryClient defaults

In `src/App.tsx`:
```ts
new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } }
})
```

## 3. Centralized hooks: `src/hooks/queries.ts`

Exports:

**Query keys** (`qk`):
- `activePlan(userId)` → `["plan","active",userId]`
- `recentLogs(userId, limit)` → `["logs","recent",userId,limit]`
- `allLogs(userId)` → `["logs","all",userId]`
- `doneLogsForPlan(userId)` → `["logs","done-for-plan",userId]`
- `statsLogs(userId)` → `["logs","stats",userId]`
- `monthLogs(userId, start, end)` → `["logs","month",userId,start,end]`
- `movements(ownerId)` → `["movements",ownerId]`
- `adoptablePlans(userId)` → `["plans","adoptable",userId]`

**Types**: `ActivePlanRow`, `LogRow`, `LogRowWithData`, `PlanLogRow`, `CalendarLogRow`, `AdoptablePlan`, `MovementRow` — derived from existing page-local shapes (no `as unknown as`; rely on generated `Database` types + narrow projections).

**Hooks**: each `useQuery` with `enabled: !!userId`, throws on `error`, applies `.limit(500)` on otherwise unbounded queries.
- `useActivePlan` — `plans` where `is_active=true`, `maybeSingle`.
- `useRecentLogs(userId, limit=5)` — order by `log_date desc`, `.limit(limit)`.
- `useAllUserLogs` — minimal columns, `.limit(500)`.
- `useDoneLogsForPlan` — `status=done`, columns needed by Plan, `.limit(500)`.
- `useStatsLogs` — same projection Stats uses today, `.limit(500)`.
- `useMonthLogs(userId, start, end)` — `gte/lte log_date`, `.limit(500)`.
- `useMovements(ownerId)` — `.limit(500)`.
- `useAdoptablePlans(userId, { enabled })` — two-step: fetch other users' plans, then `app_users` for `display_name`, merge into `AdoptablePlan[]`.

## 4. Page migrations

Replace local `useEffect`/`useState` reads + drop `as unknown as ...` casts:

- **Stats.tsx** → `useStatsLogs`; show inline `text-destructive` text when `isError`.
- **Calendar.tsx** → `useMonthLogs`; group by `log_date` in `useMemo`; inline error text.
- **Home.tsx** → `useActivePlan` + `useRecentLogs` + `useAllUserLogs`. Remove `visibilitychange`/`focus` listeners (React Query handles via `refetchOnWindowFocus`). Keep the realtime channel; on event, call `queryClient.invalidateQueries({ queryKey: qk.recentLogs(...) })` and `qk.allLogs(...)`. Combined error → single inline banner.
- **Plan.tsx** → `useActivePlan` + `useDoneLogsForPlan`. Load-once hydration: a `useEffect` copies server data into local `plan` state only while `planDbId == null`, so focus refetches don't overwrite unsaved auto-save edits. Add error fallback view.
- **LibraryPicker.tsx** → `useMovements`; on `createCustom` failure `toast.error`; on success `queryClient.invalidateQueries({ queryKey: qk.movements(ownerId) })`; inline error banner on read failure.
- **AddSessionMenu.tsx** → `useActivePlan` (shares cache with Home/Plan); add `.catch` on `loadDoneCountsByDayKey`.
- **PlanUpload.tsx** → `useAdoptablePlans(user?.id, { enabled: adoptOpen })`. After successful `save()` and successful `adoptPlan()`, invalidate `qk.activePlan(user.id)`. Show error state inside adopt dialog.

## 5. Imperative paths (kept as-is, hardened)

- **Logger.tsx**: wrap initial-load IIFE in `try/catch` + `toast.error`. After `saveLog` success and after `cancelSession` delete, `queryClient.invalidateQueries({ queryKey: ["logs"] })` (matches all log keys).
- **ActivityLogger.tsx**: after successful insert in `save()`, invalidate `["logs"]`.

## Technical notes

- All hooks share the same `QueryClient` from `App.tsx` via `QueryClientProvider` (already mounted).
- "Throw on error" = inside `queryFn`: `if (error) throw error;` so React Query surfaces `isError` and the ErrorBoundary catches render-time throws.
- `["logs"]` prefix invalidation works because every log key starts with `"logs"`.
- No changes to `src/integrations/supabase/client.ts` or `src/integrations/supabase/types.ts`.
- No new packages; `@tanstack/react-query` is already in `package.json`.

## Out of scope

- Mutations are not converted to `useMutation` (only invalidations added).
- No RLS / schema / auth changes.
- No design token additions; reuses existing `hairline`, `ll-btn`, `bg-surface`, `text-muted-foreground`, `text-destructive`.
