-- Script pour corriger la base de données existante
-- La colonne account_name existe déjà, on met juste à jour les données

-- 1. Mettre à jour les comptes existants qui n'ont pas de nom
UPDATE accounts 
SET account_name = CONCAT('Compte ', (SELECT full_name FROM users WHERE users.id = accounts.user_id))
WHERE account_name IS NULL OR account_name = '';

-- 2. Accorder les permissions à l'utilisateur zalint
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zalint;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zalint;
GRANT USAGE ON SCHEMA public TO zalint;
GRANT CREATE ON SCHEMA public TO zalint;

-- 3. Permissions sur les futures tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO zalint;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO zalint;

-- 4. Vérifier les comptes
SELECT 
    a.id,
    a.account_name,
    u.full_name as directeur,
    a.current_balance,
    a.total_credited,
    a.total_spent,
    a.is_active
FROM accounts a
JOIN users u ON a.user_id = u.id
ORDER BY a.account_name;

SELECT 'Base de données mise à jour avec succès!' as message; 