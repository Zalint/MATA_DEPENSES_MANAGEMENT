-- Script d'initialisation de la base de données PostgreSQL
-- Exécuter ce script pour créer les tables nécessaires

-- Table des utilisateurs (directeurs et directeur général)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('directeur', 'directeur_general', 'pca')),
    full_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des comptes permanents (plusieurs comptes possibles par directeur)
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table de l'historique des crédits (pour traçabilité)
CREATE TABLE IF NOT EXISTS credit_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    credited_by INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des catégories de dépenses
CREATE TABLE IF NOT EXISTS expense_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des dépenses
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES expense_categories(id),
    amount INTEGER NOT NULL,
    description TEXT NOT NULL,
    expense_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertion des catégories par défaut
INSERT INTO expense_categories (name, description) VALUES
('Transport', 'Frais de déplacement et transport'),
('Repas', 'Frais de restauration et repas d''affaires'),
('Fournitures', 'Matériel de bureau et fournitures'),
('Communication', 'Frais de téléphone et internet'),
('Formation', 'Frais de formation et développement'),
('Marketing', 'Frais publicitaires et marketing'),
('Maintenance', 'Frais de maintenance et réparation'),
('Autres', 'Autres dépenses diverses')
ON CONFLICT DO NOTHING;

-- Insertion d'utilisateurs de test
-- Mot de passe par défaut : "password123"
INSERT INTO users (username, password_hash, role, full_name) VALUES
('admin', '$2b$10$SE2wB4cc6BdbETwtj/l13.lViP8gE1FETPdz/.cu2IUu38lZWIFsK', 'directeur_general', 'Directeur Général'),
('pca', '$2b$10$SE2wB4cc6BdbETwtj/l13.lViP8gE1FETPdz/.cu2IUu38lZWIFsK', 'pca', 'Président du Conseil'),
('directeur1', '$2b$10$SE2wB4cc6BdbETwtj/l13.lViP8gE1FETPdz/.cu2IUu38lZWIFsK', 'directeur', 'Directeur Commercial'),
('directeur2', '$2b$10$SE2wB4cc6BdbETwtj/l13.lViP8gE1FETPdz/.cu2IUu38lZWIFsK', 'directeur', 'Directeur Technique'),
('directeur3', '$2b$10$SE2wB4cc6BdbETwtj/l13.lViP8gE1FETPdz/.cu2IUu38lZWIFsK', 'directeur', 'Directeur Marketing')
ON CONFLICT DO NOTHING;

-- NE PAS créer automatiquement les comptes
-- Les comptes seront créés par le directeur général via l'interface

-- Insertion des comptes de test avec noms
INSERT INTO accounts (user_id, account_name, current_balance, total_credited, total_spent, created_by, is_active) VALUES
(2, 'Compte Directeur Commercial', 75000, 100000, 25000, 1, true),
(3, 'Budget Formation & Développement', 45000, 50000, 5000, 1, true),
(4, 'Compte Directeur Technique', 30000, 80000, 50000, 1, true);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_history_account ON credit_history(account_id);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 