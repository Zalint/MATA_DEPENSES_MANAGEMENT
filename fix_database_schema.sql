-- Script pour corriger le schéma de la base de données
-- Exécutez ce script dans votre client PostgreSQL (pgAdmin, etc.)

-- 1. Ajouter la colonne account_name si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'account_name'
    ) THEN
        ALTER TABLE accounts ADD COLUMN account_name VARCHAR(100);
    END IF;
END $$;

-- 2. Mettre à jour les comptes existants avec des noms par défaut
UPDATE accounts 
SET account_name = CONCAT('Compte ', (SELECT full_name FROM users WHERE users.id = accounts.user_id))
WHERE account_name IS NULL OR account_name = '';

-- 3. Rendre la colonne account_name obligatoire
ALTER TABLE accounts ALTER COLUMN account_name SET NOT NULL;

-- 4. Vérifier les données
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

SELECT 'Schéma de base de données corrigé avec succès!' as message; 