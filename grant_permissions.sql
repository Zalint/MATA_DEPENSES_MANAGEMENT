-- Script pour accorder les permissions nécessaires
-- Exécutez ce script en tant qu'administrateur PostgreSQL

-- Accorder toutes les permissions sur les tables à l'utilisateur zalint
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zalint;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zalint;

-- Accorder les permissions sur le schéma public
GRANT USAGE ON SCHEMA public TO zalint;
GRANT CREATE ON SCHEMA public TO zalint;

-- Accorder les permissions sur les futures tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO zalint;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO zalint;

-- Vérifier les permissions
SELECT 
    schemaname,
    tablename,
    tableowner,
    hasinserts,
    hasselects,
    hasupdates,
    hasdeletes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT 'Permissions accordées avec succès pour l''utilisateur zalint!' as message; 