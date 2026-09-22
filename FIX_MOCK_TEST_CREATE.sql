-- Mock test create 403/400 fix — run in Supabase SQL Editor

ALTER TABLE mock_test_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mock_sec_select ON mock_test_sections;
CREATE POLICY mock_sec_select ON mock_test_sections FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS mock_sec_write ON mock_test_sections;
CREATE POLICY mock_sec_write ON mock_test_sections FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mock_tests t
      WHERE t.id = mock_test_sections.test_id
        AND (is_platform_admin() OR (t.center_id IS NOT NULL AND is_center_member(t.center_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mock_tests t
      WHERE t.id = mock_test_sections.test_id
        AND (is_platform_admin() OR (t.center_id IS NOT NULL AND is_center_member(t.center_id)))
    )
  );

ALTER TABLE mock_questions ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE mock_questions ADD COLUMN IF NOT EXISTS image_path TEXT;

DROP POLICY IF EXISTS mock_q_access ON mock_questions;
CREATE POLICY mock_q_access ON mock_questions FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS mock_q_write ON mock_questions;
CREATE POLICY mock_q_write ON mock_questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mock_tests t
      WHERE t.id = mock_questions.test_id
        AND (is_platform_admin() OR (t.center_id IS NOT NULL AND is_center_member(t.center_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mock_tests t
      WHERE t.id = mock_questions.test_id
        AND (is_platform_admin() OR (t.center_id IS NOT NULL AND is_center_member(t.center_id)))
    )
  );

DROP POLICY IF EXISTS mock_opt_write ON mock_question_options;
CREATE POLICY mock_opt_write ON mock_question_options FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS mock_tests_write ON mock_tests;
CREATE POLICY mock_tests_write ON mock_tests FOR ALL TO authenticated
  USING (is_platform_admin() OR (center_id IS NOT NULL AND is_center_member(center_id)))
  WITH CHECK (is_platform_admin() OR (center_id IS NOT NULL AND is_center_member(center_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON mock_test_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mock_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mock_question_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mock_tests TO authenticated;
