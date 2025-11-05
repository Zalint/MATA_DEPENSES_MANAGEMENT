const { Pool } = require('pg');

const pool = new Pool({
    user: 'zalint',
    host: 'localhost',
    database: 'depenses_management_preprod',
    password: 'bonea2024',
    port: 5432
});

async function analyzeMLC() {
    try {
        console.log('🔍 ANALYSE COMPTE MLC (ID: 1605)\n');
        
        // Infos du compte
        const account = await pool.query(
            'SELECT * FROM accounts WHERE id = 1605'
        );
        
        console.log('=== INFORMATIONS DU COMPTE ===');
        console.log('Nom:', account.rows[0].account_name);
        console.log('Type:', account.rows[0].account_type);
        console.log('Solde actuel:', account.rows[0].current_balance);
        console.log('Total crédité:', account.rows[0].total_credited);
        console.log('Total dépensé:', account.rows[0].total_spent);
        console.log('Initial balance:', account.rows[0].initial_balance);
        console.log('Créé le:', account.rows[0].created_at);
        
        // Historique des crédits
        const credits = await pool.query(
            'SELECT * FROM special_credit_history WHERE account_id = 1605 ORDER BY created_at'
        );
        
        console.log('\n=== HISTORIQUE DES CRÉDITS ===');
        console.log('Nombre de crédits:', credits.rows.length);
        credits.rows.forEach((c, i) => {
            console.log(`\nCrédit ${i+1}:`);
            console.log('  ID:', c.id);
            console.log('  Montant:', c.amount);
            console.log('  Commentaire:', c.comment);
            console.log('  Date:', c.created_at);
        });
        
        const sumCredits = await pool.query(
            'SELECT COALESCE(SUM(amount), 0) as total FROM special_credit_history WHERE account_id = 1605'
        );
        console.log('\nTotal crédits (calculé):', sumCredits.rows[0].total);
        
        // Historique des dépenses
        const expenses = await pool.query(
            'SELECT * FROM expenses WHERE account_id = 1605 ORDER BY created_at'
        );
        
        console.log('\n=== HISTORIQUE DES DÉPENSES ===');
        console.log('Nombre de dépenses:', expenses.rows.length);
        expenses.rows.forEach((e, i) => {
            console.log(`\nDépense ${i+1}:`);
            console.log('  ID:', e.id);
            console.log('  Montant:', e.amount);
            console.log('  Description:', e.description);
            console.log('  Date:', e.expense_date);
            console.log('  Créé le:', e.created_at);
        });
        
        const sumExpenses = await pool.query(
            'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE account_id = 1605'
        );
        console.log('\nTotal dépenses (calculé):', sumExpenses.rows[0].total);
        
        // Calcul du solde attendu
        const initialBalance = parseFloat(account.rows[0].initial_balance || 0);
        const totalCredits = parseFloat(sumCredits.rows[0].total);
        const totalExpenses = parseFloat(sumExpenses.rows[0].total);
        
        console.log('\n=== CALCUL DU SOLDE ===');
        console.log('Initial balance:', initialBalance);
        console.log('+ Total crédits:', totalCredits);
        console.log('- Total dépenses:', totalExpenses);
        console.log('= Solde attendu:', initialBalance + totalCredits - totalExpenses);
        console.log('Solde en base:', parseFloat(account.rows[0].current_balance));
        
        const diff = parseFloat(account.rows[0].current_balance) - (initialBalance + totalCredits - totalExpenses);
        console.log('\nDifférence:', diff);
        
    } catch (err) {
        console.error('❌ Erreur:', err);
    } finally {
        await pool.end();
    }
}

analyzeMLC();
