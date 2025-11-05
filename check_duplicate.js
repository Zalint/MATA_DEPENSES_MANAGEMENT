const { Pool } = require('pg');

const pool = new Pool({
    user: 'zalint',
    host: 'localhost',
    database: 'depenses_management_preprod',
    password: 'bonea2024',
    port: 5432
});

async function checkDuplicate() {
    try {
        const result = await pool.query(
            'SELECT id, amount, description, expense_date, created_at FROM expenses WHERE account_id = 1605 AND amount = 75000 ORDER BY created_at DESC'
        );
        
        console.log('Nombre de lignes trouvées:', result.rows.length);
        
        result.rows.forEach((row, i) => {
            console.log(`\nEnregistrement ${i+1}:`);
            console.log('  ID:', row.id);
            console.log('  Montant:', row.amount);
            console.log('  Description:', row.description);
            console.log('  Date dépense:', row.expense_date);
            console.log('  Créé le:', row.created_at);
        });
        
        // Vérifier le total_spent du compte
        const accountResult = await pool.query(
            'SELECT current_balance, total_spent, total_credited FROM accounts WHERE id = 1605'
        );
        
        console.log('\n--- Totaux du compte MLC (ID: 1605) ---');
        console.log('Solde actuel:', accountResult.rows[0].current_balance);
        console.log('Total dépensé:', accountResult.rows[0].total_spent);
        console.log('Total crédité:', accountResult.rows[0].total_credited);
        
        // Calculer la somme réelle des dépenses
        const sumResult = await pool.query(
            'SELECT COALESCE(SUM(amount), 0) as sum_expenses FROM expenses WHERE account_id = 1605'
        );
        
        console.log('\n--- Vérification ---');
        console.log('Somme réelle des dépenses:', sumResult.rows[0].sum_expenses);
        console.log('Différence avec total_spent:', parseFloat(accountResult.rows[0].total_spent) - parseFloat(sumResult.rows[0].sum_expenses));
        
    } catch (err) {
        console.error('Erreur:', err);
    } finally {
        await pool.end();
    }
}

checkDuplicate();
