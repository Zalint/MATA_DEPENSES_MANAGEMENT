-- Fix Render Database Schema
-- Run this script in your Render database to add missing columns

-- Add missing columns to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS access_restricted BOOLEAN DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS allowed_roles TEXT;

-- Add created_at column to credit_history table (rename credit_date to created_at)
-- First, check if created_at exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'credit_history' AND column_name = 'created_at') THEN
        -- If credit_date exists but created_at doesn't, rename it
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'credit_history' AND column_name = 'credit_date') THEN
            ALTER TABLE credit_history RENAME COLUMN credit_date TO created_at;
        ELSE
            -- If neither exists, add created_at
            ALTER TABLE credit_history ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
    END IF;
END $$;

-- Update existing rows to set default values
UPDATE accounts SET access_restricted = false WHERE access_restricted IS NULL;
UPDATE accounts SET allowed_roles = NULL WHERE allowed_roles = '';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_access_restricted ON accounts(access_restricted);
CREATE INDEX IF NOT EXISTS idx_credit_history_created_at ON credit_history(created_at);

-- Verify the changes
SELECT 'accounts table columns:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'accounts' 
ORDER BY ordinal_position;

SELECT 'credit_history table columns:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'credit_history' 
ORDER BY ordinal_position; 