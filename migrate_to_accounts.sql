-- Script de migration : Portefeuilles vers Comptes permanents
-- À exécuter si vous avez déjà une base de données avec des portefeuilles

-- 1. Créer les nouvelles tables si elles n'existent pas
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    current_balance INTEGER DEFAULT 0 NOT NULL,
    total_credited INTEGER DEFAULT 0 NOT NULL,
    total_spent INTEGER DEFAULT 0 NOT NULL,
    created_by INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    account_name VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    credited_by INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Migrer les données des portefeuilles vers les comptes (si la table wallets existe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallets') THEN
        -- Créer des comptes basés sur les portefeuilles existants
        INSERT INTO accounts (user_id, current_balance, total_credited, total_spent, created_by, created_at)
        SELECT 
            w.user_id,
            w.current_balance,
            w.initial_amount,
            (w.initial_amount - w.current_balance),
            (SELECT id FROM users WHERE role = 'directeur_general' LIMIT 1),
            w.created_at
        FROM wallets w
        WHERE w.user_id IN (SELECT id FROM users WHERE role = 'directeur')
        ON CONFLICT (user_id) DO UPDATE SET
            current_balance = EXCLUDED.current_balance + accounts.current_balance,
            total_credited = EXCLUDED.total_credited + accounts.total_credited,
            total_spent = EXCLUDED.total_spent + accounts.total_spent;

        -- Créer l'historique des crédits basé sur les portefeuilles
        INSERT INTO credit_history (account_id, credited_by, amount, description, created_at)
        SELECT 
            a.id,
            (SELECT id FROM users WHERE role = 'directeur_general' LIMIT 1),
            w.initial_amount,
            CONCAT('Migration - Portefeuille semaine du ', w.week_start_date),
            w.created_at
        FROM wallets w
        JOIN accounts a ON w.user_id = a.user_id
        WHERE w.initial_amount > 0;

        RAISE NOTICE 'Migration des portefeuilles vers comptes terminée';
    ELSE
        RAISE NOTICE 'Table wallets non trouvée, pas de migration nécessaire';
    END IF;
END
$$;

-- 3. Créer les index
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_history_account ON credit_history(account_id);

-- 4. Créer le trigger pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Mettre à jour les comptes existants avec des noms par défaut
UPDATE accounts 
SET account_name = CONCAT('Compte ', (SELECT full_name FROM users WHERE users.id = accounts.user_id))
WHERE account_name IS NULL OR account_name = '';

-- 6. Rendre la colonne account_name obligatoire
ALTER TABLE accounts ALTER COLUMN account_name SET NOT NULL;

-- 7. Supprimer l'ancienne table wallets si elle existe
DROP TABLE IF EXISTS wallets CASCADE;

-- 8. Vérifier les données
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

SELECT 'Migration vers le système de comptes terminée avec succès!' as message; 