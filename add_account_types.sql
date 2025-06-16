-- Script pour ajouter les types de comptes
-- Ajout de la notion de types de compte avec leurs spécificités

-- 1. Ajouter une colonne account_type à la table accounts
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'account_type'
    ) THEN
        ALTER TABLE accounts ADD COLUMN account_type VARCHAR(20) DEFAULT 'classique' 
        CHECK (account_type IN ('classique', 'creance', 'fournisseur', 'partenaire', 'statut'));
    END IF;
END $$;

-- 2. Créer une table pour les créditeurs spéciaux (pour les comptes créance)
CREATE TABLE IF NOT EXISTS account_creditors (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    creditor_type VARCHAR(20) NOT NULL CHECK (creditor_type IN ('dg', 'directeur_assigne')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, user_id, creditor_type)
);

-- 3. Créer une table pour l'historique des crédits avec types spéciaux
CREATE TABLE IF NOT EXISTS special_credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    credited_by INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    comment TEXT,
    credit_date DATE NOT NULL,
    account_type VARCHAR(20) NOT NULL,
    is_balance_override BOOLEAN DEFAULT false, -- Pour les comptes statut
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Ajouter des colonnes pour les permissions spéciales
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS access_restricted BOOLEAN DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS allowed_roles TEXT[]; -- Pour stocker les rôles autorisés

-- 5. Mettre à jour les comptes existants comme "classique"
UPDATE accounts SET account_type = 'classique' WHERE account_type IS NULL;

-- 6. Créer des index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_account_creditors_account ON account_creditors(account_id);
CREATE INDEX IF NOT EXISTS idx_special_credit_history_account ON special_credit_history(account_id);

-- 7. Créer une vue pour faciliter les requêtes de comptes avec créditeurs
CREATE OR REPLACE VIEW accounts_with_creditors AS
SELECT 
    a.*,
    u.full_name as user_name,
    uc.full_name as created_by_name,
    CASE 
        WHEN a.account_type = 'creance' THEN 
            (SELECT array_agg(users.full_name) 
             FROM account_creditors ac 
             JOIN users ON ac.user_id = users.id 
             WHERE ac.account_id = a.id)
        ELSE NULL
    END as creditors
FROM accounts a
JOIN users u ON a.user_id = u.id
LEFT JOIN users uc ON a.created_by = uc.id;

-- 8. Fonction pour gérer les crédits selon le type de compte
CREATE OR REPLACE FUNCTION handle_special_credit(
    p_account_id INTEGER,
    p_credited_by INTEGER,
    p_amount INTEGER,
    p_comment TEXT,
    p_credit_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
    v_account_type VARCHAR(20);
    v_is_authorized BOOLEAN := false;
    v_user_role VARCHAR(20);
BEGIN
    -- Récupérer le type de compte et le rôle de l'utilisateur
    SELECT a.account_type, u.role 
    INTO v_account_type, v_user_role
    FROM accounts a, users u
    WHERE a.id = p_account_id AND u.id = p_credited_by;
    
    -- Vérifier les autorisations selon le type de compte
    CASE v_account_type
        WHEN 'classique' THEN
            -- Seuls DG et PCA peuvent créditer les comptes classiques
            v_is_authorized := v_user_role IN ('directeur_general', 'pca');
            
        WHEN 'creance' THEN
            -- DG ou directeur assigné peuvent créditer
            v_is_authorized := v_user_role = 'directeur_general' OR 
                              EXISTS (SELECT 1 FROM account_creditors 
                                     WHERE account_id = p_account_id 
                                     AND user_id = p_credited_by);
                                     
        WHEN 'fournisseur' THEN
            -- Seuls DG et PCA
            v_is_authorized := v_user_role IN ('directeur_general', 'pca');
            
        WHEN 'partenaire' THEN
            -- Tous les utilisateurs autorisés peuvent créditer
            v_is_authorized := true;
            
        WHEN 'statut' THEN
            -- Seuls DG et PCA, avec écrasement du solde
            v_is_authorized := v_user_role IN ('directeur_general', 'pca');
            
            IF v_is_authorized THEN
                -- Pour les comptes statut, écraser le solde existant
                UPDATE accounts 
                SET current_balance = p_amount, 
                    total_credited = p_amount,
                    total_spent = 0
                WHERE id = p_account_id;
                
                -- Enregistrer dans l'historique spécial
                INSERT INTO special_credit_history 
                (account_id, credited_by, amount, comment, credit_date, account_type, is_balance_override)
                VALUES (p_account_id, p_credited_by, p_amount, p_comment, p_credit_date, v_account_type, true);
                
                RETURN true;
            END IF;
    END CASE;
    
    IF v_is_authorized AND v_account_type != 'statut' THEN
        -- Mise à jour normale du solde pour les autres types
        UPDATE accounts 
        SET current_balance = current_balance + p_amount,
            total_credited = total_credited + p_amount
        WHERE id = p_account_id;
        
        -- Enregistrer dans l'historique spécial
        INSERT INTO special_credit_history 
        (account_id, credited_by, amount, comment, credit_date, account_type, is_balance_override)
        VALUES (p_account_id, p_credited_by, p_amount, p_comment, p_credit_date, v_account_type, false);
        
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql;

SELECT 'Types de comptes ajoutés avec succès!' as message; 