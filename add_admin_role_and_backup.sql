-- MATA GROUP - ADD ADMIN ROLE AND ACCOUNT BACKUP SYSTEM
-- =====================================================
-- This script adds:
-- 1. Admin role (inherits directeur_general + delete/empty accounts)
-- 2. Account backup table for audit trail
-- 3. Functions for safe account deletion and emptying
-- =====================================================

-- 1. UPDATE USERS TABLE TO INCLUDE ADMIN ROLE
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'users_role_check' AND table_name = 'users') THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
    END IF;
    
    ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('directeur', 'directeur_general', 'pca', 'admin'));
END $$;

-- 2. CREATE ACCOUNT BACKUP TABLE
CREATE TABLE IF NOT EXISTS account_backups (
    id SERIAL PRIMARY KEY,
    account_name VARCHAR(100) NOT NULL,
    audit JSONB NOT NULL,
    backup_type VARCHAR(20) NOT NULL CHECK (backup_type IN ('DELETE', 'EMPTY')),
    backup_reason TEXT,
    original_account_id INTEGER,
    performed_by INTEGER REFERENCES users(id),
    backup_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    original_balance DECIMAL(15,2),
    original_total_credited DECIMAL(15,2),
    original_total_spent DECIMAL(15,2),
    movements_count INTEGER
);

CREATE INDEX IF NOT EXISTS idx_account_backups_name ON account_backups(account_name);
CREATE INDEX IF NOT EXISTS idx_account_backups_date ON account_backups(backup_date);
CREATE INDEX IF NOT EXISTS idx_account_backups_type ON account_backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_account_backups_performed_by ON account_backups(performed_by);
CREATE INDEX IF NOT EXISTS idx_account_backups_audit_gin ON account_backups USING gin(audit);

-- 3. FUNCTION TO GENERATE ACCOUNT AUDIT JSON
CREATE OR REPLACE FUNCTION generate_account_audit(account_id_param INTEGER)
RETURNS JSONB AS $$
DECLARE
    account_info JSONB;
    credit_history JSONB;
    expense_history JSONB;
    result JSONB;
BEGIN
    SELECT to_jsonb(a) INTO account_info
    FROM (
        SELECT id, user_id, account_name, current_balance, 
               total_credited, total_spent, description, 
               account_type, is_active, created_at
        FROM accounts WHERE id = account_id_param
    ) a;
    
    SELECT COALESCE(jsonb_agg(to_jsonb(ch)), '[]'::jsonb) INTO credit_history
    FROM (
        SELECT id, amount, description, credited_by, credit_date,
               (SELECT full_name FROM users WHERE id = credited_by) as credited_by_name
        FROM credit_history WHERE account_id = account_id_param
        ORDER BY credit_date DESC
    ) ch;
    
    SELECT COALESCE(jsonb_agg(to_jsonb(eh)), '[]'::jsonb) INTO expense_history
    FROM (
        SELECT id, user_id, expense_type, category, designation,
               supplier, total, expense_date, created_at,
               (SELECT full_name FROM users WHERE id = user_id) as user_name
        FROM expenses WHERE account_id = account_id_param
        ORDER BY expense_date DESC
    ) eh;
    
    result := jsonb_build_object(
        'account_info', account_info,
        'credit_history', credit_history,
        'expense_history', expense_history,
        'backup_timestamp', CURRENT_TIMESTAMP,
        'total_credits', (SELECT COUNT(*) FROM credit_history WHERE account_id = account_id_param),
        'total_expenses', (SELECT COUNT(*) FROM expenses WHERE account_id = account_id_param)
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. FUNCTION TO DELETE ACCOUNT WITH BACKUP
CREATE OR REPLACE FUNCTION admin_delete_account(
    account_id_param INTEGER,
    admin_user_id INTEGER,
    deletion_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    account_data RECORD;
    audit_json JSONB;
    backup_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = admin_user_id AND role IN ('admin', 'directeur_general', 'pca')) THEN
        RAISE EXCEPTION 'Only admin users can delete accounts';
    END IF;
    
    SELECT * INTO account_data FROM accounts WHERE id = account_id_param;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account with ID % not found', account_id_param;
    END IF;
    
    audit_json := generate_account_audit(account_id_param);
    
    INSERT INTO account_backups (
        account_name, audit, backup_type, backup_reason,
        original_account_id, performed_by, original_balance,
        original_total_credited, original_total_spent, movements_count
    ) VALUES (
        account_data.account_name, audit_json, 'DELETE', deletion_reason,
        account_id_param, admin_user_id, account_data.current_balance,
        account_data.total_credited, account_data.total_spent,
        (SELECT COUNT(*) FROM expenses WHERE account_id = account_id_param) +
        (SELECT COUNT(*) FROM credit_history WHERE account_id = account_id_param)
    ) RETURNING id INTO backup_id;
    
    DELETE FROM expenses WHERE account_id = account_id_param;
    DELETE FROM credit_history WHERE account_id = account_id_param;
    DELETE FROM accounts WHERE id = account_id_param;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account deleted and backed up',
        'backup_id', backup_id,
        'account_name', account_data.account_name
    );
END;
$$ LANGUAGE plpgsql;

-- 5. FUNCTION TO EMPTY ACCOUNT WITH BACKUP
CREATE OR REPLACE FUNCTION admin_empty_account(
    account_id_param INTEGER,
    admin_user_id INTEGER,
    empty_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    account_data RECORD;
    audit_json JSONB;
    backup_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = admin_user_id AND role IN ('admin', 'directeur_general', 'pca')) THEN
        RAISE EXCEPTION 'Only admin users can empty accounts';
    END IF;
    
    SELECT * INTO account_data FROM accounts WHERE id = account_id_param;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account with ID % not found', account_id_param;
    END IF;
    
    audit_json := generate_account_audit(account_id_param);
    
    INSERT INTO account_backups (
        account_name, audit, backup_type, backup_reason,
        original_account_id, performed_by, original_balance,
        original_total_credited, original_total_spent, movements_count
    ) VALUES (
        account_data.account_name, audit_json, 'EMPTY', empty_reason,
        account_id_param, admin_user_id, account_data.current_balance,
        account_data.total_credited, account_data.total_spent,
        (SELECT COUNT(*) FROM expenses WHERE account_id = account_id_param) +
        (SELECT COUNT(*) FROM credit_history WHERE account_id = account_id_param)
    ) RETURNING id INTO backup_id;
    
    UPDATE accounts SET
        current_balance = 0,
        total_credited = 0,
        total_spent = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = account_id_param;
    
    DELETE FROM credit_history WHERE account_id = account_id_param;
    DELETE FROM expenses WHERE account_id = account_id_param;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account emptied and backed up',
        'backup_id', backup_id,
        'account_name', account_data.account_name,
        'previous_balance', account_data.current_balance
    );
END;
$$ LANGUAGE plpgsql;

-- 6. CREATE ADMIN USER (Password: admin123)
INSERT INTO users (
    username, password_hash, full_name, email, role, is_active
) VALUES (
    'admin',
    '$2b$10$K7ZMxWDrQqjQvIcQn6l2iuwJZ8CQFuE1QcP7Aw5KZt8NYqO2xvZzS',
    'Administrateur Système',
    'admin@matagroup.com',
    'admin',
    true
) ON CONFLICT (username) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name;

-- 7. CREATE VIEW FOR BACKUP MANAGEMENT
CREATE OR REPLACE VIEW account_backup_summary AS
SELECT 
    ab.id,
    ab.account_name,
    ab.backup_type,
    ab.backup_reason,
    ab.backup_date,
    ab.original_balance,
    ab.movements_count,
    u.full_name as performed_by_name,
    EXTRACT(days FROM (CURRENT_TIMESTAMP - ab.backup_date)) as days_since_backup
FROM account_backups ab
LEFT JOIN users u ON ab.performed_by = u.id
ORDER BY ab.backup_date DESC;

-- 8. VERIFICATION
SELECT 'Admin system created successfully!' as message,
       'Username: admin, Password: admin123' as login_info;
