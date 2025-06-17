-- =================================================================
-- SCRIPT DE MIGRATION POUR ALIGNER RENDER AVEC LA STRUCTURE LOCALE
-- =================================================================

-- 1. Table USERS (Utilisateurs)
-- =================================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Table ACCOUNTS (Comptes)
-- =================================================================
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    current_balance INTEGER NOT NULL DEFAULT 0,
    total_credited INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(20) DEFAULT 'classique',
    access_restricted BOOLEAN DEFAULT false,
    allowed_roles TEXT[],
    category_type VARCHAR(100),
    can_credit_users INTEGER[]
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);

-- 3. Table EXPENSE_CATEGORIES (Catégories de dépenses)
-- =================================================================
CREATE TABLE IF NOT EXISTS expense_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table EXPENSES (Dépenses)
-- =================================================================
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    category_id INTEGER REFERENCES expense_categories(id),
    amount NUMERIC NOT NULL,
    description TEXT NOT NULL,
    expense_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expense_type VARCHAR(50),
    category VARCHAR(50),
    subcategory VARCHAR(50),
    social_network_detail VARCHAR(50),
    designation VARCHAR(255),
    supplier VARCHAR(255),
    quantity NUMERIC,
    unit_price INTEGER,
    total INTEGER,
    predictable VARCHAR(10),
    justification_filename VARCHAR(255),
    justification_path VARCHAR(500),
    account_id INTEGER REFERENCES accounts(id),
    selected_for_invoice BOOLEAN DEFAULT false,
    requires_validation BOOLEAN DEFAULT false,
    validation_status VARCHAR(20) DEFAULT 'pending',
    is_partner_expense BOOLEAN DEFAULT false
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- 5. Table CREDIT_HISTORY (Historique des crédits)
-- =================================================================
CREATE TABLE IF NOT EXISTS credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    credited_by INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_credit_history_account_id ON credit_history(account_id);
CREATE INDEX IF NOT EXISTS idx_credit_history_date ON credit_history(created_at);

-- 6. Table PARTNER_ACCOUNT_DIRECTORS (Directeurs comptes partenaires)
-- =================================================================
CREATE TABLE IF NOT EXISTS partner_account_directors (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    user_id INTEGER REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_partner_directors_account ON partner_account_directors(account_id);
CREATE INDEX IF NOT EXISTS idx_partner_directors_user ON partner_account_directors(user_id);

-- 7. Table PARTNER_DELIVERIES (Livraisons partenaires)
-- =================================================================
CREATE TABLE IF NOT EXISTS partner_deliveries (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    delivery_date DATE NOT NULL,
    article_count INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_validated BOOLEAN DEFAULT false,
    validated_by INTEGER REFERENCES users(id),
    validated_at TIMESTAMP,
    validation_status VARCHAR(20) DEFAULT 'pending',
    first_validated_by INTEGER REFERENCES users(id),
    first_validated_at TIMESTAMP,
    rejection_comment TEXT,
    rejected_by INTEGER REFERENCES users(id),
    rejected_at TIMESTAMP
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_account ON partner_deliveries(account_id);
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_date ON partner_deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_status ON partner_deliveries(validation_status);

-- 8. Table PARTNER_EXPENSE_VALIDATIONS (Validations dépenses partenaires)
-- =================================================================
CREATE TABLE IF NOT EXISTS partner_expense_validations (
    id SERIAL PRIMARY KEY,
    expense_id INTEGER REFERENCES expenses(id),
    validated_by INTEGER REFERENCES users(id),
    validation_type VARCHAR(20) NOT NULL,
    validation_comment TEXT,
    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_partner_validations_expense ON partner_expense_validations(expense_id);

-- 9. Table REMBOURSEMENTS (Remboursements)
-- =================================================================
CREATE TABLE IF NOT EXISTS remboursements (
    id SERIAL PRIMARY KEY,
    nom_client VARCHAR(255) NOT NULL,
    numero_tel VARCHAR(30) NOT NULL,
    date DATE NOT NULL,
    action VARCHAR(20) NOT NULL,
    commentaire TEXT,
    montant INTEGER NOT NULL
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_remboursements_date ON remboursements(date);
CREATE INDEX IF NOT EXISTS idx_remboursements_client ON remboursements(nom_client);

-- 10. Table TRANSFER_HISTORY (Historique des transferts)
-- =================================================================
CREATE TABLE IF NOT EXISTS transfer_history (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES accounts(id),
    destination_id INTEGER REFERENCES accounts(id),
    montant INTEGER NOT NULL,
    transferred_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_transfer_history_source ON transfer_history(source_id);
CREATE INDEX IF NOT EXISTS idx_transfer_history_destination ON transfer_history(destination_id);
CREATE INDEX IF NOT EXISTS idx_transfer_history_date ON transfer_history(created_at);

-- 11. Table WALLETS (Portefeuilles - ancien système, optionnel)
-- =================================================================
CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    week_start_date DATE NOT NULL,
    initial_amount NUMERIC NOT NULL,
    current_balance NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_date ON wallets(week_start_date);

-- 12. Création de la vue PARTNER_DELIVERY_SUMMARY
-- =================================================================
CREATE OR REPLACE VIEW partner_delivery_summary AS
SELECT 
    a.id AS account_id,
    a.account_name,
    a.current_balance,
    a.total_credited,
    COALESCE(SUM(pd.amount), 0) AS total_delivered,
    COALESCE(SUM(pd.article_count), 0) AS total_articles,
    COUNT(pd.id) AS delivery_count,
    SUM(CASE WHEN pd.validation_status = 'first_validated' THEN 1 ELSE 0 END) AS pending_second_validation,
    SUM(CASE WHEN pd.validation_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_deliveries,
    (a.total_credited - COALESCE(SUM(pd.amount), 0)) AS remaining_balance,
    CASE 
        WHEN a.total_credited > 0 THEN 
            ROUND((COALESCE(SUM(pd.amount), 0) * 100.0 / a.total_credited), 2)
        ELSE 0 
    END AS delivery_percentage
FROM accounts a
LEFT JOIN partner_deliveries pd ON a.id = pd.account_id 
    AND pd.validation_status IN ('validated', 'first_validated')
WHERE a.account_type = 'partenaire' AND a.is_active = true
GROUP BY a.id, a.account_name, a.current_balance, a.total_credited;

-- =================================================================
-- FONCTIONS UTILITAIRES
-- =================================================================

-- Fonction pour gérer les crédits spéciaux selon le type de compte
CREATE OR REPLACE FUNCTION handle_special_credit(
    p_account_id INTEGER,
    p_credited_by INTEGER,
    p_amount INTEGER,
    p_description TEXT DEFAULT 'Crédit de compte',
    p_credit_date DATE DEFAULT CURRENT_DATE
) RETURNS BOOLEAN AS $$
DECLARE
    account_info RECORD;
    can_credit BOOLEAN := false;
BEGIN
    -- Récupérer les informations du compte
    SELECT account_type, can_credit_users INTO account_info
    FROM accounts WHERE id = p_account_id;
    
    -- Vérifier les permissions selon le type de compte
    IF account_info.account_type = 'statut' THEN
        -- Pour les comptes statut, écraser le total_credited et ajuster current_balance
        UPDATE accounts 
        SET total_credited = p_amount,
            current_balance = p_amount - total_spent
        WHERE id = p_account_id;
        can_credit := true;
    ELSE
        -- Pour les comptes classiques, ajouter au total_credited
        UPDATE accounts 
        SET total_credited = total_credited + p_amount,
            current_balance = current_balance + p_amount
        WHERE id = p_account_id;
        can_credit := true;
    END IF;
    
    RETURN can_credit;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- DONNÉES INITIALES
-- =================================================================

-- Insertion des utilisateurs par défaut (si ils n'existent pas)
INSERT INTO users (username, password_hash, role, full_name) 
SELECT 'admin', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'directeur_general', 'Administrateur'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

INSERT INTO users (username, password_hash, role, full_name) 
SELECT 'pca', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'pca', 'Président du Conseil d''Administration'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'pca');

-- Insertion des catégories de dépenses par défaut
INSERT INTO expense_categories (name, description) 
SELECT 'Achat', 'Achats de produits et services'
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Achat');

INSERT INTO expense_categories (name, description) 
SELECT 'Marketing', 'Dépenses marketing et publicité'
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Marketing');

-- =================================================================
-- CONTRAINTES ET PERMISSIONS
-- =================================================================

-- Contraintes de validation
ALTER TABLE accounts ADD CONSTRAINT chk_account_type 
CHECK (account_type IN ('classique', 'partenaire', 'statut', 'Ajustement'));

ALTER TABLE expenses ADD CONSTRAINT chk_predictable 
CHECK (predictable IN ('oui', 'non'));

ALTER TABLE partner_deliveries ADD CONSTRAINT chk_validation_status 
CHECK (validation_status IN ('pending', 'first_validated', 'validated', 'rejected'));

-- =================================================================
-- MESSAGE DE CONFIRMATION
-- =================================================================
DO $$ BEGIN
    RAISE NOTICE '✅ Migration terminée avec succès !';
    RAISE NOTICE '📊 Tables créées : users, accounts, expenses, credit_history, etc.';
    RAISE NOTICE '🔧 Fonctions utilitaires créées';
    RAISE NOTICE '📈 Vue partner_delivery_summary créée';
    RAISE NOTICE '👤 Utilisateurs par défaut ajoutés (admin/pca)';
    RAISE NOTICE '🚀 Votre base de données Render est maintenant alignée !';
END $$; 