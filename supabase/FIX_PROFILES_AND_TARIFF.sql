-- ============================================================
-- FIX: profiles 406 + admin 403 + tarif markazda ko'rinmasligi
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'uz';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS center_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_id UUID NOT NULL UNIQUE REFERENCES centers(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'start',
  student_limit INTEGER DEFAULT 20,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE center_subscriptions ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'start';
ALTER TABLE center_subscriptions ADD COLUMN IF NOT EXISTS student_limit INTEGER DEFAULT 20;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_platform_admin FROM profiles WHERE id = auth.uid()), false);
$$;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, anon;

CREATE OR REPLACE FUNCTION is_center_member(p_center_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM center_members
    WHERE center_id = p_center_id AND user_id = auth.uid()
      AND COALESCE(is_active, true) = true
  );
$$;
GRANT EXECUTE ON FUNCTION is_center_member(UUID) TO authenticated, anon;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', r.policyname); END LOOP;
END $$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_platform_admin());
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR is_platform_admin());
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_platform_admin())
  WITH CHECK (id = auth.uid() OR is_platform_admin());

ALTER TABLE center_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='center_subscriptions'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON center_subscriptions', r.policyname); END LOOP;
END $$;

CREATE POLICY cs_select ON center_subscriptions FOR SELECT TO authenticated
  USING (is_platform_admin() OR is_center_member(center_id));
CREATE POLICY cs_write ON center_subscriptions FOR ALL TO authenticated
  USING (is_platform_admin() OR is_center_member(center_id))
  WITH CHECK (is_platform_admin() OR is_center_member(center_id));

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='centers'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON centers', r.policyname); END LOOP;
END $$;

CREATE POLICY centers_select ON centers FOR SELECT TO authenticated
  USING (is_platform_admin() OR is_center_member(id) OR owner_id = auth.uid());
CREATE POLICY centers_write ON centers FOR ALL TO authenticated
  USING (is_platform_admin() OR owner_id = auth.uid())
  WITH CHECK (is_platform_admin() OR owner_id = auth.uid());

DO $$ BEGIN
  CREATE POLICY students_admin_select ON students FOR SELECT TO authenticated
    USING (is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO center_subscriptions (center_id, plan, student_limit)
SELECT c.id, 'start', 20
FROM centers c
WHERE NOT EXISTS (SELECT 1 FROM center_subscriptions cs WHERE cs.center_id = c.id)
ON CONFLICT (center_id) DO NOTHING;

DO $$ BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    UPDATE center_subscriptions cs
    SET plan = COALESCE(s.plan_id, cs.plan),
        student_limit = COALESCE(s.student_limit_override, cs.student_limit),
        updated_at = now()
    FROM subscriptions s
    WHERE s.center_id = cs.center_id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
