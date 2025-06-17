-- =====================================================
-- IDENTIFY MISSING TABLES AND VIEWS
-- =====================================================
-- This script will help identify what tables and views
-- are missing from database_schema.sql
-- =====================================================

-- 1. LIST ALL TABLES (You have 9, schema expects 6)
SELECT '=== ALL TABLES IN YOUR DATABASE ===' as section;
SELECT 
    tablename,
    tableowner,
    'Table' as object_type
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. EXPECTED TABLES IN SCHEMA FILE
SELECT '=== EXPECTED TABLES IN SCHEMA FILE ===' as section;
SELECT unnest(ARRAY[
    'users',
    'accounts', 
    'expenses',
    'credit_history',
    'partner_deliveries',
    'partner_directors'
]) as expected_table;

-- 3. FIND EXTRA TABLES (not in schema file)
SELECT '=== EXTRA TABLES (need to add to schema) ===' as section;
SELECT tablename as missing_table
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename NOT IN (
    'users', 'accounts', 'expenses', 
    'credit_history', 'partner_deliveries', 'partner_directors'
)
ORDER BY tablename;

-- 4. LIST ALL VIEWS (You have 1, schema expects 2)
SELECT '=== ALL VIEWS IN YOUR DATABASE ===' as section;
SELECT 
    viewname,
    viewowner
FROM pg_views 
WHERE schemaname = 'public'
ORDER BY viewname;

-- 5. EXPECTED VIEWS IN SCHEMA FILE
SELECT '=== EXPECTED VIEWS IN SCHEMA FILE ===' as section;
SELECT unnest(ARRAY[
    'expense_summary',
    'account_balances'
]) as expected_view;

-- 6. CHECK IF EXPECTED VIEWS EXIST
SELECT '=== VIEW EXISTENCE CHECK ===' as section;
SELECT 
    'expense_summary' as view_name,
    CASE WHEN EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'expense_summary')
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
    'account_balances' as view_name,
    CASE WHEN EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'account_balances')
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- 7. GET STRUCTURE OF EXTRA TABLES
SELECT '=== STRUCTURE OF EXTRA TABLES ===' as section;
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' 
AND t.table_name NOT IN (
    'users', 'accounts', 'expenses', 
    'credit_history', 'partner_deliveries', 'partner_directors'
)
ORDER BY t.table_name, c.ordinal_position;

-- 8. SHOW EXISTING VIEW DEFINITION
SELECT '=== EXISTING VIEW DEFINITION ===' as section;
SELECT 
    viewname,
    definition
FROM pg_views 
WHERE schemaname = 'public'
ORDER BY viewname; 