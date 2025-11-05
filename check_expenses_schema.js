const { Pool } = require('pg');

const pool = new Pool({
    user: 'zalint',
    host: 'localhost',
    database: 'depenses_management_preprod',
    password: 'bonea2024',
    port: 5432
});

async function checkSchema() {
    try {
        const result = await pool.query(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'expenses' ORDER BY ordinal_position"
        );
        
        console.log('Colonnes de la table expenses:');
        result.rows.forEach(r => {
            console.log(`  - ${r.column_name}: ${r.data_type}`);
        });
        
    } catch (err) {
        console.error('Erreur:', err);
    } finally {
        await pool.end();
    }
}

checkSchema();
