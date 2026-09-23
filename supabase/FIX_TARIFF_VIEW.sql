-- ============================================================
-- center_subscriptions = VIEW (subscriptions ustida)
-- RLS faqat asosiy jadvalda. Viewga ENABLE ROW SECURITY QILMANG.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_id UUID NOT NULL UNIQUE REFERENCES centers(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'start',
  status TEXT NOT NULL DEFAULT 'active',
  billing_period TEXT NOT NULL DEFAULT 'monthly',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  grace_until TIMESTAMPTZ,
  student_limit_override INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id TEXT DEFAULT 'start';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS student_limit_override INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT 'monthly';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name_uz TEXT NOT NULL DEFAULT '',
  max_students INTEGER DEFAULT 20,
  sort_order INTEGER DEFAULT 0
);
INSERT INTO plans (id, name_uz, max_students, sort_order) VALUES
  ('start', 'Velia Start', 20, 1),
  ('silver', 'Velia Silver', 100, 2),
  ('gold', 'Velia Gold', 1000, 3),
  ('platinum', 'Velia Platinum', 999999, 4)
ON CONFLICT (id) DO UPDATE SET max_students = EXCLUDED.max_students, name_uz = EXCLUDED.name_uz;

CREATE OR REPLACE VIEW center_subscriptions AS
SELECT
  s.id,
  s.center_id,
  s.plan_id AS plan,
  COALESCE(s.student_limit_override, p.max_students, 20) AS student_limit,
  s.started_at,
  s.expires_at,
  s.status AS plan_status,
  s.grace_until,
  s.created_at,
  s.updated_at
FROM subscriptions s
LEFT JOIN plans p ON p.id = s.plan_id;

CREATE OR REPLACE FUNCTION center_subscriptions_instead_of()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO subscriptions (center_id, plan_id, status, student_limit_override, started_at, expires_at, updated_at)
    VALUES (NEW.center_id, COALESCE(NEW.plan, 'start'), 'active', NEW.student_limit, COALESCE(NEW.started_at, now()), NEW.expires_at, now())
    ON CONFLICT (center_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      student_limit_override = EXCLUDED.student_limit_override,
      status = 'active',
      updated_at = now();
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE subscriptions SET
      plan_id = COALESCE(NEW.plan, plan_id),
      student_limit_override = COALESCE(NEW.student_limit, student_limit_override),
      status = 'active',
      expires_at = COALESCE(NEW.expires_at, expires_at),
      updated_at = now()
    WHERE id = OLD.id OR center_id = OLD.center_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM subscriptions WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cs_ins ON center_subscriptions;
DROP TRIGGER IF EXISTS trg_cs_upd ON center_subscriptions;
DROP TRIGGER IF EXISTS trg_cs_del ON center_subscriptions;
CREATE TRIGGER trg_cs_ins INSTEAD OF INSERT ON center_subscriptions FOR EACH ROW EXECUTE FUNCTION center_subscriptions_instead_of();
CREATE TRIGGER trg_cs_upd INSTEAD OF UPDATE ON center_subscriptions FOR EACH ROW EXECUTE FUNCTION center_subscriptions_instead_of();
CREATE TRIGGER trg_cs_del INSTEAD OF DELETE ON center_subscriptions FOR EACH ROW EXECUTE FUNCTION center_subscriptions_instead_of();

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_platform_admin FROM profiles WHERE id = auth.uid()), false);
$$;
CREATE OR REPLACE FUNCTION is_center_member(p_center_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM center_members
    WHERE center_id = p_center_id AND user_id = auth.uid()
      AND COALESCE(is_active, true) = true
  );
$$;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_center_member(UUID) TO authenticated, anon;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='subscriptions'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON subscriptions', r.policyname); END LOOP;
END $$;
CREATE POLICY subs_select ON subscriptions FOR SELECT TO authenticated
  USING (is_platform_admin() OR is_center_member(center_id));
CREATE POLICY subs_write ON subscriptions FOR ALL TO authenticated
  USING (is_platform_admin() OR is_center_member(center_id))
  WITH CHECK (is_platform_admin() OR is_center_member(center_id));

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_read ON plans;
CREATE POLICY plans_read ON plans FOR SELECT TO authenticated USING (true);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', r.policyname); END LOOP;
END $$;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_platform_admin());
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR is_platform_admin());
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_platform_admin())
  WITH CHECK (id = auth.uid() OR is_platform_admin());

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='centers'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON centers', r.policyname); END LOOP;
END $$;
CREATE POLICY centers_select ON centers FOR SELECT TO authenticated
  USING (is_platform_admin() OR is_center_member(id) OR owner_id = auth.uid());
CREATE POLICY centers_write ON centers FOR ALL TO authenticated
  USING (is_platform_admin() OR owner_id = auth.uid())
  WITH CHECK (is_platform_admin() OR owner_id = auth.uid());

INSERT INTO subscriptions (center_id, plan_id, status, student_limit_override)
SELECT c.id, 'start', 'active', 20 FROM centers c
WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.center_id = c.id)
ON CONFLICT (center_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO authenticated;
GRANT SELECT ON center_subscriptions TO authenticated;
GRANT SELECT ON plans TO authenticated;

NOTIFY pgrst, 'reload schema';
