-- Complete Database Schema Comparison Query
-- Run this in both LOCAL and RENDER databases, then compare the results

-- 1. Get all tables and their basic info
SELECT 'TABLES' as section, table_name, table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. Get all columns with their details
SELECT 'COLUMNS' as section, 
       table_name, 
       column_name, 
       ordinal_position,
       data_type, 
       character_maximum_length,
       is_nullable, 
       column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
ORDER BY table_name, ordinal_position;

-- 3. Get all indexes
SELECT 'INDEXES' as section,
       schemaname,
       tablename,
       indexname,
       indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 4. Get all constraints (PRIMARY KEY, FOREIGN KEY, CHECK, etc.)
SELECT 'CONSTRAINTS' as section,
       tc.table_name,
       tc.constraint_name,
       tc.constraint_type,
       kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- 5. Get all functions and procedures
SELECT 'FUNCTIONS' as section,
       routine_name,
       routine_type,
       data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- 6. Get all views
SELECT 'VIEWS' as section,
       table_name as view_name,
       view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- 7. Get all triggers
SELECT 'TRIGGERS' as section,
       trigger_name,
       event_manipulation,
       event_object_table,
       action_statement,
       action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name; 