require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function recalculate() {
    const client = await pool.connect();
    try {
        console.log('🔄 Recalcul des totaux du compte MLC...\n');
        
        const result = await client.query('SELECT * FROM recalculate_special_accounts_totals()');
        
        console.log('📊 Résultats:\n');
        result.rows.forEach(row => {
            console.log(`Compte: ${row.account_name}`);
            console.log(`  Total dépensé: ${row.old_total_spent} → ${row.new_total_spent}`);
            console.log(`  Total crédité: ${row.old_total_credited} → ${row.new_total_credited}`);
            console.log(`  Solde: ${row.old_balance} → ${row.new_balance}`);
            console.log(`  Corrigé: ${row.corrected ? '✅ OUI' : '✓ Déjà bon'}\n`);
        });
        
        console.log('✅ Recalcul terminé! Rafraîchissez votre page.');
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

recalculate();
