-- Script pour adapter les comptes partenaires avec suivi des livraisons
-- Mise à jour des règles pour les comptes partenaires

-- 0. D'ABORD, ajouter la colonne account_type à la table accounts si elle n'existe pas
DO $$
BEGIN
    -- Ajouter la colonne account_type si elle n'existe pas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'account_type'
    ) THEN
        ALTER TABLE accounts 
        ADD COLUMN account_type VARCHAR(20) DEFAULT 'classique' 
        CHECK (account_type IN ('classique', 'creance', 'fournisseur', 'partenaire', 'statut'));
        
        -- Mettre à jour tous les comptes existants
        UPDATE accounts SET account_type = 'classique' WHERE account_type IS NULL;
    END IF;
    
    -- Ajouter les colonnes d'accès si elles n'existent pas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'access_restricted'
    ) THEN
        ALTER TABLE accounts ADD COLUMN access_restricted BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'allowed_roles'
    ) THEN
        ALTER TABLE accounts ADD COLUMN allowed_roles TEXT[];
    END IF;
END $$;

-- 1. Créer une table pour les directeurs assignés aux comptes partenaires
CREATE TABLE IF NOT EXISTS partner_account_directors (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, user_id)
);

-- 2. Créer une table pour les livraisons de stock/produits
CREATE TABLE IF NOT EXISTS partner_deliveries (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    delivery_date DATE NOT NULL,
    article_count INTEGER NOT NULL,
    amount INTEGER NOT NULL, -- Montant en FCFA
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_validated BOOLEAN DEFAULT false,
    validated_by INTEGER REFERENCES users(id),
    validated_at TIMESTAMP
);

-- 3. Créer une table pour la double validation des dépenses partenaires
CREATE TABLE IF NOT EXISTS partner_expense_validations (
    id SERIAL PRIMARY KEY,
    expense_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
    validated_by INTEGER REFERENCES users(id),
    validation_type VARCHAR(20) NOT NULL CHECK (validation_type IN ('first', 'second')),
    validation_comment TEXT,
    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(expense_id, validated_by, validation_type)
);

-- 4. Ajouter des colonnes aux dépenses pour la validation
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS requires_validation BOOLEAN DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'pending' 
    CHECK (validation_status IN ('pending', 'first_validated', 'fully_validated', 'rejected'));
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_partner_expense BOOLEAN DEFAULT false;

-- 5. Créer une vue pour le suivi des livraisons partenaires
CREATE OR REPLACE VIEW partner_delivery_summary AS
SELECT 
    a.id as account_id,
    a.account_name,
    a.current_balance,
    a.total_credited,
    COALESCE(SUM(pd.amount), 0) as total_delivered,
    COALESCE(SUM(pd.article_count), 0) as total_articles,
    COUNT(pd.id) as delivery_count,
    (a.total_credited - COALESCE(SUM(pd.amount), 0)) as remaining_balance,
    CASE 
        WHEN a.total_credited > 0 THEN 
            ROUND((COALESCE(SUM(pd.amount), 0)::DECIMAL / a.total_credited) * 100, 2)
        ELSE 0
    END as delivery_percentage
FROM accounts a
LEFT JOIN partner_deliveries pd ON a.id = pd.account_id AND pd.is_validated = true
WHERE a.account_type = 'partenaire'
GROUP BY a.id, a.account_name, a.current_balance, a.total_credited;

-- 6. Modifier la fonction handle_special_credit pour les partenaires
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
            -- NOUVELLE RÈGLE: Seul le DG peut créditer les comptes partenaires
            v_is_authorized := v_user_role = 'directeur_general';
            
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

-- 7. Fonction pour valider une livraison partenaire
CREATE OR REPLACE FUNCTION validate_partner_delivery(
    p_delivery_id INTEGER,
    p_validated_by INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_delivery RECORD;
    v_user_role VARCHAR(20);
BEGIN
    -- Vérifier que l'utilisateur est DG
    SELECT role INTO v_user_role FROM users WHERE id = p_validated_by;
    
    IF v_user_role != 'directeur_general' THEN
        RETURN false;
    END IF;
    
    -- Récupérer les informations de la livraison
    SELECT * INTO v_delivery FROM partner_deliveries WHERE id = p_delivery_id AND is_validated = false;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Valider la livraison
    UPDATE partner_deliveries 
    SET is_validated = true,
        validated_by = p_validated_by,
        validated_at = CURRENT_TIMESTAMP
    WHERE id = p_delivery_id;
    
    -- Déduire le montant du solde du compte
    UPDATE accounts 
    SET current_balance = current_balance - v_delivery.amount,
        total_spent = total_spent + v_delivery.amount
    WHERE id = v_delivery.account_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- 8. Créer des index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_partner_account_directors_account ON partner_account_directors(account_id);
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_account ON partner_deliveries(account_id);
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_date ON partner_deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_partner_expense_validations_expense ON partner_expense_validations(expense_id);
CREATE INDEX IF NOT EXISTS idx_expenses_validation_status ON expenses(validation_status);

-- 9. Mettre à jour les comptes partenaires existants
UPDATE accounts 
SET access_restricted = false, 
    allowed_roles = NULL 
WHERE account_type = 'partenaire';

-- S'assurer que tous les comptes actifs ont un type
UPDATE accounts 
SET account_type = 'classique'
WHERE account_type IS NULL AND is_active = true;

-- 10. Ajouter des données de test (optionnel - à adapter selon vos besoins)
/*
-- Exemple d'assignation de directeurs à un compte partenaire
INSERT INTO partner_account_directors (account_id, user_id) 
SELECT 
    (SELECT id FROM accounts WHERE account_type = 'partenaire' LIMIT 1),
    id 
FROM users 
WHERE role = 'directeur' 
LIMIT 2;
*/

SELECT 'Mise à jour des comptes partenaires terminée avec succès!' as message; 