-- =====================================================
-- SCRIPT SQL EXEMPLE - PRÊT À UTILISER DIRECTEMENT
-- =====================================================
-- Configuration par défaut :
--   - Base de données : ma_compta_db
--   - Utilisateur DB  : compta_user
--   - Mot de passe    : MonMotDePasse123
--   - Admin app      : admin/admin123
-- 
-- UTILISATION DIRECTE :
-- 1. Créer une base nommée "ma_compta_db" 
-- 2. Exécuter ce script dans cette base
-- 3. Se connecter avec admin/admin123
-- =====================================================

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Table des utilisateurs
CREATE TABLE users (
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

-- Table des comptes
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    account_name VARCHAR(100) NOT NULL,
    current_balance DECIMAL(15,2) DEFAULT 0,
    total_credited DECIMAL(15,2) DEFAULT 0,
    total_spent DECIMAL(15,2) DEFAULT 0,
    transfert_entrants DECIMAL(15,2) DEFAULT 0,
    transfert_sortants DECIMAL(15,2) DEFAULT 0,
    description TEXT,
    account_type VARCHAR(20) DEFAULT 'classique',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des dépenses
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    designation TEXT NOT NULL,
    supplier VARCHAR(100),
    total DECIMAL(15,2) NOT NULL,
    expense_date DATE NOT NULL,
    expense_type VARCHAR(50),
    category VARCHAR(100),
    validation_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Historique des crédits
CREATE TABLE credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    credited_by INTEGER REFERENCES users(id),
    credit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Paramètres financiers
CREATE TABLE financial_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Créer l'utilisateur de base de données
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'compta_user') THEN
        CREATE ROLE compta_user WITH LOGIN PASSWORD 'MonMotDePasse123';
    END IF;
END $$;

-- Accorder les permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO compta_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO compta_user;
GRANT USAGE ON SCHEMA public TO compta_user;

-- Insérer l'utilisateur admin par défaut
INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES
('admin', '$2b$10$bsTWy5Rw8P3F4wBywmtgGOCQN5Qr3HbpW16RXQ4lUUEkfhyNbzNuC', 'Administrateur Système', 'admin', true)
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

-- Insérer les paramètres essentiels
INSERT INTO financial_settings (setting_key, setting_value) VALUES
('validate_expenses', 'true'),
('default_currency', 'FCFA'),
('system_initialized', 'true')
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value;

-- Message de succès
SELECT 
    '🎉 BASE DE DONNÉES CRÉÉE AVEC SUCCÈS !' as message,
    'Utilisateur admin créé : admin/admin123' as connexion,
    'Base configurée pour : ma_compta_db' as base_name;

-- =====================================================
-- FIN DU SCRIPT EXEMPLE
-- =====================================================
