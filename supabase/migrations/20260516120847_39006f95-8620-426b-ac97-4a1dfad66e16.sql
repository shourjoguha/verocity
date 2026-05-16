
-- Replace auth.uid()-based policies with open policies matching the rest of the app
-- (this app uses an app_users picker, not Supabase auth)
DROP POLICY IF EXISTS rec_owner_select ON public.recommendations;
DROP POLICY IF EXISTS rec_owner_update ON public.recommendations;

CREATE POLICY "open read recommendations"
  ON public.recommendations FOR SELECT
  USING (true);

CREATE POLICY "open insert recommendations"
  ON public.recommendations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "open update recommendations"
  ON public.recommendations FOR UPDATE
  USING (true);

CREATE POLICY "open delete recommendations"
  ON public.recommendations FOR DELETE
  USING (true);
