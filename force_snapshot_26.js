const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'depenses_management',
    user: 'zalint',
    password: 'bonea2024'
});

async function forceSnapshot26() {
    try {
        console.log('🔧 Forçage de l\'affichage du snapshot 26/07...\n');
        
        // Vérifier d'abord que le snapshot existe
        const checkResult = await pool.query(`
            SELECT snapshot_date, pl_final, created_at
            FROM dashboard_snapshots 
            WHERE snapshot_date = '2025-07-26'
        `);
        
        if (checkResult.rows.length === 0) {
            console.log('❌ Aucun snapshot trouvé pour 2025-07-26');
            return;
        }
        
        console.log('✅ Snapshot 26/07 trouvé:');
        console.log(`   Date: ${checkResult.rows[0].snapshot_date}`);
        console.log(`   PL Final: ${checkResult.rows[0].pl_final}`);
        console.log(`   Créé le: ${checkResult.rows[0].created_at}`);
        
        // Simuler la requête de la visualisation PL avec des dates étendues
        console.log('\n🔍 Test de la requête visualisation PL avec dates étendues...');
        
        const testQueries = [
            {
                name: 'Test 1: 2025-04-27 à 2025-07-26',
                start: '2025-04-27',
                end: '2025-07-26'
            },
            {
                name: 'Test 2: 2025-07-01 à 2025-07-31',
                start: '2025-07-01',
                end: '2025-07-31'
            },
            {
                name: 'Test 3: 2025-07-20 à 2025-07-30',
                start: '2025-07-20',
                end: '2025-07-30'
            }
        ];
        
        for (const test of testQueries) {
            console.log(`\n📊 ${test.name}:`);
            
            const result = await pool.query(`
                SELECT 
                    snapshot_date as period,
                    pl_final
                FROM dashboard_snapshots
                WHERE snapshot_date >= $1 AND snapshot_date <= $2
                ORDER BY snapshot_date
            `, [test.start, test.end]);
            
            console.log(`   Résultats: ${result.rows.length} snapshots`);
            result.rows.forEach(row => {
                const date = new Date(row.period).toISOString().split('T')[0];
                console.log(`   ${date}: PL = ${row.pl_final}`);
            });
        }
        
        // Test spécifique pour voir pourquoi le 26/07 n'apparaît pas
        console.log('\n🔍 Test spécifique pour 2025-07-26:');
        const specificResult = await pool.query(`
            SELECT 
                snapshot_date,
                pl_final,
                snapshot_date::text as date_text,
                snapshot_date::date as date_only
            FROM dashboard_snapshots
            WHERE snapshot_date::date = '2025-07-26'::date
        `);
        
        console.log(`Résultats avec date::date: ${specificResult.rows.length}`);
        specificResult.rows.forEach(row => {
            console.log(`   Date: ${row.snapshot_date}`);
            console.log(`   Date text: ${row.date_text}`);
            console.log(`   Date only: ${row.date_only}`);
            console.log(`   PL: ${row.pl_final}`);
        });
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        await pool.end();
    }
}

forceSnapshot26(); 