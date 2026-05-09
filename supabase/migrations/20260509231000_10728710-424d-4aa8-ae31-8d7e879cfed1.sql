-- Week-from-date helper
CREATE OR REPLACE FUNCTION public.week_for_log(plan_start DATE, log_date DATE)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(1, LEAST(16, FLOOR((log_date - plan_start) / 7)::INT + 1))
$$;

-- Backfill week_number on existing rows
UPDATE public.workout_logs wl
SET week_number = public.week_for_log(p.start_date, wl.log_date)
FROM public.plans p
WHERE wl.plan_id = p.id AND p.start_date IS NOT NULL;

-- Movement substitution memory
CREATE TABLE public.movement_subs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  original_movement_id UUID NOT NULL REFERENCES public.movements(id) ON DELETE CASCADE,
  replacement_movement_id UUID NOT NULL REFERENCES public.movements(id) ON DELETE CASCADE,
  count INT NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, plan_id, day_key, original_movement_id, replacement_movement_id)
);

CREATE INDEX idx_movement_subs_lookup
  ON public.movement_subs(owner_user_id, plan_id, day_key, original_movement_id);

ALTER TABLE public.movement_subs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open read movement_subs" ON public.movement_subs FOR SELECT USING (true);
CREATE POLICY "open insert movement_subs" ON public.movement_subs FOR INSERT WITH CHECK (true);
CREATE POLICY "open update movement_subs" ON public.movement_subs FOR UPDATE USING (true);
CREATE POLICY "open delete movement_subs" ON public.movement_subs FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.bump_movement_sub(
  p_user UUID, p_plan UUID, p_day_key TEXT, p_orig UUID, p_repl UUID
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.movement_subs
    (owner_user_id, plan_id, day_key, original_movement_id, replacement_movement_id, count, last_used_at, dismissed_at)
  VALUES
    (p_user, p_plan, p_day_key, p_orig, p_repl, 1, now(), NULL)
  ON CONFLICT (owner_user_id, plan_id, day_key, original_movement_id, replacement_movement_id)
  DO UPDATE SET
    count = public.movement_subs.count + 1,
    last_used_at = now(),
    dismissed_at = NULL;
END;
$$;