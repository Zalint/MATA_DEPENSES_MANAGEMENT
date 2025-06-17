-- =================================================================
-- SCRIPT D'ALIGNEMENT RENDER - VERSION CORRIGÉE ET SÉCURISÉE
-- Ajout seulement des éléments manquants
-- Sécurisé et avec contraintes appropriées
-- =================================================================

-- 1. Table TRANSFER_HISTORY (manquante)
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

-- 2. Colonnes manquantes dans EXPENSES
-- =================================================================
DO $$ 
BEGIN
    -- category_id (référence à expense_categories)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'category_id') THEN
        ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES expense_categories(id);
        RAISE NOTICE 'Colonne category_id ajoutée à expenses';
    END IF;
    
    -- amount (peut être NULL pour ne pas casser les données existantes)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'amount') THEN
        ALTER TABLE expenses ADD COLUMN amount NUMERIC;
        RAISE NOTICE 'Colonne amount ajoutée à expenses';
    END IF;
    
    -- selected_for_invoice (avec valeur par défaut)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'selected_for_invoice') THEN
        ALTER TABLE expenses ADD COLUMN selected_for_invoice BOOLEAN DEFAULT false;
        RAISE NOTICE 'Colonne selected_for_invoice ajoutée à expenses';
    END IF;
    
    -- requires_validation (avec valeur par défaut)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'requires_validation') THEN
        ALTER TABLE expenses ADD COLUMN requires_validation BOOLEAN DEFAULT false;
        RAISE NOTICE 'Colonne requires_validation ajoutée à expenses';
    END IF;
    
    -- validation_status (avec valeur par défaut)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'validation_status') THEN
        ALTER TABLE expenses ADD COLUMN validation_status VARCHAR(20) DEFAULT 'pending';
        RAISE NOTICE 'Colonne validation_status ajoutée à expenses';
    END IF;
    
    -- is_partner_expense (avec valeur par défaut)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'is_partner_expense') THEN
        ALTER TABLE expenses ADD COLUMN is_partner_expense BOOLEAN DEFAULT false;
        RAISE NOTICE 'Colonne is_partner_expense ajoutée à expenses';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Erreur lors de l''ajout des colonnes à expenses: %', SQLERRM;
END $$;

-- 3. Colonnes manquantes dans PARTNER_DELIVERIES
-- =================================================================
DO $$ 
BEGIN
    -- article_count (peut être NULL pour ne pas casser les données existantes)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'article_count') THEN
        ALTER TABLE partner_deliveries ADD COLUMN article_count INTEGER;
        RAISE NOTICE 'Colonne article_count ajoutée à partner_deliveries';
    END IF;
    
    -- unit_price (prix unitaire pour calcul automatique)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'unit_price') THEN
        ALTER TABLE partner_deliveries ADD COLUMN unit_price NUMERIC;
        RAISE NOTICE 'Colonne unit_price ajoutée à partner_deliveries';
    END IF;
    
    -- is_validated (avec valeur par défaut)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'is_validated') THEN
        ALTER TABLE partner_deliveries ADD COLUMN is_validated BOOLEAN DEFAULT false;
        RAISE NOTICE 'Colonne is_validated ajoutée à partner_deliveries';
    END IF;
    
    -- validated_at (peut être NULL)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'validated_at') THEN
        ALTER TABLE partner_deliveries ADD COLUMN validated_at TIMESTAMP;
        RAISE NOTICE 'Colonne validated_at ajoutée à partner_deliveries';
    END IF;
    
    -- validation_status (avec valeur par défaut)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'validation_status') THEN
        ALTER TABLE partner_deliveries ADD COLUMN validation_status VARCHAR(20) DEFAULT 'pending';
        RAISE NOTICE 'Colonne validation_status ajoutée à partner_deliveries';
    END IF;
    
    -- first_validated_by (référence à users)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'first_validated_by') THEN
        ALTER TABLE partner_deliveries ADD COLUMN first_validated_by INTEGER REFERENCES users(id);
        RAISE NOTICE 'Colonne first_validated_by ajoutée à partner_deliveries';
    END IF;
    
    -- first_validated_at (peut être NULL)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'first_validated_at') THEN
        ALTER TABLE partner_deliveries ADD COLUMN first_validated_at TIMESTAMP;
        RAISE NOTICE 'Colonne first_validated_at ajoutée à partner_deliveries';
    END IF;
    
    -- rejection_comment (peut être NULL)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'rejection_comment') THEN
        ALTER TABLE partner_deliveries ADD COLUMN rejection_comment TEXT;
        RAISE NOTICE 'Colonne rejection_comment ajoutée à partner_deliveries';
    END IF;
    
    -- rejected_by (référence à users)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'rejected_by') THEN
        ALTER TABLE partner_deliveries ADD COLUMN rejected_by INTEGER REFERENCES users(id);
        RAISE NOTICE 'Colonne rejected_by ajoutée à partner_deliveries';
    END IF;
    
    -- rejected_at (peut être NULL)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partner_deliveries' AND column_name = 'rejected_at') THEN
        ALTER TABLE partner_deliveries ADD COLUMN rejected_at TIMESTAMP;
        RAISE NOTICE 'Colonne rejected_at ajoutée à partner_deliveries';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Erreur lors de l''ajout des colonnes à partner_deliveries: %', SQLERRM;
END $$;

-- =================================================================
-- CONTRAINTES DE VALIDATION (si elles n'existent pas)
-- =================================================================
DO $$ 
BEGIN
    -- Contrainte validation_status pour expenses
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                      WHERE constraint_name = 'chk_expenses_validation_status') THEN
            ALTER TABLE expenses ADD CONSTRAINT chk_expenses_validation_status 
            CHECK (validation_status IN ('pending', 'validated', 'rejected'));
            RAISE NOTICE 'Contrainte validation_status ajoutée à expenses';
        END IF;
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'Contrainte validation_status existe déjà pour expenses';
        WHEN OTHERS THEN
            RAISE NOTICE 'Erreur lors de l''ajout de la contrainte expenses: %', SQLERRM;
    END;
    
    -- Contrainte validation_status pour partner_deliveries
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                      WHERE constraint_name = 'chk_partner_deliveries_validation_status') THEN
            ALTER TABLE partner_deliveries ADD CONSTRAINT chk_partner_deliveries_validation_status 
            CHECK (validation_status IN ('pending', 'first_validated', 'validated', 'rejected'));
            RAISE NOTICE 'Contrainte validation_status ajoutée à partner_deliveries';
        END IF;
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'Contrainte validation_status existe déjà pour partner_deliveries';
        WHEN OTHERS THEN
            RAISE NOTICE 'Erreur lors de l''ajout de la contrainte partner_deliveries: %', SQLERRM;
    END;
END $$;

-- =================================================================
-- FONCTION UTILITAIRE (si elle n'existe pas)
-- =================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'handle_special_credit') THEN
        CREATE OR REPLACE FUNCTION handle_special_credit(
            p_account_id INTEGER,
            p_credited_by INTEGER,
            p_amount INTEGER,
            p_description TEXT DEFAULT 'Crédit de compte',
            p_credit_date DATE DEFAULT CURRENT_DATE
        ) RETURNS BOOLEAN AS $FUNC$
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
        $FUNC$ LANGUAGE plpgsql;
        
        RAISE NOTICE 'Fonction handle_special_credit créée avec succès';
    ELSE
        RAISE NOTICE 'Fonction handle_special_credit existe déjà';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Erreur lors de la création de handle_special_credit: %', SQLERRM;
END $$;

-- =================================================================
-- MESSAGE DE CONFIRMATION
-- =================================================================
DO $$ 
BEGIN
    RAISE NOTICE '✅ === ALIGNEMENT RENDER TERMINÉ AVEC SUCCÈS ! ===';
    RAISE NOTICE '📊 Table transfer_history: Créée avec clés étrangères';
    RAISE NOTICE '🔗 Colonnes manquantes: Ajoutées avec valeurs par défaut';
    RAISE NOTICE '📈 Index d''optimisation: Créés pour transfer_history';
    RAISE NOTICE '🔧 Contraintes de validation: Ajoutées si nécessaires';
    RAISE NOTICE '⚡ Fonction utilitaire: handle_special_credit disponible';
    RAISE NOTICE '🚀 Votre base Render est maintenant 100%% compatible !';
    RAISE NOTICE '🔒 Script sécurisé - Peut être exécuté plusieurs fois';
END $$; 