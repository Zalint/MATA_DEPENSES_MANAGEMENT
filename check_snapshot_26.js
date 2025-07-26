const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'depenses_management',
    user: 'zalint',
    password: 'bonea2024'
});

async function checkSnapshot26() {
    try {
        console.log('🔍 Vérification du snapshot du 26/07/2025...');
        
        // Vérifier si le snapshot du 26/07 existe
        const result = await pool.query(`
            SELECT 
                id,
                snapshot_date,
                pl_final,
                created_by,
                created_at
            FROM dashboard_snapshots 
            WHERE snapshot_date::date = '2025-07-26'::date
            ORDER BY snapshot_date
        `);
        
        console.log(`📊 Résultat: ${result.rows.length} snapshot(s) trouvé(s) pour le 26/07/2025`);
        
        if (result.rows.length > 0) {
            result.rows.forEach((row, index) => {
                console.log(`📅 Snapshot ${index + 1}:`);
                console.log(`   ID: ${row.id}`);
                console.log(`   Date: ${row.snapshot_date}`);
                console.log(`   PL Final: ${row.pl_final}`);
                console.log(`   Créé par: ${row.created_by}`);
                console.log(`   Créé le: ${row.created_at}`);
            });
        } else {
            console.log('❌ Aucun snapshot trouvé pour le 26/07/2025');
        }
        
        // Vérifier aussi la requête de visualisation
        console.log('\n🔍 Test de la requête de visualisation...');
        const visualisationResult = await pool.query(`
            SELECT
                snapshot_date as period,
                cash_bictorys_amount as cash_bictorys,
                creances_mois as creances,
                stock_point_vente as stock_pv,
                stock_vivant_variation as ecart_stock_vivant,
                COALESCE(livraisons_partenaires, 0) as livraisons_partenaires,
                monthly_burn as cash_burn,
                monthly_burn as cash_burn_monthly,
                weekly_burn as cash_burn_weekly,
                COALESCE(pl_final, 0) as pl_final
            FROM dashboard_snapshots
            WHERE snapshot_date::date >= '2025-04-27'::date AND snapshot_date::date <= '2025-07-26'::date
            ORDER BY snapshot_date
        `);
        
        console.log(`📊 Visualisation: ${visualisationResult.rows.length} snapshot(s) trouvé(s) de 2025-04-27 à 2025-07-26`);
        
        visualisationResult.rows.forEach((row, index) => {
            console.log(`📅 Ligne ${index + 1}: ${row.period} - PL: ${row.pl_final}`);
        });
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        await pool.end();
    }
}

checkSnapshot26(); 