-- =====================================================
-- MATA GROUP - RENDER.COM VOLAILLE DATABASE SCHEMA SCRIPT
-- =====================================================
-- Script adapté spécialement pour votre base Render.com
-- Base: depenses_management_volaille_prod
-- User: depenses_management_volaille_prod_user
-- Host: dpg-d3d951buibrs738fknpg-a.frankfurt-postgres.render.com
-- =====================================================
-- 
-- UTILISATION DIRECTE :
-- 1. Connectez-vous à votre base Render.com via interface PostgreSQL
-- 2. Copiez-collez et exécutez ce script complet
-- 3. Connectez-vous à l'app avec : admin/admin123
-- 
-- ⚠️  IMPORTANT : Ce script est optimisé pour Render.com
--    - L'utilisateur DB existe déjà (géré par Render)
--    - Les permissions sont adaptées aux contraintes Render
--    - Toutes les tables seront créées vides
-- =====================================================

-- =====================================================
-- EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    email VARCHAR(100),
    role VARCHAR(20) NOT NULL CHECK (role IN ('directeur', 'directeur_general', 'pca', 'admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ACCOUNTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    account_name VARCHAR(100) NOT NULL,
    current_balance DECIMAL(15,2) DEFAULT 0,
    total_credited DECIMAL(15,2) DEFAULT 0,
    total_spent DECIMAL(15,2) DEFAULT 0,
    transfert_entrants DECIMAL(15,2) DEFAULT 0,
    transfert_sortants DECIMAL(15,2) DEFAULT 0,
    description TEXT,
    account_type VARCHAR(20) DEFAULT 'classique' CHECK (account_type IN ('classique', 'partenaire', 'statut', 'creance', 'depot', 'Ajustement')),
    creditors TEXT,
    category_type VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    access_restricted BOOLEAN DEFAULT false,
    allowed_roles TEXT[],
    can_credit_users INTEGER[]
);

-- =====================================================
-- EXPENSES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    expense_type VARCHAR(50),
    category VARCHAR(100),
    subcategory VARCHAR(100),
    social_network_detail VARCHAR(50),
    designation TEXT NOT NULL,
    supplier VARCHAR(100),
    quantity DECIMAL(10,2),
    unit_price DECIMAL(15,2),
    total DECIMAL(15,2) NOT NULL,
    amount DECIMAL(15,2),
    predictable VARCHAR(10) CHECK (predictable IN ('oui', 'non')),
    description TEXT,
    expense_date DATE NOT NULL,
    justification_filename VARCHAR(255),
    justification_path VARCHAR(500),
    has_justification BOOLEAN DEFAULT false,
    is_selected BOOLEAN DEFAULT false,
    selected_for_invoice BOOLEAN DEFAULT false,
    validation_status VARCHAR(20) DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'rejected', 'fully_validated')),
    requires_validation BOOLEAN DEFAULT false,
    is_partner_expense BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CREDIT HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    credited_by INTEGER REFERENCES users(id),
    credit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- SPECIAL CREDIT HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS special_credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    credited_by INTEGER REFERENCES users(id),
    amount DECIMAL(15,2) NOT NULL,
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
    montant DECIMAL(15,2) NOT NULL,
    transferred_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PARTNER DELIVERIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS partner_deliveries (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    delivery_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'first_validated', 'validated', 'rejected')),
    validated_by INTEGER REFERENCES users(id),
    validation_date TIMESTAMP,
    rejection_reason TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unit_price DECIMAL(15,2),
    article_count INTEGER,
    is_validated BOOLEAN DEFAULT false,
    validated_at TIMESTAMP,
    validation_status VARCHAR(255) DEFAULT 'pending' CHECK (validation_status IN ('pending', 'first_validated', 'validated', 'rejected', 'fully_validated')),
    first_validated_by INTEGER,
    first_validated_at TIMESTAMP,
    rejection_comment TEXT,
    rejected_by INTEGER,
    rejected_at TIMESTAMP
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
-- DASHBOARD SNAPSHOTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS dashboard_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    total_spent_amount DECIMAL(15,2) DEFAULT 0,
    total_remaining_amount DECIMAL(15,2) DEFAULT 0,
    total_credited_with_expenses DECIMAL(15,2) DEFAULT 0,
    total_credited_general DECIMAL(15,2) DEFAULT 0,
    cash_bictorys_amount DECIMAL(15,2) DEFAULT 0,
    creances_total DECIMAL(15,2) DEFAULT 0,
    creances_mois DECIMAL(15,2) DEFAULT 0,
    livraisons_partenaires DECIMAL(15,2) DEFAULT 0,
    stock_point_vente DECIMAL(15,2) DEFAULT 0,
    stock_vivant_total DECIMAL(15,2) DEFAULT 0,
    stock_vivant_variation DECIMAL(15,2) DEFAULT 0,
    daily_burn DECIMAL(15,2) DEFAULT 0,
    weekly_burn DECIMAL(15,2) DEFAULT 0,
    monthly_burn DECIMAL(15,2) DEFAULT 0,
    solde_depot DECIMAL(15,2) DEFAULT 0,
    solde_partner DECIMAL(15,2) DEFAULT 0,
    solde_general DECIMAL(15,2) DEFAULT 0,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    UNIQUE(snapshot_date)
);

-- =====================================================
-- PARTNER DIRECTORS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS partner_directors (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'secondary' CHECK (role IN ('primary', 'secondary')),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, user_id)
);

-- =====================================================
-- CREANCE CLIENTS TABLE
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
-- CREANCE OPERATIONS TABLE
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
-- STOCK TABLES
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

CREATE TABLE IF NOT EXISTS stock_mata (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    point_de_vente VARCHAR(100) NOT NULL,
    produit VARCHAR(100) NOT NULL,
    stock_matin DECIMAL(12,2) DEFAULT 0.00,
    stock_soir DECIMAL(12,2) DEFAULT 0.00,
    transfert DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (date, point_de_vente, produit)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_credit_history_account_id ON credit_history(account_id);
CREATE INDEX IF NOT EXISTS idx_transfer_history_source ON transfer_history(source_id);
CREATE INDEX IF NOT EXISTS idx_transfer_history_dest ON transfer_history(destination_id);

-- =====================================================
-- BUSINESS FUNCTIONS (Simplified for Render.com)
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at 
    BEFORE UPDATE ON accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at 
    BEFORE UPDATE ON expenses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ESSENTIAL VIEWS
-- =====================================================

-- Account summary view
CREATE OR REPLACE VIEW account_balances_summary AS
SELECT 
    a.id,
    a.account_name,
    a.account_type,
    a.current_balance,
    a.total_credited,
    a.total_spent,
    u.full_name as owner_name,
    a.is_active,
    a.created_at
FROM accounts a
LEFT JOIN users u ON a.user_id = u.id
ORDER BY a.account_type, a.account_name;

-- =====================================================
-- INITIAL DATA (ADMIN USER AND SETTINGS)
-- =====================================================

-- Insert default admin user (password: Mata@2024!)
INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES
('admin', '$2b$10$WQFplng6uPpcfw3hM45uueeJ6ySmABdfFXj4TQ4SnUxIhKWs1VZf6', 'Administrateur Système', 'admin', true)
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

-- Insert essential financial settings
INSERT INTO financial_settings (setting_key, setting_value) VALUES
('validate_expenses', 'true'),
('default_currency', 'FCFA'),
('max_expense_amount', '10000000'),
('system_initialized', 'true')
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value;

-- =====================================================
-- ADDITIONAL PRODUCTION FIXES
-- =====================================================

-- Add account_type column to special_credit_history if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'special_credit_history' 
        AND column_name = 'account_type'
    ) THEN
        ALTER TABLE special_credit_history 
        ADD COLUMN account_type VARCHAR(50) DEFAULT 'classique';
        RAISE NOTICE '✅ Added account_type column to special_credit_history';
    END IF;
END $$;

-- Add decote column to stock tables if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stock_mata' 
        AND column_name = 'decote'
    ) THEN
        ALTER TABLE stock_mata ADD COLUMN decote NUMERIC(15,2) DEFAULT 0;
        RAISE NOTICE '✅ Added decote column to stock_mata';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stock_vivant' 
        AND column_name = 'decote'
    ) THEN
        ALTER TABLE stock_vivant ADD COLUMN decote NUMERIC(15,2) DEFAULT 0;
        RAISE NOTICE '✅ Added decote column to stock_vivant';
    END IF;
END $$;

-- Create montant_debut_mois table if not exists
CREATE TABLE IF NOT EXISTS montant_debut_mois (
    id SERIAL PRIMARY KEY,
    mois DATE NOT NULL UNIQUE,
    montant NUMERIC(15,2) NOT NULL DEFAULT 0,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_montant_debut_mois_mois ON montant_debut_mois(mois);

-- Create trigger for montant_debut_mois
DROP TRIGGER IF EXISTS trig_montant_debut_mois_updated_at ON montant_debut_mois;
CREATE TRIGGER trig_montant_debut_mois_updated_at
    BEFORE UPDATE ON montant_debut_mois
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create can_user_credit_account function
CREATE OR REPLACE FUNCTION can_user_credit_account(user_id_param INTEGER, account_id_param INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    account_info RECORD;
BEGIN
    SELECT role INTO user_role FROM users WHERE id = user_id_param AND is_active = true;
    IF user_role IS NULL THEN RETURN FALSE; END IF;
    
    SELECT account_type, access_restricted, allowed_roles, can_credit_users, created_by
    INTO account_info FROM accounts WHERE id = account_id_param AND is_active = true;
    IF account_info IS NULL THEN RETURN FALSE; END IF;
    
    -- Admin and PCA can credit everything
    IF user_role IN ('admin', 'pca') THEN RETURN TRUE; END IF;
    
    -- Director general can credit all accounts
    IF user_role = 'directeur_general' THEN RETURN TRUE; END IF;
    
    -- Account creator can always credit
    IF account_info.created_by = user_id_param THEN RETURN TRUE; END IF;
    
    -- Check access restrictions
    IF account_info.access_restricted = true THEN
        IF account_info.allowed_roles IS NOT NULL AND 
           user_role = ANY(account_info.allowed_roles) THEN RETURN TRUE; END IF;
        IF account_info.can_credit_users IS NOT NULL AND 
           user_id_param = ANY(account_info.can_credit_users) THEN RETURN TRUE; END IF;
        RETURN FALSE;
    END IF;
    
    -- Partner accounts: directors and above only
    IF account_info.account_type = 'partenaire' THEN
        RETURN user_role IN ('directeur', 'directeur_general', 'admin', 'pca');
    END IF;
    
    -- Classic accounts: directors and above
    RETURN user_role IN ('directeur', 'directeur_general', 'admin', 'pca');
END;
$$ LANGUAGE plpgsql;

-- Create calculate_account_balance function
CREATE OR REPLACE FUNCTION calculate_account_balance(account_id_param INTEGER)
RETURNS NUMERIC AS $$
DECLARE
    total_credited NUMERIC := 0;
    total_spent NUMERIC := 0;
    transfert_entrants NUMERIC := 0;
    transfert_sortants NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO total_credited FROM credit_history WHERE account_id = account_id_param;
    SELECT COALESCE(SUM(amount), 0) INTO total_spent FROM expenses WHERE account_id = account_id_param;
    SELECT COALESCE(SUM(montant), 0) INTO transfert_entrants FROM transfer_history WHERE destination_id = account_id_param;
    SELECT COALESCE(SUM(montant), 0) INTO transfert_sortants FROM transfer_history WHERE source_id = account_id_param;
    
    RETURN total_credited + transfert_entrants - total_spent - transfert_sortants;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
SELECT 
    '🎉 RENDER.COM VOLAILLE DATABASE SCHEMA COMPLETED!' as message,
    'Admin user: admin/Mata@2024!' as login_info,
    'Database: depenses_management_volaille_prod' as database_name,
    'Host: dpg-d3d951buibrs738fknpg-a.frankfurt-postgres.render.com' as host,
    'Schema: COMPLETE with all production fixes!' as status;

-- =====================================================
-- END OF RENDER.COM VOLAILLE OPTIMIZED SCRIPT
-- =====================================================
