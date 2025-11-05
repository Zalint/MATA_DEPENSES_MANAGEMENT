require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function checkMLC() {
    const client = await pool.connect();
    try {
        // Récupérer l'ID du compte MLC
        const accountResult = await client.query(
            "SELECT id, account_name, total_spent, current_balance FROM accounts WHERE account_name = 'MLC' AND account_type = 'special'"
        );
        
        if (accountResult.rows.length === 0) {
            console.log('❌ Compte MLC non trouvé');
            return;
        }
        
        const account = accountResult.rows[0];
        console.log('\n📊 État du compte MLC:');
        console.log(`   ID: ${account.id}`);
        console.log(`   Total dépensé enregistré: ${account.total_spent} FCFA`);
        console.log(`   Solde actuel: ${account.current_balance} FCFA\n`);
        
        // Récupérer toutes les dépenses
        const expensesResult = await client.query(
            'SELECT id, expense_date, description, designation, amount, total FROM expenses WHERE account_id = $1 ORDER BY expense_date, created_at',
            [account.id]
        );
        
        console.log('💰 Dépenses trouvées:');
        let realTotal = 0;
        expensesResult.rows.forEach((expense, index) => {
            const amount = expense.total || expense.amount;
            realTotal += parseInt(amount);
            console.log(`   ${index + 1}. ${expense.description || expense.designation} - ${amount} FCFA (ID: ${expense.id})`);
        });
        
        console.log(`\n📈 Résumé:`);
        console.log(`   Nombre de dépenses: ${expensesResult.rows.length}`);
        console.log(`   Somme réelle: ${realTotal} FCFA`);
        console.log(`   Total enregistré: ${account.total_spent} FCFA`);
        console.log(`   Différence: ${parseInt(account.total_spent) - realTotal} FCFA`);
        
        if (parseInt(account.total_spent) !== realTotal) {
            console.log(`\n⚠️  INCOHÉRENCE DÉTECTÉE!`);
            console.log(`   Le trigger n'a peut-être pas fonctionné correctement lors de l'insertion.`);
        } else {
            console.log(`\n✅ Les totaux sont cohérents!`);
        }
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkMLC();
