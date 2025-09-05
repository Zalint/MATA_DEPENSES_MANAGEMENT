-- =====================================================
-- GITHUB ACTIONS TEST DATABASE SETUP
-- =====================================================
-- Complete database setup for GitHub Actions CI/CD
-- Includes all tables, functions, and test data needed
-- =====================================================

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('directeur', 'directeur_general', 'pca', 'admin')),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ACCOUNTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL,
    current_balance INTEGER DEFAULT 0 NOT NULL,
    total_credited INTEGER DEFAULT 0 NOT NULL,
    total_spent INTEGER DEFAULT 0 NOT NULL,
    transfert_entrants DECIMAL(15,2) DEFAULT 0 NOT NULL,
    transfert_sortants DECIMAL(15,2) DEFAULT 0 NOT NULL,
    created_by INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    account_type VARCHAR(20) DEFAULT 'classique' CHECK (account_type IN ('classique', 'partenaire', 'statut', 'creance', 'depot', 'Ajustement')),
    description TEXT,
    creditors TEXT,
    category_type VARCHAR(50)
);

-- =====================================================
-- EXPENSES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    description TEXT NOT NULL,
    expense_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expense_type VARCHAR(50),
    category VARCHAR(100),
    designation TEXT,
    supplier VARCHAR(100),
    total INTEGER NOT NULL,
    selected_for_invoice BOOLEAN DEFAULT false,
    justification_filename VARCHAR(255),
    has_justification BOOLEAN DEFAULT false
);

-- =====================================================
-- CREDIT HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    credited_by INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- SPECIAL CREDIT HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS special_credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    credited_by INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    comment TEXT,
    credit_date DATE NOT NULL,
    is_balance_override BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TRANSFER HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS transfer_history (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES accounts(id),
    destination_id INTEGER REFERENCES accounts(id),
    montant INTEGER NOT NULL,
    transferred_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CREANCE CLIENTS TABLE (Missing from GitHub Actions)
-- =====================================================
CREATE TABLE IF NOT EXISTS creance_clients (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(30),
    client_address TEXT,
    initial_credit INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CREANCE OPERATIONS TABLE (Missing from GitHub Actions)
-- =====================================================
CREATE TABLE IF NOT EXISTS creance_operations (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES creance_clients(id) ON DELETE CASCADE,
    operation_type VARCHAR(10) NOT NULL CHECK (operation_type IN ('credit', 'debit')),
    amount INTEGER NOT NULL,
    operation_date DATE NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- STOCK VIVANT TABLE (Missing from GitHub Actions)
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_vivant (
    id SERIAL PRIMARY KEY,
    date_stock DATE NOT NULL,
    categorie VARCHAR(100) NOT NULL,
    produit VARCHAR(255) NOT NULL,
    quantite DECIMAL(10,2) DEFAULT 1,
    prix_unitaire INTEGER NOT NULL,
    total INTEGER NOT NULL,
    commentaire TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PARTNER DELIVERIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS partner_deliveries (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    delivery_date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    status VARCHAR(255) DEFAULT 'pending',
    validated_by INTEGER,
    validation_date TIMESTAMP,
    rejection_reason TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unit_price NUMERIC,
    article_count INTEGER,
    is_validated BOOLEAN DEFAULT false,
    validated_at TIMESTAMP,
    validation_status VARCHAR(255) DEFAULT 'pending',
    first_validated_by INTEGER,
    first_validated_at TIMESTAMP,
    rejection_comment TEXT,
    rejected_by INTEGER,
    rejected_at TIMESTAMP
);

-- =====================================================
-- CASH BICTORYS MENSUEL TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS cash_bictorys_mensuel (
    id SERIAL PRIMARY KEY,
    month_year VARCHAR(7) NOT NULL,
    amount INTEGER NOT NULL,
    entry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- FINANCIAL SETTINGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS financial_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- POSTGRESQL FUNCTIONS (Missing from GitHub Actions)
-- =====================================================

-- FONCTION PRODUCTION EXACTE - force_sync_account
CREATE OR REPLACE FUNCTION public.force_sync_account(p_account_id integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    account_type_val TEXT;
    total_expenses DECIMAL(15,2) := 0;
    total_credits DECIMAL(15,2) := 0;
    total_special_credits DECIMAL(15,2) := 0;
    net_transfers DECIMAL(15,2) := 0;
    current_month_adjustment DECIMAL(15,2) := 0;
    new_balance DECIMAL(15,2) := 0;
    latest_transaction_amount DECIMAL(15,2) := 0;
    latest_transaction_date TIMESTAMP;
    partner_remaining DECIMAL(15,2) := 0;
BEGIN
    -- Récupérer le type de compte
    SELECT COALESCE(account_type, 'classique') INTO account_type_val
    FROM accounts
    WHERE id = p_account_id;

    -- LOGIQUE DIFFÉRENTE SELON LE TYPE DE COMPTE
    IF account_type_val = 'partenaire' THEN
        -- =============================================================
        -- LOGIQUE PARTENAIRES: Restant = total_credited - total_delivered
        -- =============================================================
        SELECT COALESCE(total_credited - total_delivered, 0)
        INTO partner_remaining
        FROM partner_delivery_summary
        WHERE account_id = p_account_id;

        new_balance := COALESCE(partner_remaining, 0);

        RAISE NOTICE 'Compte PARTENAIRE ID %: Restant partner_delivery_summary = %', 
            p_account_id, new_balance;

    ELSIF account_type_val = 'statut' THEN
        -- =============================================================
        -- LOGIQUE STATUT: Dernière transaction chronologique
        -- =============================================================
        WITH all_transactions AS (
            -- Crédits réguliers
            SELECT amount, created_at as transaction_date
            FROM credit_history
            WHERE account_id = p_account_id

            UNION ALL

            -- Crédits spéciaux
            SELECT amount, created_at as transaction_date
            FROM special_credit_history
            WHERE account_id = p_account_id

            UNION ALL

            -- Dépenses (négatif)
            SELECT -total as amount, created_at as transaction_date
            FROM expenses
            WHERE account_id = p_account_id

            UNION ALL

            -- Transferts entrants (positif)
            SELECT montant as amount, created_at as transaction_date
            FROM transfer_history
            WHERE destination_id = p_account_id

            UNION ALL

            -- Transferts sortants (négatif)
            SELECT -montant as amount, created_at as transaction_date
            FROM transfer_history
            WHERE source_id = p_account_id
        )
        SELECT COALESCE(amount, 0), transaction_date
        INTO latest_transaction_amount, latest_transaction_date
        FROM all_transactions
        ORDER BY transaction_date DESC
        LIMIT 1;

        new_balance := COALESCE(latest_transaction_amount, 0);

        RAISE NOTICE 'Compte STATUT ID %: Dernière transaction (%) = %',
            p_account_id, latest_transaction_date, new_balance;

    ELSE
        -- =============================================================
        -- LOGIQUE CLASSIQUE: Cumul de toutes les transactions
        -- =============================================================

        -- Calculer le total des dépenses
        SELECT COALESCE(SUM(total), 0) INTO total_expenses
        FROM expenses
        WHERE account_id = p_account_id;

        -- Calculer le total des crédits réguliers
        SELECT COALESCE(SUM(amount), 0) INTO total_credits
        FROM credit_history
        WHERE account_id = p_account_id;

        -- Calculer le total des crédits spéciaux
        SELECT COALESCE(SUM(amount), 0) INTO total_special_credits
        FROM special_credit_history
        WHERE account_id = p_account_id;

        -- Calculer les transferts nets
        SELECT COALESCE(
            SUM(CASE
                WHEN destination_id = p_account_id THEN montant
                WHEN source_id = p_account_id THEN -montant
                ELSE 0
            END), 0
        ) INTO net_transfers
        FROM transfer_history
        WHERE destination_id = p_account_id OR source_id = p_account_id;

        -- Calculer l'ajustement du mois courant
        SELECT COALESCE(montant, 0) INTO current_month_adjustment
        FROM montant_debut_mois
        WHERE account_id = p_account_id
        AND year = EXTRACT(YEAR FROM CURRENT_DATE)
        AND month = EXTRACT(MONTH FROM CURRENT_DATE);

        new_balance := COALESCE(total_credits, 0) + COALESCE(total_special_credits, 0) - COALESCE(total_expenses, 0) + COALESCE(net_transfers, 0) + COALESCE(current_month_adjustment, 0);

        RAISE NOTICE 'Compte CLASSIQUE ID %: Balance cumulative = %',
            p_account_id, new_balance;
    END IF;

    -- S'assurer que new_balance n'est jamais NULL
    new_balance := COALESCE(new_balance, 0);

    -- Mettre à jour la table accounts (différent selon le type)
    IF account_type_val = 'partenaire' THEN
        -- Pour les partenaires, ne pas calculer total_spent/total_credited depuis transactions
        UPDATE accounts SET
            current_balance = new_balance,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_account_id;
    ELSE
        -- Pour classique et statut, calculer aussi total_spent et total_credited
        UPDATE accounts SET
            total_spent = COALESCE(total_expenses, 0),
            total_credited = COALESCE(total_credits, 0) + COALESCE(total_special_credits, 0),
            current_balance = new_balance,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_account_id;
    END IF;

    RAISE NOTICE 'Compte ID % [%] mis à jour: balance = %', p_account_id, account_type_val, new_balance;

END;
$function$;

-- FONCTION PRODUCTION EXACTE - force_sync_all_accounts_simple
CREATE OR REPLACE FUNCTION public.force_sync_all_accounts_simple()
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    account_record RECORD;
    sync_count INTEGER := 0;
    error_count INTEGER := 0;
    result_json JSON;
BEGIN
    -- Synchroniser tous les comptes actifs
    FOR account_record IN
        SELECT id, account_name
        FROM accounts
        WHERE is_active = true
    LOOP
        BEGIN
            -- Appeler la fonction de synchronisation pour chaque compte
            PERFORM force_sync_account(account_record.id);
            sync_count := sync_count + 1;

            RAISE NOTICE 'Compte synchronisé: % (ID: %)', account_record.account_name, account_record.id;

        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            RAISE NOTICE 'Erreur synchronisation compte % (ID: %): %',
                account_record.account_name, account_record.id, SQLERRM;
        END;
    END LOOP;

    -- Construire le résultat JSON
    SELECT json_build_object(
        'status', 'success',
        'synchronized_accounts', sync_count,
        'errors', error_count,
        'message', CASE
            WHEN error_count = 0 THEN 'Tous les comptes ont été synchronisés avec succès'
            ELSE format('%s comptes synchronisés, %s erreurs', sync_count, error_count)
        END
    ) INTO result_json;

    RETURN result_json;
END;
$function$;

-- =====================================================
-- TABLES MANQUANTES POUR PRODUCTION
-- =====================================================

-- Table partner_delivery_summary pour logique partenaires
CREATE TABLE IF NOT EXISTS partner_delivery_summary (
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    total_credited INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id)
);

-- Table montant_debut_mois pour ajustements mensuels
CREATE TABLE IF NOT EXISTS montant_debut_mois (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    montant INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, year, month)
);

-- =====================================================
-- TRANSFER SYNCHRONIZATION FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to synchronize transfer columns for a specific account
CREATE OR REPLACE FUNCTION sync_transferts_account(p_account_id INTEGER)
RETURNS VOID AS $$
DECLARE
    total_entrants DECIMAL(15,2) := 0;
    total_sortants DECIMAL(15,2) := 0;
BEGIN
    -- Calculate incoming transfers
    SELECT COALESCE(SUM(montant), 0) INTO total_entrants
    FROM transfer_history
    WHERE destination_id = p_account_id;

    -- Calculate outgoing transfers
    SELECT COALESCE(SUM(montant), 0) INTO total_sortants
    FROM transfer_history
    WHERE source_id = p_account_id;

    -- Update accounts table
    UPDATE accounts 
    SET 
        transfert_entrants = total_entrants,
        transfert_sortants = total_sortants
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for automatic synchronization
CREATE OR REPLACE FUNCTION trigger_sync_transferts()
RETURNS TRIGGER AS $$
BEGIN
    -- Synchronize source account (OLD and NEW for updates)
    IF TG_OP = 'DELETE' THEN
        PERFORM sync_transferts_account(OLD.source_id);
        PERFORM sync_transferts_account(OLD.destination_id);
        RETURN OLD;
    END IF;
    
    IF TG_OP = 'UPDATE' THEN
        -- If accounts changed, synchronize old accounts
        IF OLD.source_id != NEW.source_id THEN
            PERFORM sync_transferts_account(OLD.source_id);
        END IF;
        IF OLD.destination_id != NEW.destination_id THEN
            PERFORM sync_transferts_account(OLD.destination_id);
        END IF;
    END IF;
    
    -- Synchronize new accounts
    PERFORM sync_transferts_account(NEW.source_id);
    PERFORM sync_transferts_account(NEW.destination_id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trig_sync_transferts ON transfer_history;
CREATE TRIGGER trig_sync_transferts
    AFTER INSERT OR UPDATE OR DELETE ON transfer_history
    FOR EACH ROW
    EXECUTE FUNCTION trigger_sync_transferts();

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_transferts ON accounts(transfert_entrants, transfert_sortants);
CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_credit_history_account_id ON credit_history(account_id);
CREATE INDEX IF NOT EXISTS idx_transfer_history_source ON transfer_history(source_id);
CREATE INDEX IF NOT EXISTS idx_transfer_history_dest ON transfer_history(destination_id);
CREATE INDEX IF NOT EXISTS idx_creance_clients_account ON creance_clients(account_id);
CREATE INDEX IF NOT EXISTS idx_creance_operations_client ON creance_operations(client_id);
CREATE INDEX IF NOT EXISTS idx_stock_vivant_date ON stock_vivant(date_stock);
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_account ON partner_deliveries(account_id);

-- =====================================================
-- INSERT TEST DATA
-- =====================================================

-- Insert test users
INSERT INTO users (username, password_hash, full_name, role) VALUES
('test_dg', '$2b$10$SSE2wB4cc6BdbETwtj/I3.IVlP8gE1FETPdz/.cu2IUu38IZWlFsK', 'Test DG', 'directeur_general'),
('test_directeur', '$2b$10$SSE2wB4cc6BdbETwtj/I3.IVlP8gE1FETPdz/.cu2IUu38IZWlFsK', 'Test Directeur', 'directeur')
ON CONFLICT (username) DO NOTHING;

-- Insert financial settings for test
INSERT INTO financial_settings (setting_key, setting_value) VALUES
('validate_expenses', 'true'),
('default_currency', 'FCFA'),
('max_expense_amount', '10000000')
ON CONFLICT (setting_key) DO NOTHING;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
-- Note: Adjust user permissions as needed for your GitHub Actions setup

SELECT 'GitHub Actions test database setup completed successfully!' as status;
