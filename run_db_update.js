const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'depenses_management',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432
});

async function executeSQL() {
    try {
        const sql = fs.readFileSync('add_decote_column.sql', 'utf8');
        
        // Exécuter les commandes SQL
        await pool.query(sql);
        
        console.log('✅ La colonne decote a été ajoutée avec succès');
        console.log('✅ Les totaux ont été mis à jour');
        
    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour de la base de données:', error);
    } finally {
        await pool.end();
    }
}

executeSQL(); 