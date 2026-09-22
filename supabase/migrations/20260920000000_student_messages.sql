-- ============================================================
-- VELIA: O'quvchilarga xabar yuborish tizimi (student_messages)
-- ============================================================

CREATE TABLE IF NOT EXISTS student_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  recipient_email TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'telegram', 'whatsapp', 'email', 'in_app')),
  message_type TEXT NOT NULL DEFAULT 'general' CHECK (message_type IN ('debt_reminder', 'attendance_alert', 'announcement', 'praise', 'general')),
  title TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'queued', 'sent', 'failed')),
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indekslar
CREATE INDEX IF NOT EXISTS idx_student_messages_center ON student_messages(center_id);
CREATE INDEX IF NOT EXISTS idx_student_messages_student ON student_messages(student_id);
CREATE INDEX IF NOT EXISTS idx_student_messages_created ON student_messages(center_id, created_at DESC);

-- Row Level Security (RLS) yoqish
ALTER TABLE student_messages ENABLE ROW LEVEL SECURITY;

-- Markaz a'zolari uchun RLS siyosatlari
CREATE POLICY "Center members can view messages"
  ON student_messages FOR SELECT
  USING (
    center_id IN (
      SELECT center_id FROM center_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Center members can insert messages"
  ON student_messages FOR INSERT
  WITH CHECK (
    center_id IN (
      SELECT center_id FROM center_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Center members can update messages"
  ON student_messages FOR UPDATE
  USING (
    center_id IN (
      SELECT center_id FROM center_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Center members can delete messages"
  ON student_messages FOR DELETE
  USING (
    center_id IN (
      SELECT center_id FROM center_members WHERE user_id = auth.uid()
    )
  );
