const { Pool } = require('pg');

const pool = new Pool({
    user: 'zalint',
    host: 'localhost',
    database: 'depenses_management_preprod',
    password: 'bonea2024',
    port: 5432
});

async function manualFix() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log('🔧 CORRECTION MANUELLE DU COMPTE MLC\n');
        
        // Calculer les vrais totaux
        const expenses = await client.query(
            'SELECT COALESCE(SUM(total), 0) as sum_expenses FROM expenses WHERE account_id = 1605'
        );
        
        const credits = await client.query(
            'SELECT COALESCE(SUM(amount), 0) as sum_credits FROM special_credit_history WHERE account_id = 1605'
        );
        
        const totalExpenses = parseFloat(expenses.rows[0].sum_expenses);
        const totalCredits = parseFloat(credits.rows[0].sum_credits);
        const balance = totalCredits - totalExpenses;
        
        console.log('Valeurs calculées:');
        console.log('  Total dépensé:', totalExpenses);
        console.log('  Total crédité:', totalCredits);
        console.log('  Solde:', balance);
        
        // Mettre à jour le compte
        await client.query(`
            UPDATE accounts
            SET 
                total_spent = $1,
                total_credited = $2,
                current_balance = $3
            WHERE id = 1605
        `, [totalExpenses, totalCredits, balance]);
        
        await client.query('COMMIT');
        
        console.log('\n✅ Correction appliquée avec succès!');
        
        // Vérifier
        const check = await client.query(
            'SELECT current_balance, total_spent, total_credited FROM accounts WHERE id = 1605'
        );
        
        console.log('\n--- Vérification post-correction ---');
        console.log('Solde:', check.rows[0].current_balance);
        console.log('Total dépensé:', check.rows[0].total_spent);
        console.log('Total crédité:', check.rows[0].total_credited);
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

manualFix();
