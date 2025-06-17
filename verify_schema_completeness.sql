-- =====================================================
-- SCHEMA COMPLETENESS VERIFICATION SCRIPT
-- =====================================================
-- Run this script on your LOCAL database to verify if
-- database_schema.sql is missing any tables, columns, 
-- indexes, functions, or other database objects
-- =====================================================

-- 1. LIST ALL TABLES
SELECT '=== TABLES ===' as section;
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. LIST ALL COLUMNS FOR EACH TABLE
SELECT '=== TABLE COLUMNS ===' as section;
SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 3. LIST ALL CONSTRAINTS (PRIMARY KEYS, FOREIGN KEYS, CHECK CONSTRAINTS)
SELECT '=== CONSTRAINTS ===' as section;
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition,
    conrelid::regclass as table_name
FROM pg_constraint 
WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY conrelid::regclass, contype;

-- 4. LIST ALL INDEXES
SELECT '=== INDEXES ===' as section;
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 5. LIST ALL SEQUENCES
SELECT '=== SEQUENCES ===' as section;
SELECT 
    schemaname,
    sequencename,
    start_value,
    min_value,
    max_value,
    increment_by
FROM pg_sequences 
WHERE schemaname = 'public'
ORDER BY sequencename;

-- 6. LIST ALL FUNCTIONS AND PROCEDURES
SELECT '=== FUNCTIONS/PROCEDURES ===' as section;
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_result(p.oid) as return_type,
    pg_get_function_arguments(p.oid) as arguments,
    CASE p.prokind 
        WHEN 'f' THEN 'function'
        WHEN 'p' THEN 'procedure'
        WHEN 'a' THEN 'aggregate'
        WHEN 'w' THEN 'window'
    END as function_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- 7. LIST ALL TRIGGERS
SELECT '=== TRIGGERS ===' as section;
SELECT 
    t.tgname as trigger_name,
    c.relname as table_name,
    p.proname as function_name,
    CASE t.tgtype & 66
        WHEN 2 THEN 'BEFORE'
        WHEN 64 THEN 'INSTEAD OF'
        ELSE 'AFTER'
    END as trigger_timing,
    CASE t.tgtype & 28
        WHEN 4 THEN 'INSERT'
        WHEN 8 THEN 'DELETE'
        WHEN 16 THEN 'UPDATE'
        WHEN 12 THEN 'INSERT OR DELETE'
        WHEN 20 THEN 'INSERT OR UPDATE'
        WHEN 24 THEN 'DELETE OR UPDATE'
        WHEN 28 THEN 'INSERT OR DELETE OR UPDATE'
    END as trigger_event
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND t.tgisinternal = false
ORDER BY c.relname, t.tgname;

-- 8. LIST ALL VIEWS
SELECT '=== VIEWS ===' as section;
SELECT 
    schemaname,
    viewname,
    viewowner,
    definition
FROM pg_views 
WHERE schemaname = 'public'
ORDER BY viewname;

-- 9. CHECK USERS TABLE STRUCTURE SPECIFICALLY
SELECT '=== USERS TABLE DETAILED STRUCTURE ===' as section;
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    numeric_precision,
    numeric_scale,
    is_nullable,
    column_default,
    ordinal_position
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 10. CHECK ACTUAL USERS DATA
SELECT '=== CURRENT USERS DATA ===' as section;
SELECT 
    id,
    username,
    LEFT(password_hash, 20) || '...' as password_hash_preview,
    full_name,
    email,
    role,
    is_active,
    created_at,
    updated_at
FROM users 
ORDER BY id;

-- 11. CHECK FOR ANY CUSTOM TYPES
SELECT '=== CUSTOM TYPES ===' as section;
SELECT 
    n.nspname as schema_name,
    t.typname as type_name,
    CASE t.typtype
        WHEN 'b' THEN 'base'
        WHEN 'c' THEN 'composite'
        WHEN 'd' THEN 'domain'
        WHEN 'e' THEN 'enum'
        WHEN 'p' THEN 'pseudo'
        WHEN 'r' THEN 'range'
    END as type_category
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public' AND t.typtype != 'b'
ORDER BY t.typname;

-- 12. CHECK TABLE SIZES (OPTIONAL - FOR REFERENCE)
SELECT '=== TABLE SIZES ===' as section;
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 13. SUMMARY CHECK - EXPECTED VS ACTUAL
SELECT '=== SUMMARY VERIFICATION ===' as section;

-- Count tables
SELECT 'Tables count' as check_type, COUNT(*) as actual_count, 9 as expected_count,
       CASE WHEN COUNT(*) = 9 THEN '✅ OK' ELSE '❌ MISMATCH' END as status
FROM pg_tables WHERE schemaname = 'public'

UNION ALL

-- Count users (ignoring user count as requested)
SELECT 'Users count' as check_type, COUNT(*) as actual_count, 0 as expected_count,
       '✅ IGNORED' as status
FROM users

UNION ALL

-- Count functions
SELECT 'Functions count' as check_type, COUNT(*) as actual_count, 3 as expected_count,
       CASE WHEN COUNT(*) >= 3 THEN '✅ OK' ELSE '❌ MISMATCH' END as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'

UNION ALL

-- Count views
SELECT 'Views count' as check_type, COUNT(*) as actual_count, 1 as expected_count,
       CASE WHEN COUNT(*) = 1 THEN '✅ OK' ELSE '❌ MISMATCH' END as status
FROM pg_views WHERE schemaname = 'public';

-- =====================================================
-- INSTRUCTIONS FOR USE:
-- =====================================================
-- 1. Run this script on your LOCAL database
-- 2. Compare the output with database_schema.sql
-- 3. Look for any missing tables, columns, indexes, etc.
-- 4. Pay special attention to the SUMMARY section at the end
-- ===================================================== 