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
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    delivery_date DATE NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'first_validated', 'fully_validated', 'rejected')),
    validated_by INTEGER REFERENCES users(id),
    validation_date TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- Function to synchronize a single account
CREATE OR REPLACE FUNCTION force_sync_account(account_id_param INTEGER)
RETURNS JSON AS $$
DECLARE
    account_type_val VARCHAR(20);
    total_credited_calc INTEGER;
    total_spent_calc INTEGER;
    transfer_net_calc INTEGER;
    current_balance_calc INTEGER;
    old_balance INTEGER;
    account_name_val VARCHAR(100);
BEGIN
    -- Get account info
    SELECT account_type, current_balance, account_name 
    INTO account_type_val, old_balance, account_name_val
    FROM accounts WHERE id = account_id_param;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'status', 'error',
            'message', 'Account not found',
            'account_id', account_id_param
        );
    END IF;
    
    -- Calculate total credited
    SELECT COALESCE(SUM(amount), 0) INTO total_credited_calc
    FROM credit_history WHERE account_id = account_id_param;
    
    -- Add special credits
    total_credited_calc := total_credited_calc + COALESCE((
        SELECT SUM(amount) FROM special_credit_history 
        WHERE account_id = account_id_param
    ), 0);
    
    -- Calculate total spent
    SELECT COALESCE(SUM(total), 0) INTO total_spent_calc
    FROM expenses WHERE account_id = account_id_param;
    
    -- Calculate net transfers
    SELECT COALESCE(
        (SELECT SUM(montant) FROM transfer_history WHERE destination_id = account_id_param) -
        (SELECT SUM(montant) FROM transfer_history WHERE source_id = account_id_param),
        0
    ) INTO transfer_net_calc;
    
    -- Calculate new balance based on account type
    IF account_type_val = 'partenaire' THEN
        -- For partner accounts: total_credited - validated deliveries
        SELECT total_credited_calc - COALESCE(SUM(amount), 0) INTO current_balance_calc
        FROM partner_deliveries 
        WHERE account_id = account_id_param AND status = 'fully_validated';
    ELSE
        -- For other accounts: credited - spent + transfers
        current_balance_calc := total_credited_calc - total_spent_calc + transfer_net_calc;
    END IF;
    
    -- Update the account
    UPDATE accounts 
    SET 
        current_balance = current_balance_calc,
        total_credited = total_credited_calc,
        total_spent = total_spent_calc,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = account_id_param;
    
    RETURN json_build_object(
        'status', 'success',
        'account_id', account_id_param,
        'account_name', account_name_val,
        'old_balance', old_balance,
        'new_balance', current_balance_calc,
        'total_credited', total_credited_calc,
        'total_spent', total_spent_calc,
        'transfer_net', transfer_net_calc,
        'balance_changed', (old_balance != current_balance_calc)
    );
END;
$$ LANGUAGE plpgsql;

-- Function to synchronize all accounts
CREATE OR REPLACE FUNCTION force_sync_all_accounts_simple()
RETURNS JSON AS $$
DECLARE
    account_record RECORD;
    total_accounts INTEGER := 0;
    total_corrected INTEGER := 0;
    sync_result JSON;
BEGIN
    -- Count total accounts
    SELECT COUNT(*) INTO total_accounts FROM accounts WHERE is_active = true;
    
    -- Loop through all active accounts
    FOR account_record IN 
        SELECT id FROM accounts WHERE is_active = true ORDER BY id
    LOOP
        -- Sync each account
        SELECT force_sync_account(account_record.id) INTO sync_result;
        
        -- Check if balance was changed
        IF (sync_result->>'balance_changed')::boolean THEN
            total_corrected := total_corrected + 1;
        END IF;
    END LOOP;
    
    RETURN json_build_object(
        'status', 'success',
        'total_accounts', total_accounts,
        'total_corrected', total_corrected,
        'sync_date', CURRENT_TIMESTAMP
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
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
