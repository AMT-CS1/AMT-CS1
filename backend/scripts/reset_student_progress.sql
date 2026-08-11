-- Reset ALL homework/checkpoint progress for a single student.
-- Default target: the demo dummy account (username 'student_user').
-- Change the username below to reset a different student.
-- NOTE: the users table has no email column — look up by username.
--
-- Run against the Postgres container, e.g.:
--   docker exec -i amt-postgres psql -U postgres -d postgres < backend/scripts/reset_student_progress.sql
--
-- Everything runs in one transaction so it's all-or-nothing.

BEGIN;

WITH target_user AS (
    SELECT id FROM users WHERE username = 'student_user'
)
-- Deleting attempts cascades to student_misconception_records (attempt_id ON DELETE CASCADE),
-- but we delete the misconception-workflow tables explicitly too for clarity.
, d_mp_attempts AS (
    DELETE FROM student_mp_attempts
    WHERE user_id IN (SELECT id FROM target_user)
)
, d_mp_sessions AS (
    DELETE FROM student_mp_sessions
    WHERE user_id IN (SELECT id FROM target_user)
)
, d_hw_progress AS (
    DELETE FROM student_homework_progress
    WHERE user_id IN (SELECT id FROM target_user)
)
, d_misc_records AS (
    DELETE FROM student_misconception_records
    WHERE user_id IN (SELECT id FROM target_user)
)
, d_summary AS (
    DELETE FROM weekly_class_summary_reports
    WHERE user_id IN (SELECT id FROM target_user)
)
, d_quiz AS (
    DELETE FROM quiz_progress
    WHERE user_id IN (SELECT id FROM target_user)
)
, d_remediation AS (
    DELETE FROM remediation_sessions
    WHERE user_id IN (SELECT id FROM target_user)
)
-- Interaction logs (tab-switch integrity events + click logs). actor stores the
-- user id as text, so cast the uuid to match.
, d_logs AS (
    DELETE FROM interaction_logs
    WHERE actor IN (SELECT id::text FROM target_user)
)
DELETE FROM attempts
WHERE user_id IN (SELECT id FROM target_user);

COMMIT;
