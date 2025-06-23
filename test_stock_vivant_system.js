const { Pool } = require('pg');
const fs = require('fs');

// Configuration de la base de données
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost', 
    database: process.env.DB_NAME || 'depenses_management',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

async function testStockVivantSystem() {
    console.log('🧪 TEST DU SYSTÈME STOCK VIVANT');
    console.log('==================================');

    try {
        // 1. Créer les tables
        console.log('\n1. Création des tables...');
        
        // Table principale
        const stockVivantTableSQL = fs.readFileSync('./create_stock_vivant_table.sql', 'utf8');
        await pool.query(stockVivantTableSQL);
        console.log('✅ Table stock_vivant créée');

        // Table des permissions
        const permissionsTableSQL = fs.readFileSync('./create_stock_vivant_permissions.sql', 'utf8');
        await pool.query(permissionsTableSQL);
        console.log('✅ Table stock_vivant_permissions créée');

        // 2. Tester les permissions
        console.log('\n2. Test des permissions...');
        
        // Vérifier un utilisateur DG
        const dgTest = await pool.query(
            'SELECT can_access_stock_vivant($1) as can_access',
            [1] // Supposons ID 1 = DG
        );
        console.log('✅ Test permission DG:', dgTest.rows[0].can_access);

        // 3. Insérer des données de test
        console.log('\n3. Insertion de données de test...');
        
        const testData = [
            {
                date_stock: '2025-01-15',
                categorie: 'Ovin',
                produit: 'Brebis',
                quantite: 25,
                prix_unitaire: 45000,
                total: 25 * 45000,
                commentaire: 'Stock initial test'
            },
            {
                date_stock: '2025-01-15',
                categorie: 'Ovin',
                produit: 'Belier',
                quantite: 8,
                prix_unitaire: 65000,
                total: 8 * 65000,
                commentaire: 'Stock initial test'
            },
            {
                date_stock: '2025-01-15',
                categorie: 'Caprin',
                produit: 'Chevere',
                quantite: 15,
                prix_unitaire: 25000,
                total: 15 * 25000,
                commentaire: 'Stock initial test'
            },
            {
                date_stock: '2025-01-15',
                categorie: 'Aliments',
                produit: 'PailleArachide',
                quantite: 500,
                prix_unitaire: 150,
                total: 500 * 150,
                commentaire: 'Stock aliments test'
            }
        ];

        let insertedCount = 0;
        for (const item of testData) {
            try {
                await pool.query(`
                    INSERT INTO stock_vivant (date_stock, categorie, produit, quantite, prix_unitaire, total, commentaire)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [item.date_stock, item.categorie, item.produit, item.quantite, item.prix_unitaire, item.total, item.commentaire]);
                insertedCount++;
            } catch (error) {
                if (error.code === '23505') { // Violation contrainte unique
                    console.log(`⚠️  Entrée déjà existante: ${item.categorie} - ${item.produit}`);
                } else {
                    throw error;
                }
            }
        }
        console.log(`✅ ${insertedCount} nouvelles entrées ajoutées`);

        // 4. Tester les requêtes principales
        console.log('\n4. Test des requêtes...');
        
        // Récupérer les données par date
        const dataByDate = await pool.query(
            'SELECT * FROM stock_vivant WHERE date_stock = $1 ORDER BY categorie, produit',
            ['2025-01-15']
        );
        console.log(`✅ Données pour le 15/01/2025: ${dataByDate.rows.length} entrées`);

        // Récupérer les dates disponibles
        const dates = await pool.query(
            "SELECT DISTINCT TO_CHAR(date_stock, 'YYYY-MM-DD') as date FROM stock_vivant ORDER BY date DESC"
        );
        console.log(`✅ Dates disponibles: ${dates.rows.length} dates`);

        // 5. Calculer les totaux par catégorie
        console.log('\n5. Calculs par catégorie...');
        
        const totals = await pool.query(`
            SELECT 
                categorie,
                COUNT(*) as nb_produits,
                SUM(quantite) as total_quantite,
                SUM(total) as total_valeur
            FROM stock_vivant 
            WHERE date_stock = $1 
            GROUP BY categorie 
            ORDER BY total_valeur DESC
        `, ['2025-01-15']);

        console.log('📊 Résumé par catégorie:');
        totals.rows.forEach(row => {
            console.log(`  - ${row.categorie}: ${row.nb_produits} produits, ${row.total_quantite} unités, ${parseInt(row.total_valeur).toLocaleString()} FCFA`);
        });

        // 6. Test de mise à jour en masse
        console.log('\n6. Test mise à jour en masse...');
        
        await pool.query('BEGIN');
        
        // Simuler une mise à jour de stock
        const updates = [
            { categorie: 'Ovin', produit: 'Brebis', quantite: 23, prix_unitaire: 45000 },
            { categorie: 'Ovin', produit: 'Belier', quantite: 7, prix_unitaire: 65000 }
        ];

        let updatedCount = 0;
        for (const update of updates) {
            const result = await pool.query(`
                UPDATE stock_vivant 
                SET quantite = $1, prix_unitaire = $2, total = $1 * $2, updated_at = CURRENT_TIMESTAMP
                WHERE date_stock = $3 AND categorie = $4 AND produit = $5
            `, [update.quantite, update.prix_unitaire, '2025-01-15', update.categorie, update.produit]);
            
            updatedCount += result.rowCount;
        }

        await pool.query('COMMIT');
        console.log(`✅ ${updatedCount} entrées mises à jour`);

        // 7. Vérification de la configuration JSON
        console.log('\n7. Vérification configuration...');
        
        try {
            const config = require('./stock_vivant_config.json');
            console.log('✅ Configuration JSON chargée:');
            console.log(`  - ${Object.keys(config.categories).length} catégories`);
            console.log(`  - ${Object.keys(config.labels).length} labels`);
            
            // Vérifier cohérence
            const totalProducts = Object.values(config.categories).reduce((sum, products) => sum + products.length, 0);
            console.log(`  - ${totalProducts} produits au total`);
        } catch (error) {
            console.log('❌ Erreur chargement configuration:', error.message);
        }

        // 8. Test de nettoyage (optionnel)
        console.log('\n8. Statistiques finales...');
        
        const finalStats = await pool.query(`
            SELECT 
                COUNT(*) as total_entries,
                COUNT(DISTINCT date_stock) as unique_dates,
                COUNT(DISTINCT categorie) as unique_categories,
                SUM(total) as total_value
            FROM stock_vivant
        `);

        const stats = finalStats.rows[0];
        console.log('📈 Statistiques système:');
        console.log(`  - Total entrées: ${stats.total_entries}`);
        console.log(`  - Dates uniques: ${stats.unique_dates}`);
        console.log(`  - Catégories: ${stats.unique_categories}`);
        console.log(`  - Valeur totale: ${parseInt(stats.total_value || 0).toLocaleString()} FCFA`);

        console.log('\n🎉 TOUS LES TESTS RÉUSSIS!');
        console.log('Le système Stock Vivant est opérationnel.');

    } catch (error) {
        console.error('❌ ERREUR DURANT LES TESTS:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Lancer les tests
if (require.main === module) {
    testStockVivantSystem();
}

module.exports = { testStockVivantSystem }; 