-- Get complete view definition
SELECT 'COMPLETE VIEW DEFINITION:' as info;
SELECT definition FROM pg_views WHERE schemaname = 'public' AND viewname = 'partner_delivery_summary';

-- Get all table names to identify the 3 extra ones
SELECT 'ALL TABLES:' as info;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Get structure of any tables not in our expected list
SELECT 'MISSING TABLE STRUCTURES:' as info;
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    c.ordinal_position
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' 
AND t.table_name NOT IN (
    'users', 'accounts', 'expenses', 
    'credit_history', 'partner_deliveries', 'partner_directors'
)
ORDER BY t.table_name, c.ordinal_position; 