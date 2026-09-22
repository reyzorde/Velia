-- FIX: infinite recursion on students (42P17)
-- Cause: students policy -> parent_links -> students

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_platform_admin FROM profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION is_center_member(p_center_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM center_members
    WHERE center_id = p_center_id AND user_id = auth.uid() AND COALESCE(is_active, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION center_role(p_center_id UUID)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM center_members
  WHERE center_id = p_center_id AND user_id = auth.uid() AND COALESCE(is_active, true) = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_parent_of_student(p_student_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_links WHERE student_id = p_student_id AND parent_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM parent_students WHERE student_id = p_student_id AND parent_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION student_center_id(p_student_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT center_id FROM students WHERE id = p_student_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION teacher_can_see_student(p_student_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_students gs
    JOIN groups g ON g.id = gs.group_id
    WHERE gs.student_id = p_student_id AND g.teacher_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_center_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION center_role(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_parent_of_student(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION student_center_id(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION teacher_can_see_student(UUID) TO authenticated, anon;

DROP POLICY IF EXISTS students_access ON students;
DROP POLICY IF EXISTS students_all ON students;
DROP POLICY IF EXISTS students_parent_email_select ON students;
DROP POLICY IF EXISTS students_select ON students;
DROP POLICY IF EXISTS students_write ON students;

CREATE POLICY students_select ON students FOR SELECT TO authenticated
  USING (
    is_platform_admin()
    OR is_center_member(center_id)
    OR is_parent_of_student(id)
    OR teacher_can_see_student(id)
    OR (email IS NOT NULL AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
  );

CREATE POLICY students_write ON students FOR ALL TO authenticated
  USING (
    is_platform_admin()
    OR center_role(center_id) IN ('owner', 'administrator', 'teacher', 'admin')
    OR is_center_member(center_id)
  )
  WITH CHECK (
    is_platform_admin()
    OR center_role(center_id) IN ('owner', 'administrator', 'teacher', 'admin')
    OR is_center_member(center_id)
  );

DROP POLICY IF EXISTS parent_links_access ON parent_links;
DROP POLICY IF EXISTS parent_links_center ON parent_links;

CREATE POLICY parent_links_access ON parent_links FOR ALL TO authenticated
  USING (
    parent_user_id = auth.uid()
    OR is_platform_admin()
    OR is_center_member(student_center_id(student_id))
  )
  WITH CHECK (
    parent_user_id = auth.uid()
    OR is_platform_admin()
    OR center_role(student_center_id(student_id)) IN ('owner', 'administrator', 'admin')
  );

DROP POLICY IF EXISTS gs_access ON group_students;
DROP POLICY IF EXISTS group_students_access ON group_students;

CREATE POLICY group_students_access ON group_students FOR ALL TO authenticated
  USING (
    is_platform_admin()
    OR is_center_member(student_center_id(student_id))
    OR is_parent_of_student(student_id)
  )
  WITH CHECK (
    is_platform_admin()
    OR is_center_member(student_center_id(student_id))
  );

DROP POLICY IF EXISTS attendance_access ON attendance;
DROP POLICY IF EXISTS attendance_write ON attendance;
DROP POLICY IF EXISTS attendance_select ON attendance;

CREATE POLICY attendance_select ON attendance FOR SELECT TO authenticated
  USING (
    is_platform_admin()
    OR is_parent_of_student(student_id)
    OR EXISTS (SELECT 1 FROM groups g WHERE g.id = attendance.group_id AND is_center_member(g.center_id))
  );

CREATE POLICY attendance_write ON attendance FOR ALL TO authenticated
  USING (
    is_platform_admin()
    OR EXISTS (SELECT 1 FROM groups g WHERE g.id = attendance.group_id AND is_center_member(g.center_id))
  )
  WITH CHECK (
    is_platform_admin()
    OR EXISTS (SELECT 1 FROM groups g WHERE g.id = attendance.group_id AND is_center_member(g.center_id))
  );

NOTIFY pgrst, 'reload schema';
