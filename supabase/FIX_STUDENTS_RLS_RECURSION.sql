-- ============================================================
-- FIX: infinite recursion on students / attendance (42P17)
-- Error: "infinite recursion detected in policy for relation students"
--
-- Sabab: students policy -> parent_links -> students (RLS) -> ...
-- Yechim: SECURITY DEFINER helperlar (RLS o'tmaydi)
--
-- Supabase SQL Editor da BIR MARTA ishga tushiring.
-- ============================================================

-- 1) Helperlar — SECURITY DEFINER = RLS dan o'tmaydi
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION is_center_member(p_center_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM center_members
    WHERE center_id = p_center_id
      AND user_id = auth.uid()
      AND COALESCE(is_active, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION center_role(p_center_id UUID)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM center_members
  WHERE center_id = p_center_id
    AND user_id = auth.uid()
    AND COALESCE(is_active, true) = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_parent_of_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_links
    WHERE student_id = p_student_id
      AND parent_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM parent_students
    WHERE student_id = p_student_id
      AND parent_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION student_center_id(p_student_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT center_id FROM students WHERE id = p_student_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION teacher_can_see_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_students gs
    JOIN groups g ON g.id = gs.group_id
    WHERE gs.student_id = p_student_id
      AND g.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION can_manage_center_members(p_center_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM center_members
    WHERE center_id = p_center_id
      AND user_id = auth.uid()
      AND role::text IN ('owner', 'administrator', 'admin')
      AND COALESCE(is_active, true) = true
  )
  OR EXISTS (
    SELECT 1 FROM centers WHERE id = p_center_id AND owner_id = auth.uid()
  )
  OR COALESCE((SELECT is_platform_admin FROM profiles WHERE id = auth.uid()), false);
$$;

GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_center_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION center_role(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_parent_of_student(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION student_center_id(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION teacher_can_see_student(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION can_manage_center_members(UUID) TO authenticated, anon;

-- 2) students — barcha eski policylarni olib tashlash
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'students'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON students', r.policyname);
  END LOOP;
END $$;

CREATE POLICY students_select ON students
  FOR SELECT TO authenticated
  USING (
    is_platform_admin()
    OR is_center_member(center_id)
    OR is_parent_of_student(id)
    OR teacher_can_see_student(id)
    OR (
      email IS NOT NULL
      AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );

CREATE POLICY students_insert ON students
  FOR INSERT TO authenticated
  WITH CHECK (
    is_platform_admin()
    OR is_center_member(center_id)
  );

CREATE POLICY students_update ON students
  FOR UPDATE TO authenticated
  USING (
    is_platform_admin()
    OR is_center_member(center_id)
  )
  WITH CHECK (
    is_platform_admin()
    OR is_center_member(center_id)
  );

CREATE POLICY students_delete ON students
  FOR DELETE TO authenticated
  USING (
    is_platform_admin()
    OR center_role(center_id) IN ('owner', 'administrator', 'admin')
  );

-- 3) parent_links
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'parent_links'
  ) THEN
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'parent_links'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON parent_links', r.policyname);
    END LOOP;

    EXECUTE $p$
      CREATE POLICY parent_links_access ON parent_links
        FOR ALL TO authenticated
        USING (
          parent_user_id = auth.uid()
          OR is_platform_admin()
          OR is_center_member(student_center_id(student_id))
        )
        WITH CHECK (
          parent_user_id = auth.uid()
          OR is_platform_admin()
          OR is_center_member(student_center_id(student_id))
        )
    $p$;
  END IF;
END $$;

-- 4) group_students
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'group_students'
  ) THEN
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'group_students'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON group_students', r.policyname);
    END LOOP;

    EXECUTE $p$
      CREATE POLICY group_students_access ON group_students
        FOR ALL TO authenticated
        USING (
          is_platform_admin()
          OR is_center_member(student_center_id(student_id))
          OR is_parent_of_student(student_id)
        )
        WITH CHECK (
          is_platform_admin()
          OR is_center_member(student_center_id(student_id))
        )
    $p$;
  END IF;
END $$;

-- 5) attendance
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance'
  ) THEN
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'attendance'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON attendance', r.policyname);
    END LOOP;

    EXECUTE $p$
      CREATE POLICY attendance_select ON attendance
        FOR SELECT TO authenticated
        USING (
          is_platform_admin()
          OR is_parent_of_student(student_id)
          OR EXISTS (
            SELECT 1 FROM groups g
            WHERE g.id = attendance.group_id
              AND is_center_member(g.center_id)
          )
        )
    $p$;

    EXECUTE $p$
      CREATE POLICY attendance_write ON attendance
        FOR ALL TO authenticated
        USING (
          is_platform_admin()
          OR EXISTS (
            SELECT 1 FROM groups g
            WHERE g.id = attendance.group_id
              AND is_center_member(g.center_id)
          )
        )
        WITH CHECK (
          is_platform_admin()
          OR EXISTS (
            SELECT 1 FROM groups g
            WHERE g.id = attendance.group_id
              AND is_center_member(g.center_id)
          )
        )
    $p$;
  END IF;
END $$;

-- 6) payments / student_payments
DO $$
DECLARE
  r RECORD;
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payments', 'student_payments']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, t);
      END LOOP;

      EXECUTE format($p$
        CREATE POLICY %I ON %I FOR ALL TO authenticated
        USING (
          is_platform_admin()
          OR is_center_member(center_id)
          OR is_parent_of_student(student_id)
        )
        WITH CHECK (
          is_platform_admin()
          OR is_center_member(center_id)
        )
      $p$, t || '_access', t);
    END IF;
  END LOOP;
END $$;

-- 7) center_members — rekursiyasiz
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'center_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON center_members', r.policyname);
  END LOOP;
END $$;

CREATE POLICY center_members_select ON center_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_platform_admin()
    OR can_manage_center_members(center_id)
  );

CREATE POLICY center_members_insert ON center_members
  FOR INSERT TO authenticated
  WITH CHECK (
    is_platform_admin()
    OR can_manage_center_members(center_id)
  );

CREATE POLICY center_members_update ON center_members
  FOR UPDATE TO authenticated
  USING (is_platform_admin() OR can_manage_center_members(center_id))
  WITH CHECK (is_platform_admin() OR can_manage_center_members(center_id));

CREATE POLICY center_members_delete ON center_members
  FOR DELETE TO authenticated
  USING (is_platform_admin() OR can_manage_center_members(center_id));

NOTIFY pgrst, 'reload schema';
