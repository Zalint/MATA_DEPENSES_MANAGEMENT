-- Run these queries ONE BY ONE to get complete schema information
-- Copy each result before running the next query

-- QUERY 1: Get all tables
SELECT 'TABLES' as section, table_name, table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- QUERY 2: Get all columns with details  
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

-- QUERY 3: Get all indexes
SELECT 'INDEXES' as section,
       schemaname,
       tablename,
       indexname,
       indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- QUERY 4: Get all constraints
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