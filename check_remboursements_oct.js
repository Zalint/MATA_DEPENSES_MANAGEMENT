const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkRemboursements() {
    try {
        console.log('🔍 Vérification des remboursements pour octobre 2025...\n');
        
        // Requête pour obtenir les remboursements d'octobre 2025
        const result = await pool.query(`
            SELECT 
                co.id,
                co.operation_date,
                co.operation_type,
                co.amount,
                cc.client_name,
                a.account_name,
                a.account_type,
                a.is_active
            FROM creance_operations co
            JOIN creance_clients cc ON co.client_id = cc.id
            JOIN accounts a ON cc.account_id = a.id
            WHERE co.operation_type = 'remboursement'
            AND co.operation_date >= '2025-10-01'
            AND co.operation_date <= '2025-10-23'
            ORDER BY co.operation_date DESC
        `);
        
        console.log(`📊 Nombre de remboursements trouvés: ${result.rows.length}\n`);
        
        if (result.rows.length > 0) {
            console.log('📋 Liste des remboursements:\n');
            result.rows.forEach(row => {
                console.log(`  ID: ${row.id}`);
                console.log(`  Date: ${row.operation_date.toISOString().split('T')[0]}`);
                console.log(`  Client: ${row.client_name}`);
                console.log(`  Montant: ${row.amount} FCFA`);
                console.log(`  Compte: ${row.account_name} (${row.account_type})`);
                console.log(`  Compte actif: ${row.is_active}`);
                console.log('  ---');
            });
            
            const total = result.rows.reduce((sum, row) => sum + parseInt(row.amount), 0);
            console.log(`\n💰 Total remboursements: ${total} FCFA\n`);
        } else {
            console.log('❌ Aucun remboursement trouvé pour cette période\n');
        }
        
        // Vérifier avec les filtres actifs
        console.log('🔍 Vérification avec filtres (compte créance actif)...\n');
        const filteredResult = await pool.query(`
            SELECT 
                COALESCE(SUM(co.amount), 0) as remboursements_mois
            FROM creance_operations co
            JOIN creance_clients cc ON co.client_id = cc.id
            JOIN accounts a ON cc.account_id = a.id
            WHERE co.operation_type = 'remboursement'
            AND co.operation_date >= '2025-10-01'
            AND co.operation_date <= '2025-10-23 23:59:59'
            AND a.account_type = 'creance' 
            AND a.is_active = true 
            AND cc.is_active = true
        `);
        
        console.log(`💰 Total avec filtres: ${filteredResult.rows[0].remboursements_mois} FCFA\n`);
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        await pool.end();
    }
}

checkRemboursements();
