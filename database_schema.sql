-- =====================================================
-- MATA GROUP - EXPENSE MANAGEMENT DATABASE SCHEMA
-- =====================================================
-- This file contains the complete database structure
-- for the Expense Management Application
-- =====================================================

-- Create database (if needed - usually done by Render)
-- CREATE DATABASE depenses_management;

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    email VARCHAR(100),
    role VARCHAR(20) NOT NULL CHECK (role IN ('directeur', 'directeur_general', 'pca')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index for non-empty emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique 
ON users (email) 
WHERE email IS NOT NULL AND email != '';

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
    description TEXT,
    account_type VARCHAR(20) DEFAULT 'classique' CHECK (account_type IN ('classique', 'partenaire', 'statut', 'Ajustement')),
    creditors TEXT, -- JSON string for creditor information
    category_type VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);

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
    predictable VARCHAR(10) CHECK (predictable IN ('oui', 'non')),
    description TEXT,
    expense_date DATE NOT NULL,
    justification_filename VARCHAR(255),
    justification_path VARCHAR(500),
    has_justification BOOLEAN DEFAULT false,
    is_selected BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type);

-- =====================================================
-- CREDIT HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    credited_by INTEGER REFERENCES users(id),
    credit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_credit_history_account_id ON credit_history(account_id);
CREATE INDEX IF NOT EXISTS idx_credit_history_date ON credit_history(credit_date);

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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_account_id ON partner_deliveries(account_id);
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_status ON partner_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_date ON partner_deliveries(delivery_date);

-- =====================================================
-- PARTNER DIRECTORS TABLE (for partner account assignments)
-- =====================================================
CREATE TABLE IF NOT EXISTS partner_directors (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'secondary' CHECK (role IN ('primary', 'secondary')),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_partner_directors_account_id ON partner_directors(account_id);
CREATE INDEX IF NOT EXISTS idx_partner_directors_user_id ON partner_directors(user_id);

-- =====================================================
-- EXPENSE CATEGORIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS expense_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_expense_categories_name ON expense_categories(name);

-- =====================================================
-- PARTNER ACCOUNT DIRECTORS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS partner_account_directors (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_partner_account_directors_account_id ON partner_account_directors(account_id);
CREATE INDEX IF NOT EXISTS idx_partner_account_directors_user_id ON partner_account_directors(user_id);

-- =====================================================
-- PARTNER EXPENSE VALIDATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS partner_expense_validations (
    id SERIAL PRIMARY KEY,
    expense_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
    validated_by INTEGER REFERENCES users(id),
    validation_type VARCHAR(20) NOT NULL,
    validation_comment TEXT,
    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_partner_expense_validations_expense_id ON partner_expense_validations(expense_id);
CREATE INDEX IF NOT EXISTS idx_partner_expense_validations_validated_by ON partner_expense_validations(validated_by);

-- =====================================================
-- WALLETS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    initial_amount NUMERIC(15,2) NOT NULL,
    current_balance NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_week_start_date ON wallets(week_start_date);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables with updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at 
    BEFORE UPDATE ON accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at 
    BEFORE UPDATE ON expenses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_partner_deliveries_updated_at 
    BEFORE UPDATE ON partner_deliveries 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INITIAL DATA INSERTION
-- =====================================================

-- Insert default users (passwords are hashed for 'password123')
INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES
('Ousmane', '$2b$10$SSE2wB4cc6BdbETwtj/I3.IVlP8gE1FETPdz/.cu2IUu38IZWlFsK', 'Ousmane SECK', 'directeur_general', true),
('Saliou', '$2b$10$SSE2wB4cc6BdbETwtj/I3.IVlP8gE1FETPdz/.cu2IUu38IZWlFsK', 'Saliou DOUCOURE', 'pca', true),
('Mame Diarra', '$2b$10$.7/ZBay.73jMCUX7B.iXNuC.IGIr.okJ9KItMAiB3.hw8WfbMV5I6i', 'Mame Diarra NDIAYE', 'directeur', true),
('Papi', '$2b$10$NMIB94SbU3rJFkWpQvin.uzcz./qnQYANPf74BpE.8eE/zrFSa...', 'Massata DIOP', 'directeur', true),
('Nadou', '$2b$10$tLNa6O0YXbMhrBXhKVGhbeCIY3.Ypm8RHTIMKRNHXUD97...', 'Nadou BA', 'directeur', true),
('Madieye', '$2b$10$Pch9g6yi9EC/bYTi9U2XbucvQnznmu.IkezJg3Zb1GvuDQpj0...', 'Madieye SECK', 'directeur', true),
('Babacar', '$2b$10$wRmPLJCL8aB242qONcddWumncIfQjyxDsjdKiiU2rlkS81Xq...', 'Babacar DIENE', 'directeur', true)
ON CONFLICT (username) DO NOTHING;

-- Create Ajustement account (special account for adjustments)
INSERT INTO accounts (account_name, account_type, description, is_active, created_by) 
SELECT 'Compte Ajustement', 'Ajustement', 'Compte spécial pour les ajustements comptables', true, u.id
FROM users u WHERE u.role = 'directeur_general' LIMIT 1
ON CONFLICT DO NOTHING;

-- =====================================================
-- VIEWS FOR REPORTING
-- =====================================================

-- View for partner delivery summary
CREATE OR REPLACE VIEW partner_delivery_summary AS
SELECT 
    a.id AS account_id,
    a.account_name,
    a.current_balance,
    a.total_credited,
    COALESCE(SUM(pd.amount), 0) as total_delivered,
    COUNT(pd.id) as total_articles,
    COUNT(pd.id) as delivery_count,
    COALESCE(SUM(CASE WHEN pd.status = 'pending' THEN pd.amount ELSE 0 END), 0) as pending_second_validation,
    COALESCE(SUM(CASE WHEN pd.status = 'rejected' THEN pd.amount ELSE 0 END), 0) as rejected_deliveries,
    (a.current_balance - COALESCE(SUM(pd.amount), 0)) as remaining_balance,
    CASE 
        WHEN a.total_credited > 0 THEN 
            ROUND((COALESCE(SUM(pd.amount), 0) * 100.0 / a.total_credited), 2)
        ELSE 0 
    END as delivery_percentage
FROM accounts a
LEFT JOIN partner_deliveries pd ON a.id = pd.account_id
WHERE a.account_type = 'partenaire'
GROUP BY a.id, a.account_name, a.current_balance, a.total_credited;

-- =====================================================
-- FUNCTIONS FOR BUSINESS LOGIC
-- =====================================================

-- Function to calculate account balance
CREATE OR REPLACE FUNCTION calculate_account_balance(account_id_param INTEGER)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    total_credited DECIMAL(15,2);
    total_spent DECIMAL(15,2);
    current_balance DECIMAL(15,2);
BEGIN
    -- Get total credited
    SELECT COALESCE(a.total_credited, 0) INTO total_credited
    FROM accounts a WHERE a.id = account_id_param;
    
    -- Get total spent
    SELECT COALESCE(SUM(e.total), 0) INTO total_spent
    FROM expenses e WHERE e.account_id = account_id_param;
    
    -- Calculate balance
    current_balance := total_credited - total_spent;
    
    -- Update account record
    UPDATE accounts 
    SET current_balance = current_balance, total_spent = total_spent
    WHERE id = account_id_param;
    
    RETURN current_balance;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SECURITY AND PERMISSIONS
-- =====================================================

-- Grant permissions (adjust as needed for your Render setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_render_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_render_user;

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_account_date ON expenses(account_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_type_category ON expenses(expense_type, category);

-- Full-text search indexes (if needed)
CREATE INDEX IF NOT EXISTS idx_expenses_designation_search ON expenses USING gin(to_tsvector('french', designation));
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_search ON expenses USING gin(to_tsvector('french', supplier));

-- =====================================================
-- MAINTENANCE QUERIES
-- =====================================================

-- Query to check database health
-- SELECT 
--     schemaname,
--     tablename,
--     attname,
--     n_distinct,
--     correlation
-- FROM pg_stats 
-- WHERE schemaname = 'public';

-- Query to check table sizes
-- SELECT 
--     schemaname,
--     tablename,
--     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
-- FROM pg_tables 
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- =====================================================
-- END OF SCHEMA
-- =====================================================

-- Verify installation
SELECT 'Database schema created successfully!' as status;

-- Table pour les opérations de remboursement/dette
CREATE TABLE IF NOT EXISTS remboursements (
    id SERIAL PRIMARY KEY,
    nom_client VARCHAR(255) NOT NULL,
    numero_tel VARCHAR(30) NOT NULL,
    date DATE NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('remboursement', 'dette')),
    commentaire TEXT,
    montant INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_remboursements_numero_tel ON remboursements(numero_tel);
CREATE INDEX IF NOT EXISTS idx_remboursements_date ON remboursements(date);

-- =====================================================
-- NEW TABLE FOR CREDIT PERMISSIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS account_credit_permissions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_credit_permissions_account ON account_credit_permissions(account_id);
CREATE INDEX IF NOT EXISTS idx_credit_permissions_user ON account_credit_permissions(user_id); 