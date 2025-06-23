const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'mata_expenses_test_db',
    user: process.env.DB_USER || 'zalint',
    password: process.env.DB_PASSWORD || 'bonea2024'
});

async function initTestDatabase() {
    try {
        // Créer les tables nécessaires
        await pool.query(`
            -- Table des utilisateurs
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL CHECK (role IN ('directeur', 'directeur_general', 'pca', 'admin')),
                full_name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Table des comptes
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
                account_type VARCHAR(20) DEFAULT 'classique'
            );

            -- Table des dépenses
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
                selected_for_invoice BOOLEAN DEFAULT false
            );

            -- Table de l'historique des crédits
            CREATE TABLE IF NOT EXISTS credit_history (
                id SERIAL PRIMARY KEY,
                account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
                credited_by INTEGER REFERENCES users(id),
                amount INTEGER NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Table de l'historique des transferts
            CREATE TABLE IF NOT EXISTS transfer_history (
                id SERIAL PRIMARY KEY,
                source_id INTEGER REFERENCES accounts(id),
                destination_id INTEGER REFERENCES accounts(id),
                montant INTEGER NOT NULL,
                transferred_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        console.log('Base de données de test initialisée avec succès !');
    } catch (error) {
        console.error('Erreur lors de l\'initialisation de la base de données:', error);
    } finally {
        await pool.end();
    }
}

initTestDatabase(); 