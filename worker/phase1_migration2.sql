-- ============================================================
-- NutriMentor AI — phase1_migration2.sql
-- Run: wrangler d1 execute nutrimentor-db --file=phase1_migration2.sql --remote
--
-- Fixes:
-- 1. health_note facts stored with fact_key='condition' (old schema)
--    → split into separate rows using fact_value as fact_key
-- 2. Remove bad 'like' preference entries that are lifestyle notes
-- 3. Remove duplicate 'condition' key conflicts
-- ============================================================

-- Fix old health_notes where fact_key='condition' and fact_value has the condition name
-- Convert: (fact_key='condition', fact_value='diabetes') 
-- To:      (fact_key='diabetes', fact_value='true')
INSERT OR IGNORE INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
SELECT profile_id, fact_type, fact_value, 'true', source, updated_at
FROM user_facts
WHERE fact_type = 'health_note' AND fact_key = 'condition';

-- Remove the old-style rows after migrating them
DELETE FROM user_facts WHERE fact_type = 'health_note' AND fact_key = 'condition';

-- Remove lifestyle facts stored as preferences (e.g. "to swim on sundays")
DELETE FROM user_facts 
WHERE fact_type = 'preference' 
AND fact_key LIKE 'to %';

-- Remove any junk preference entries longer than 30 chars (likely sentences, not food names)
DELETE FROM user_facts
WHERE fact_type IN ('preference', 'dislike')
AND LENGTH(fact_key) > 30;

-- Clean up empty or single-char keys
DELETE FROM user_facts WHERE LENGTH(TRIM(fact_key)) <= 1;
