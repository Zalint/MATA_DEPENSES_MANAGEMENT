const { Pool } = require('pg');

// Configuration de la base de données
const pool = new Pool({
    user: process.env.DB_USER || 'zalint',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'depenses_management',
    password: process.env.DB_PASSWORD || 'bonea2024',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testStockSystem() {
    try {
        console.log('🔄 Test du système de gestion des stocks...\n');

        // 1. Créer la table stock_mata
        console.log('1. Création de la table stock_mata...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stock_soir (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                point_de_vente VARCHAR(100) NOT NULL,
                produit VARCHAR(100) NOT NULL,
                stock_matin DECIMAL(15,2) DEFAULT 0,
                stock_soir DECIMAL(15,2) DEFAULT 0,
                transfert DECIMAL(15,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Créer les index
        console.log('2. Création des index...');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_stock_mata_date ON stock_mata(date);
            CREATE INDEX IF NOT EXISTS idx_stock_mata_point_vente ON stock_mata(point_de_vente);
            CREATE INDEX IF NOT EXISTS idx_stock_mata_produit ON stock_mata(produit);
            CREATE INDEX IF NOT EXISTS idx_stock_mata_date_point ON stock_mata(date, point_de_vente);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_mata_unique 
            ON stock_mata(date, point_de_vente, produit);
        `);

        // 3. Créer la fonction de mise à jour du timestamp
        console.log('3. Création de la fonction de mise à jour...');
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_stock_mata_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 4. Créer le trigger
        console.log('4. Création du trigger...');
        await pool.query(`
            DROP TRIGGER IF EXISTS update_stock_mata_updated_at ON stock_mata;
            CREATE TRIGGER update_stock_mata_updated_at
                BEFORE UPDATE ON stock_mata
                FOR EACH ROW
                EXECUTE FUNCTION update_stock_mata_updated_at();
        `);

        // 5. Insérer des données de test
        console.log('5. Insertion de données de test...');
        const testData = [
            ['2025-01-20', 'Mbao', 'Boeuf', 336735.33, 86899.44, 0],
            ['2025-01-20', 'Mbao', 'Poulet', 176800, 176800, 0],
            ['2025-01-20', 'Mbao', 'Tablette', 25000, 12500, 0],
            ['2025-01-20', 'O.Foire', 'Boeuf', 175767.81, 0, 0],
            ['2025-01-20', 'O.Foire', 'Poulet', 697000, 567800, 0],
            ['2025-01-20', 'Keur Massar', 'Boeuf', 59940, 0, 0],
            ['2025-01-20', 'Keur Massar', 'Poulet', 95200, 88400, 0]
        ];

        for (const data of testData) {
            await pool.query(`
                INSERT INTO stock_mata (date, point_de_vente, produit, stock_matin, stock_soir, transfert)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (date, point_de_vente, produit) DO NOTHING
            `, data);
        }

        // 6. Vérifier les données
        console.log('6. Vérification des données...');
        const result = await pool.query(`
            SELECT 
                point_de_vente,
                COUNT(*) as nombre_produits,
                SUM(stock_matin) as total_stock_matin,
                SUM(stock_soir) as total_stock_soir,
                SUM(transfert) as total_transfert,
                SUM(stock_matin - stock_soir + transfert) as total_ventes_theoriques
            FROM stock_mata 
            WHERE date = '2025-01-20'
            GROUP BY point_de_vente 
            ORDER BY point_de_vente
        `);

        console.log('\n📊 Statistiques des données de test :');
        console.log('=======================================');
        result.rows.forEach(row => {
            console.log(`${row.point_de_vente}:`);
            console.log(`  - Nombre de produits: ${row.nombre_produits}`);
            console.log(`  - Stock matin total: ${parseFloat(row.total_stock_matin).toLocaleString()} FCFA`);
            console.log(`  - Stock soir total: ${parseFloat(row.total_stock_soir).toLocaleString()} FCFA`);
            console.log(`  - Transfert total: ${parseFloat(row.total_transfert).toLocaleString()} FCFA`);
            console.log(`  - Ventes théoriques: ${parseFloat(row.total_ventes_theoriques).toLocaleString()} FCFA\n`);
        });

        // 7. Test des opérations CRUD
        console.log('7. Test des opérations CRUD...');
        
        // Test INSERT
        const insertResult = await pool.query(`
            INSERT INTO stock_mata (date, point_de_vente, produit, stock_matin, stock_soir, transfert)
            VALUES ('2025-01-21', 'Test Point', 'Test Produit', 1000, 500, 100)
            RETURNING *
        `);
        console.log('✅ INSERT réussi:', insertResult.rows[0]);

        // Test UPDATE
        const updateResult = await pool.query(`
            UPDATE stock_mata 
            SET stock_soir = 400, transfert = 200 
            WHERE id = $1
            RETURNING *
        `, [insertResult.rows[0].id]);
        console.log('✅ UPDATE réussi:', updateResult.rows[0]);

        // Test SELECT
        const selectResult = await pool.query(`
            SELECT * FROM stock_mata WHERE id = $1
        `, [insertResult.rows[0].id]);
        console.log('✅ SELECT réussi:', selectResult.rows[0]);

        // Test DELETE
        const deleteResult = await pool.query(`
            DELETE FROM stock_mata WHERE id = $1 RETURNING *
        `, [insertResult.rows[0].id]);
        console.log('✅ DELETE réussi:', deleteResult.rows[0]);

        console.log('\n🎉 Tous les tests sont passés avec succès !');
        console.log('\n📋 Instructions pour utiliser la nouvelle fonctionnalité :');
        console.log('========================================================');
        console.log('1. Connectez-vous avec un compte Directeur Général, PCA ou Admin');
        console.log('2. Le menu "Gestion Stock" apparaîtra dans la barre latérale');
        console.log('3. Vous pouvez :');
        console.log('   - Importer un fichier JSON de réconciliation');
        console.log('   - Ajouter manuellement des entrées de stock');
        console.log('   - Modifier les entrées existantes');
        console.log('   - Supprimer des entrées');
        console.log('   - Filtrer par date et point de vente');
        console.log('   - Voir les statistiques par point de vente');

    } catch (error) {
        console.error('❌ Erreur lors du test:', error);
    } finally {
        await pool.end();
    }
}

testStockSystem(); 