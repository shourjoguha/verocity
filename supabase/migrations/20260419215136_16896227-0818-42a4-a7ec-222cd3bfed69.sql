ALTER TABLE public.workout_logs 
  ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'strength',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_workout_logs_tags ON public.workout_logs USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_workout_logs_activity_type ON public.workout_logs(activity_type);