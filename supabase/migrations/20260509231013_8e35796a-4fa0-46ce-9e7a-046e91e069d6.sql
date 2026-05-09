CREATE OR REPLACE FUNCTION public.week_for_log(plan_start DATE, log_date DATE)
RETURNS INT LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(1, LEAST(16, FLOOR((log_date - plan_start) / 7)::INT + 1))
$$;