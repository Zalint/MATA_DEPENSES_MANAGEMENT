const { Pool } = require('pg');

const pool = new Pool({
    user: 'zalint',
    host: 'localhost',
    database: 'depenses_management_preprod',
    password: 'bonea2024',
    port: 5432
});

async function fixTotals() {
    try {
        console.log('🔧 CORRECTION: Début du recalcul des totaux...');
        
        // Lancer la fonction de recalcul
        const result = await pool.query('SELECT recalculate_special_accounts_totals()');
        const recalcData = result.rows[0].recalculate_special_accounts_totals;
        
        console.log('\n✅ CORRECTION: Recalcul terminé!');
        console.log(JSON.stringify(recalcData, null, 2));
        
        // Vérifier à nouveau le compte MLC
        console.log('\n--- Vérification post-correction compte MLC ---');
        const accountCheck = await pool.query(
            'SELECT current_balance, total_spent, total_credited FROM accounts WHERE id = 1605'
        );
        
        const sumExpenses = await pool.query(
            'SELECT COALESCE(SUM(amount), 0) as sum_expenses FROM expenses WHERE account_id = 1605'
        );
        
        const sumCredits = await pool.query(
            'SELECT COALESCE(SUM(amount), 0) as sum_credits FROM special_credit_history WHERE account_id = 1605'
        );
        
        console.log('Solde actuel:', accountCheck.rows[0].current_balance);
        console.log('Total dépensé (base):', accountCheck.rows[0].total_spent);
        console.log('Total crédité (base):', accountCheck.rows[0].total_credited);
        console.log('Somme réelle dépenses:', sumExpenses.rows[0].sum_expenses);
        console.log('Somme réelle crédits:', sumCredits.rows[0].sum_credits);
        
        const expectedBalance = parseFloat(sumCredits.rows[0].sum_credits) - parseFloat(sumExpenses.rows[0].sum_expenses);
        console.log('\nSolde attendu:', expectedBalance);
        console.log('Solde actuel:', parseFloat(accountCheck.rows[0].current_balance));
        console.log('Cohérent:', expectedBalance === parseFloat(accountCheck.rows[0].current_balance) ? '✅' : '❌');
        
    } catch (err) {
        console.error('❌ Erreur:', err);
    } finally {
        await pool.end();
    }
}

fixTotals();
