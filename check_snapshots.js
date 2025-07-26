const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'depenses_management',
    user: 'zalint',
    password: 'bonea2024'
});

async function checkSnapshots() {
    try {
        console.log('🔍 Vérification des snapshots dans la base de données...\n');
        
        // Vérifier tous les snapshots
        const result = await pool.query(`
            SELECT 
                snapshot_date, 
                pl_final,
                cash_bictorys_amount,
                creances_mois,
                stock_point_vente,
                stock_vivant_variation,
                livraisons_partenaires,
                monthly_burn,
                created_at
            FROM dashboard_snapshots 
            ORDER BY snapshot_date DESC 
            LIMIT 10
        `);
        
        console.log('📊 Derniers snapshots:');
        console.log('Date\t\t\tPL Final\t\tCréé le');
        console.log('----------------------------------------');
        
        result.rows.forEach(row => {
            const date = new Date(row.snapshot_date).toISOString().split('T')[0];
            const createdAt = new Date(row.created_at).toISOString().split('T')[0];
            console.log(`${date}\t${row.pl_final}\t${createdAt}`);
        });
        
        // Vérifier spécifiquement le 26/07
        console.log('\n🔍 Vérification spécifique pour 2025-07-26:');
        const specificResult = await pool.query(`
            SELECT 
                snapshot_date, 
                pl_final,
                created_at
            FROM dashboard_snapshots 
            WHERE snapshot_date = '2025-07-26'
        `);
        
        if (specificResult.rows.length > 0) {
            console.log('✅ Snapshot trouvé pour 2025-07-26:');
            specificResult.rows.forEach(row => {
                console.log(`   Date: ${row.snapshot_date}`);
                console.log(`   PL Final: ${row.pl_final}`);
                console.log(`   Créé le: ${row.created_at}`);
            });
        } else {
            console.log('❌ Aucun snapshot trouvé pour 2025-07-26');
        }
        
        // Vérifier les dates autour du 26/07
        console.log('\n🔍 Vérification des dates autour du 26/07:');
        const aroundResult = await pool.query(`
            SELECT 
                snapshot_date, 
                pl_final
            FROM dashboard_snapshots 
            WHERE snapshot_date >= '2025-07-25' AND snapshot_date <= '2025-07-27'
            ORDER BY snapshot_date
        `);
        
        console.log('📅 Snapshots autour du 26/07:');
        aroundResult.rows.forEach(row => {
            const date = new Date(row.snapshot_date).toISOString().split('T')[0];
            console.log(`   ${date}: PL = ${row.pl_final}`);
        });
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        await pool.end();
    }
}

checkSnapshots(); 