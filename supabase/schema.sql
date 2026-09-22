-- ============================================================
-- VELIA Database Schema (from scratch)
-- PostgreSQL + Supabase
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'uz' CHECK (preferred_language IN ('uz', 'ru', 'en')),
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CENTERS
-- ============================================================
CREATE TABLE centers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_centers_owner ON centers(owner_id);

-- ============================================================
-- CENTER MEMBERS
-- ============================================================
CREATE TABLE center_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'teacher')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(center_id, user_id)
);

CREATE INDEX idx_center_members_center ON center_members(center_id);
CREATE INDEX idx_center_members_user ON center_members(user_id);

-- ============================================================
-- STUDENTS
-- ============================================================
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  birth_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_students_center ON students(center_id);
CREATE INDEX idx_students_status ON students(center_id, status);
CREATE INDEX idx_students_name ON students(center_id, full_name);

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courses_center ON courses(center_id);

-- ============================================================
-- GROUPS
-- ============================================================
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  room TEXT,
  price NUMERIC(12, 2) DEFAULT 0,
  schedule TEXT, -- JSON or free text e.g. "Mon, Wed 18:00"
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_groups_center ON groups(center_id);
CREATE INDEX idx_groups_course ON groups(course_id);
CREATE INDEX idx_groups_teacher ON groups(teacher_id);

-- ============================================================
-- GROUP STUDENTS
-- ============================================================
CREATE TABLE group_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'completed')),
  UNIQUE(group_id, student_id)
);

CREATE INDEX idx_group_students_group ON group_students(group_id);
CREATE INDEX idx_group_students_student ON group_students(student_id);

-- ============================================================
-- ATTENDANCE
-- ============================================================
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, student_id, date)
);

CREATE INDEX idx_attendance_group_date ON attendance(group_id, date);
CREATE INDEX idx_attendance_student ON attendance(student_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_center ON payments(center_id);
CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_payments_date ON payments(center_id, payment_date);

-- ============================================================
-- SUBSCRIPTIONS / PLANS
-- ============================================================
CREATE TABLE center_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_id UUID NOT NULL UNIQUE REFERENCES centers(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'monthly', 'yearly')),
  student_limit INTEGER, -- NULL = unlimited for paid
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER centers_updated_at BEFORE UPDATE ON centers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER groups_updated_at BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER center_subscriptions_updated_at BEFORE UPDATE ON center_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Check if user is member of a center
CREATE OR REPLACE FUNCTION is_center_member(p_center_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM center_members
    WHERE center_id = p_center_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user has role in center
CREATE OR REPLACE FUNCTION has_center_role(p_center_id UUID, p_roles TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM center_members
    WHERE center_id = p_center_id
      AND user_id = auth.uid()
      AND role = ANY(p_roles)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get user's centers
CREATE OR REPLACE FUNCTION get_user_center_ids()
RETURNS SETOF UUID AS $$
  SELECT center_id FROM center_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Count active students for a center (for plan limits)
CREATE OR REPLACE FUNCTION get_active_student_count(p_center_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM students
  WHERE center_id = p_center_id AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_subscriptions ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- CENTERS
CREATE POLICY "Members can view their centers"
  ON centers FOR SELECT
  USING (is_center_member(id));

CREATE POLICY "Owners can update their centers"
  ON centers FOR UPDATE
  USING (has_center_role(id, ARRAY['owner', 'admin']));

CREATE POLICY "Authenticated users can create centers"
  ON centers FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete their centers"
  ON centers FOR DELETE
  USING (has_center_role(id, ARRAY['owner']));

-- CENTER MEMBERS
CREATE POLICY "Members can view center members"
  ON center_members FOR SELECT
  USING (is_center_member(center_id));

CREATE POLICY "Owners/admins can manage members"
  ON center_members FOR ALL
  USING (has_center_role(center_id, ARRAY['owner', 'admin']));

CREATE POLICY "Users can insert themselves as owner on signup"
  ON center_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- STUDENTS
CREATE POLICY "Members can view students"
  ON students FOR SELECT
  USING (is_center_member(center_id));

CREATE POLICY "Admins/teachers can insert students"
  ON students FOR INSERT
  WITH CHECK (has_center_role(center_id, ARRAY['owner', 'admin', 'teacher']));

CREATE POLICY "Admins/teachers can update students"
  ON students FOR UPDATE
  USING (has_center_role(center_id, ARRAY['owner', 'admin', 'teacher']));

CREATE POLICY "Owners/admins can delete students"
  ON students FOR DELETE
  USING (has_center_role(center_id, ARRAY['owner', 'admin']));

-- COURSES
CREATE POLICY "Members can view courses"
  ON courses FOR SELECT
  USING (is_center_member(center_id));

CREATE POLICY "Admins can manage courses"
  ON courses FOR ALL
  USING (has_center_role(center_id, ARRAY['owner', 'admin']));

-- GROUPS
CREATE POLICY "Members can view groups"
  ON groups FOR SELECT
  USING (is_center_member(center_id));

CREATE POLICY "Admins/teachers can manage groups"
  ON groups FOR ALL
  USING (has_center_role(center_id, ARRAY['owner', 'admin', 'teacher']));

-- GROUP STUDENTS
CREATE POLICY "Members can view group students"
  ON group_students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_id AND is_center_member(g.center_id)
    )
  );

CREATE POLICY "Admins/teachers can manage group students"
  ON group_students FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_id AND has_center_role(g.center_id, ARRAY['owner', 'admin', 'teacher'])
    )
  );

-- ATTENDANCE
CREATE POLICY "Members can view attendance"
  ON attendance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_id AND is_center_member(g.center_id)
    )
  );

CREATE POLICY "Admins/teachers can manage attendance"
  ON attendance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_id AND has_center_role(g.center_id, ARRAY['owner', 'admin', 'teacher'])
    )
  );

-- PAYMENTS
CREATE POLICY "Members can view payments"
  ON payments FOR SELECT
  USING (is_center_member(center_id));

CREATE POLICY "Admins can manage payments"
  ON payments FOR ALL
  USING (has_center_role(center_id, ARRAY['owner', 'admin']));

-- CENTER SUBSCRIPTIONS
CREATE POLICY "Members can view subscription"
  ON center_subscriptions FOR SELECT
  USING (is_center_member(center_id));

CREATE POLICY "Owners can manage subscription"
  ON center_subscriptions FOR ALL
  USING (has_center_role(center_id, ARRAY['owner']));

-- ============================================================
-- SIGNUP RPC (safe registration)
-- ============================================================
CREATE OR REPLACE FUNCTION complete_signup(
  p_full_name TEXT,
  p_center_name TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_center_id UUID;
  v_email TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get email from auth
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  -- Create profile
  INSERT INTO profiles (id, full_name, email)
  VALUES (v_user_id, p_full_name, v_email)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- Create center
  INSERT INTO centers (owner_id, name)
  VALUES (v_user_id, p_center_name)
  RETURNING id INTO v_center_id;

  -- Add as owner
  INSERT INTO center_members (center_id, user_id, role)
  VALUES (v_center_id, v_user_id, 'owner');

  -- Free plan
  INSERT INTO center_subscriptions (center_id, plan, student_limit)
  VALUES (v_center_id, 'free', 20);

  RETURN json_build_object(
    'center_id', v_center_id,
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Dashboard stats RPC
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_center_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT is_center_member(p_center_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT json_build_object(
    'total_students', (SELECT COUNT(*) FROM students WHERE center_id = p_center_id),
    'active_students', (SELECT COUNT(*) FROM students WHERE center_id = p_center_id AND status = 'active'),
    'total_groups', (SELECT COUNT(*) FROM groups WHERE center_id = p_center_id AND status = 'active'),
    'today_attendance', (
      SELECT COUNT(*) FROM attendance a
      JOIN groups g ON g.id = a.group_id
      WHERE g.center_id = p_center_id AND a.date = CURRENT_DATE
    ),
    'month_revenue', (
      SELECT COALESCE(SUM(amount), 0) FROM payments
      WHERE center_id = p_center_id
        AND payment_date >= date_trunc('month', CURRENT_DATE)
    ),
    'debtors_count', 0 -- can be calculated later with more complex logic
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
