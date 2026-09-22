-- Existing centers keep their current subscription row, but the free capacity is now 20.
UPDATE center_subscriptions
SET student_limit = 20
WHERE plan = 'free' AND (student_limit IS NULL OR student_limit < 20);

-- New centers are provisioned with this value by complete_signup in schema.sql.
