const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function testDebit() {
    try {
        console.log('🔍 Test des opérations debit pour octobre 2025...\n');
        
        // Test 1: Toutes les opérations debit
        const allDebits = await pool.query(`
            SELECT 
                co.id,
                co.operation_date,
                co.operation_type,
                co.amount,
                cc.client_name,
                cc.is_active as client_active,
                a.account_name,
                a.account_type,
                a.is_active as account_active
            FROM creance_operations co
            JOIN creance_clients cc ON co.client_id = cc.id
            JOIN accounts a ON cc.account_id = a.id
            WHERE co.operation_type = 'debit'
            AND co.operation_date >= '2025-10-01'
            AND co.operation_date <= '2025-10-23'
            ORDER BY co.operation_date DESC
        `);
        
        console.log(`📊 Toutes les opérations debit: ${allDebits.rows.length}\n`);
        
        if (allDebits.rows.length > 0) {
            allDebits.rows.forEach(row => {
                console.log(`  ID: ${row.id}`);
                console.log(`  Date: ${row.operation_date.toISOString().split('T')[0]}`);
                console.log(`  Client: ${row.client_name} (actif: ${row.client_active})`);
                console.log(`  Montant: ${row.amount} FCFA`);
                console.log(`  Compte: ${row.account_name} (${row.account_type}, actif: ${row.account_active})`);
                console.log('  ---');
            });
        }
        
        // Test 2: Avec filtres (comme dans le serveur)
        const filteredDebits = await pool.query(`
            SELECT 
                COALESCE(SUM(co.amount), 0) as total
            FROM creance_operations co
            JOIN creance_clients cc ON co.client_id = cc.id
            JOIN accounts a ON cc.account_id = a.id
            WHERE co.operation_type = 'debit'
            AND co.operation_date >= '2025-10-01'
            AND co.operation_date <= '2025-10-23 23:59:59'
            AND a.account_type = 'creance' 
            AND a.is_active = true 
            AND cc.is_active = true
        `);
        
        console.log(`\n💰 Total avec filtres: ${filteredDebits.rows[0].total} FCFA\n`);
        
        // Test 3: Vérifier les types de comptes
        const accountTypes = await pool.query(`
            SELECT DISTINCT a.account_type, a.account_name, a.is_active
            FROM accounts a
            JOIN creance_clients cc ON cc.account_id = a.id
            JOIN creance_operations co ON co.client_id = cc.id
            WHERE co.operation_type = 'debit'
            AND co.operation_date >= '2025-10-01'
            AND co.operation_date <= '2025-10-23'
        `);
        
        console.log('📋 Types de comptes concernés:');
        accountTypes.rows.forEach(row => {
            console.log(`  - ${row.account_name}: type="${row.account_type}", actif=${row.is_active}`);
        });
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        await pool.end();
    }
}

testDebit();
