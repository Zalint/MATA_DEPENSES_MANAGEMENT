-- Quick check for known missing columns
-- Run this to see what's missing in your Render database

-- Check accounts table columns
SELECT 'ACCOUNTS TABLE COLUMNS:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'accounts' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check credit_history table columns  
SELECT 'CREDIT_HISTORY TABLE COLUMNS:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'credit_history' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if specific missing columns exist
SELECT 'MISSING COLUMNS CHECK:' as info;
SELECT 
    'accounts.access_restricted' as column_check,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'access_restricted'
    ) THEN 'EXISTS' ELSE 'MISSING' END as status
UNION ALL
SELECT 
    'accounts.allowed_roles' as column_check,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'allowed_roles'
    ) THEN 'EXISTS' ELSE 'MISSING' END as status
UNION ALL
SELECT 
    'credit_history.created_at' as column_check,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'credit_history' AND column_name = 'created_at'
    ) THEN 'EXISTS' ELSE 'MISSING' END as status
UNION ALL
SELECT 
    'credit_history.credit_date' as column_check,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'credit_history' AND column_name = 'credit_date'
    ) THEN 'EXISTS' ELSE 'MISSING' END as status; 