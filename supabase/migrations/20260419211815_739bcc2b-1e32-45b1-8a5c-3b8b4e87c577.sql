
-- App users (friends), no Supabase auth involved
CREATE TABLE public.app_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Movements library (shared + per-user custom)
CREATE TABLE public.movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID REFERENCES public.app_users(id) ON DELETE CASCADE, -- NULL = shared
  name TEXT NOT NULL,
  category TEXT,                         -- e.g. "squat", "hinge", "pull", "push", "accessory", "skill"
  tags TEXT[] NOT NULL DEFAULT '{}',
  default_metrics TEXT[] NOT NULL DEFAULT '{}', -- subset of: weight, reps, rpe, distance, time
  primary_metric TEXT,                   -- one of: weight, reps, rpe, distance, time
  default_rest_seconds INT NOT NULL DEFAULT 90,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_owner ON public.movements(owner_user_id);
CREATE INDEX idx_movements_category ON public.movements(category);

-- Plans
CREATE TABLE public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  source_markdown TEXT,
  parsed JSONB NOT NULL,                 -- { blocks, weeks, days[ {dayName, focus, warmup, exercises[]} ] }
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_plans_owner ON public.plans(owner_user_id);

-- Workout logs
CREATE TABLE public.workout_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  day_key TEXT,                          -- e.g. "Sunday-Lower-A"
  week_number INT,
  status TEXT NOT NULL DEFAULT 'planned',-- planned | in_progress | paused | done | cancelled
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  total_seconds INT,                     -- accumulated active seconds
  notes TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb, -- { groups: [ {kind: 'single'|'superset'|'circuit', restAfter, items: [ {movementId, name, metrics, sets:[ {planned, actual, restAfter, notations} ]} ] } ] }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_owner_date ON public.workout_logs(owner_user_id, log_date DESC);
CREATE INDEX idx_logs_status ON public.workout_logs(status);

-- App settings (global access key)
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  access_key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);

-- Seed default access key hash. Default key = "BARBELL"
-- sha256("BARBELL") = e9f8...; we'll compute via pgcrypto:
INSERT INTO public.app_settings (id, access_key_hash)
VALUES (1, encode(digest('BARBELL','sha256'),'hex'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_movements_updated BEFORE UPDATE ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_logs_updated BEFORE UPDATE ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable RLS
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Trust model (per user request): once past the global access key, friends can read/write everything.
-- UI enforces per-user scoping via owner_user_id. RLS therefore allows broad access for anon/authenticated.
CREATE POLICY "open read app_users" ON public.app_users FOR SELECT USING (true);
CREATE POLICY "open insert app_users" ON public.app_users FOR INSERT WITH CHECK (true);
CREATE POLICY "open update app_users" ON public.app_users FOR UPDATE USING (true);
CREATE POLICY "open delete app_users" ON public.app_users FOR DELETE USING (true);

CREATE POLICY "open read movements" ON public.movements FOR SELECT USING (true);
CREATE POLICY "open insert movements" ON public.movements FOR INSERT WITH CHECK (true);
CREATE POLICY "open update movements" ON public.movements FOR UPDATE USING (true);
CREATE POLICY "open delete movements" ON public.movements FOR DELETE USING (true);

CREATE POLICY "open read plans" ON public.plans FOR SELECT USING (true);
CREATE POLICY "open insert plans" ON public.plans FOR INSERT WITH CHECK (true);
CREATE POLICY "open update plans" ON public.plans FOR UPDATE USING (true);
CREATE POLICY "open delete plans" ON public.plans FOR DELETE USING (true);

CREATE POLICY "open read logs" ON public.workout_logs FOR SELECT USING (true);
CREATE POLICY "open insert logs" ON public.workout_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "open update logs" ON public.workout_logs FOR UPDATE USING (true);
CREATE POLICY "open delete logs" ON public.workout_logs FOR DELETE USING (true);

CREATE POLICY "read settings" ON public.app_settings FOR SELECT USING (true);
-- no insert/update/delete policies on app_settings: locked unless changed via SQL by owner

-- Seed shared movement library
INSERT INTO public.movements (name, category, tags, default_metrics, primary_metric, default_rest_seconds) VALUES
-- Squat-dominant
('Front Squat','squat','{main,squat-dominant}','{weight,reps,rpe}','weight',180),
('Back Squat','squat','{main,squat-dominant}','{weight,reps,rpe}','weight',180),
('Zercher Squat','squat','{main,squat-dominant,caution}','{weight,reps,rpe}','weight',180),
('Step-up','squat','{unilateral}','{weight,reps,rpe}','weight',120),
('Belt Squat','squat','{lower-fatigue-swap}','{weight,reps,rpe}','weight',150),
('Hack Squat','squat','{lower-fatigue-swap,secondary}','{weight,reps,rpe}','weight',120),
('Leg Press','squat','{lower-fatigue-swap}','{weight,reps,rpe}','weight',120),
-- Hinge
('Trap Bar DL','hinge','{main,hinge,caution}','{weight,reps,rpe}','weight',180),
('Deficit Trap Bar DL','hinge','{main,hinge}','{weight,reps,rpe}','weight',180),
('Split-stance RDL','hinge','{unilateral}','{weight,reps,rpe}','weight',120),
('Reduced-range RDL','hinge','{lower-fatigue-swap}','{weight,reps,rpe}','weight',120),
('Hip Thrust Machine','hinge','{accessory}','{weight,reps,rpe}','weight',120),
('Reverse Lunge','squat','{unilateral}','{weight,reps,rpe,/side}','weight',120),
-- Pull
('Pull-ups','pull','{main,vertical-pull}','{reps,rpe}','reps',150),
('Weighted Pull-ups','pull','{main,vertical-pull}','{weight,reps,rpe}','weight',180),
('Lat Pulldown','pull','{lower-fatigue-swap}','{weight,reps,rpe}','weight',90),
('Iso-lateral Row','pull','{main,horizontal-pull}','{weight,reps,rpe,/side}','weight',120),
('DB Row','pull','{horizontal-pull,unilateral}','{weight,reps,rpe,/side}','weight',90),
('Chest-supported Row','pull','{lower-fatigue-swap}','{weight,reps,rpe}','weight',90),
('Cable Row','pull','{lower-fatigue-swap}','{weight,reps,rpe}','weight',90),
('Gorilla Rows','pull','{accessory}','{weight,reps,rpe,/side}','weight',90),
-- Push
('Dips','push','{main,push}','{reps,rpe}','reps',150),
('Weighted Dips','push','{main,push}','{weight,reps,rpe}','weight',180),
('Incline DB Bench','push','{push,secondary}','{weight,reps,rpe}','weight',120),
('Bench Press','push','{main,push}','{weight,reps,rpe}','weight',180),
('Standing Barbell Military Press','push','{push,caution}','{weight,reps,rpe}','weight',150),
('Machine Press','push','{lower-fatigue-swap}','{weight,reps,rpe}','weight',90),
('DB Press','push','{push}','{weight,reps,rpe}','weight',120),
('Landmine Press','push','{push,unilateral}','{weight,reps,rpe,/side}','weight',90),
('Cable Fly/Machine Press','push','{accessory}','{weight,reps,rpe}','weight',90),
-- Accessory lower
('Leg Extension','accessory','{lower}','{weight,reps,rpe}','weight',75),
('Leg Curl','accessory','{lower}','{weight,reps,rpe}','weight',75),
('Nordic Curls','accessory','{lower}','{reps,rpe}','reps',90),
('Sissy Squat','accessory','{lower}','{reps,rpe}','reps',90),
('Tib Raises','accessory','{lower}','{reps}','reps',60),
('Calf Raises','accessory','{lower}','{weight,reps}','reps',60),
-- Trunk / rotation
('Standing Landmine Twists','accessory','{trunk,/side}','{reps,/side}','reps',60),
('Landmine Twist','accessory','{trunk,/side}','{reps,/side}','reps',60),
('Pallof Press','accessory','{trunk,/side}','{reps,/side}','reps',60),
('Medicine Ball Throws','accessory','{trunk}','{reps}','reps',60),
('Med ball slams','accessory','{trunk,finisher}','{reps}','reps',60),
('Hanging knee raise','accessory','{trunk}','{reps}','reps',60),
('Dead bug','accessory','{trunk,/side}','{reps,/side}','reps',45),
('Side plank','accessory','{trunk,/side}','{time,/side}','time',45),
('Plank','accessory','{trunk}','{time}','time',45),
-- Conditioning / finishers
('Sled push','conditioning','{finisher,trips}','{distance}','distance',60),
('Sled drag','conditioning','{finisher,trips}','{distance}','distance',60),
('Farmer carry','conditioning','{finisher,trips}','{weight,distance}','distance',60),
('Battle ropes','conditioning','{finisher}','{time}','time',60),
('Banded hip thrust','accessory','{finisher}','{reps}','reps',45),
('Box jumps','conditioning','{primer,plyo}','{reps}','reps',60),
('KB swing','conditioning','{primer,hinge}','{reps}','reps',45),
-- Upper accessories
('KB Halos','accessory','{upper,/side}','{reps,/side}','reps',45),
('Kettlebell halos','accessory','{upper,/side}','{reps,/side}','reps',45),
('Rotator Cuff Work','accessory','{upper,/side}','{reps,/side}','reps',45),
('Face Pulls','accessory','{upper}','{reps,rpe}','reps',60),
('Band pull-apart','accessory','{upper,finisher}','{reps}','reps',45),
('Thrusters','accessory','{upper}','{weight,reps,rpe}','reps',90),
-- Skill
('Wall handstand hold','skill','{handstand}','{time}','time',60),
('Chest-to-wall hold','skill','{handstand}','{time}','time',60),
('Kick-up practice','skill','{handstand}','{reps}','reps',45),
('Shoulder taps','skill','{handstand,/side}','{reps,/side}','reps',45),
('Pike push-ups','skill','{handstand,push}','{reps}','reps',60),
-- Recovery / mobility
('Zone 2 (row/bike/walk)','recovery','{cardio,zone2}','{time,distance}','time',0),
('Hip mobility flow','recovery','{mobility}','{time}','time',0),
('Adductor work','recovery','{mobility}','{time}','time',0),
('Hip CARs','warmup','{mobility,/side}','{reps,/side}','reps',0),
('Shoulder CARs','warmup','{mobility,/side}','{reps,/side}','reps',0),
('Hamstring sweeps','warmup','{mobility,/side}','{reps,/side}','reps',0),
('Goblet squat hold','warmup','{mobility}','{time}','time',0),
('Band pull-aparts','warmup','{mobility}','{reps}','reps',0),
('Scapular pull-ups','warmup','{mobility}','{reps}','reps',0),
('World''s greatest stretch','warmup','{mobility,/side}','{reps,/side}','reps',0),
('Band dislocates','warmup','{mobility}','{reps}','reps',0),
('Push-up','warmup','{push}','{reps}','reps',0),
('Med ball chest pass','warmup','{push,primer}','{reps}','reps',0),
('Single-leg glute bridge','warmup','{mobility,/side}','{reps,/side}','reps',0);
