const { Pool } = require('pg');

const pool = new Pool({
    user: 'zalint',
    host: 'localhost',
    database: 'depenses_management_preprod',
    password: 'bonea2024',
    port: 5432
});

async function testTriggers() {
    const client = await pool.connect();
    
    try {
        console.log('🧪 TEST DES TRIGGERS\n');
        
        // État initial
        console.log('--- État initial du compte MLC ---');
        let check = await client.query(
            'SELECT current_balance, total_spent, total_credited FROM accounts WHERE id = 1605'
        );
        console.log('Solde:', check.rows[0].current_balance);
        console.log('Total dépensé:', check.rows[0].total_spent);
        console.log('Total crédité:', check.rows[0].total_credited);
        
        // Test 1: Ajouter une dépense de test
        console.log('\n--- Test 1: Ajout d\'une dépense de 1000 FCFA ---');
        await client.query(`
            INSERT INTO expenses (user_id, account_id, designation, amount, total, expense_date, description)
            VALUES (1, 1605, 'Test trigger', 1000, 1000, CURRENT_DATE, 'Test de trigger')
        `);
        
        check = await client.query(
            'SELECT current_balance, total_spent, total_credited FROM accounts WHERE id = 1605'
        );
        console.log('Solde après insertion:', check.rows[0].current_balance, '(attendu: 859000)');
        console.log('Total dépensé après insertion:', check.rows[0].total_spent, '(attendu: 141000)');
        
        // Test 2: Supprimer la dépense de test
        console.log('\n--- Test 2: Suppression de la dépense de test ---');
        await client.query(`
            DELETE FROM expenses WHERE account_id = 1605 AND description = 'Test de trigger'
        `);
        
        check = await client.query(
            'SELECT current_balance, total_spent, total_credited FROM accounts WHERE id = 1605'
        );
        console.log('Solde après suppression:', check.rows[0].current_balance, '(attendu: 860000)');
        console.log('Total dépensé après suppression:', check.rows[0].total_spent, '(attendu: 140000)');
        
        // Test 3: Ajouter un crédit de test
        console.log('\n--- Test 3: Ajout d\'un crédit de 5000 FCFA ---');
        await client.query(`
            INSERT INTO special_credit_history (account_id, amount, comment, created_at)
            VALUES (1605, 5000, 'Test trigger crédit', CURRENT_TIMESTAMP)
        `);
        
        check = await client.query(
            'SELECT current_balance, total_spent, total_credited FROM accounts WHERE id = 1605'
        );
        console.log('Solde après crédit:', check.rows[0].current_balance, '(attendu: 865000)');
        console.log('Total crédité après crédit:', check.rows[0].total_credited, '(attendu: 1005000)');
        
        // Test 4: Supprimer le crédit de test
        console.log('\n--- Test 4: Suppression du crédit de test ---');
        await client.query(`
            DELETE FROM special_credit_history WHERE account_id = 1605 AND comment = 'Test trigger crédit'
        `);
        
        check = await client.query(
            'SELECT current_balance, total_spent, total_credited FROM accounts WHERE id = 1605'
        );
        console.log('Solde après suppression crédit:', check.rows[0].current_balance, '(attendu: 860000)');
        console.log('Total crédité après suppression crédit:', check.rows[0].total_credited, '(attendu: 1000000)');
        
        console.log('\n✅ Tests terminés!');
        
    } catch (err) {
        console.error('❌ Erreur:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

testTriggers();
