const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'depenses_management',
    user: process.env.DB_USER || 'zalint',
    password: process.env.DB_PASSWORD || 'bonea2024'
});

async function createTestDatabase() {
    try {
        // Se déconnecter de toutes les connexions à la base de test si elle existe
        await pool.query(`
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '${process.env.DB_NAME || 'mata_expenses_test_db'}'
            AND pid <> pg_backend_pid();
        `);

        // Supprimer la base de test si elle existe
        await pool.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME || 'mata_expenses_test_db'};`);
        
        // Créer la nouvelle base de test
        await pool.query(`CREATE DATABASE ${process.env.DB_NAME || 'mata_expenses_test_db'};`);
        
        console.log('Base de données de test créée avec succès !');
    } catch (error) {
        console.error('Erreur lors de la création de la base de données:', error);
    } finally {
        await pool.end();
    }
}

createTestDatabase(); 