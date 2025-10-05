/**
 * Script de vérification des tables en production
 * Teste que toutes les tables existent après le déploiement
 */

const { Client } = require('pg');

async function testProductionTables() {
    console.log('🧪 TEST VÉRIFICATION TABLES PRODUCTION');
    console.log('🧪 ====================================');
    console.log('');

    // Configuration de connexion
    const dbConfig = process.env.URL ? {
        connectionString: process.env.URL,
        ssl: { rejectUnauthorized: false }
    } : {
        user: process.env.DB_USER || 'zalint',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'depenses_management',
        password: process.env.DB_PASSWORD || 'bonea2024',
        port: process.env.DB_PORT || 5432,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

    console.log('🔗 Configuration:', process.env.URL ? 'URL complète' : 'Paramètres séparés');
    console.log('🌐 Environnement:', process.env.NODE_ENV || 'development');
    console.log('');

    const client = new Client(dbConfig);

    try {
        console.log('📡 Connexion à la base de données...');
        await client.connect();
        console.log('✅ Connexion réussie!');
        console.log('');

        // Tables critiques à vérifier
        const criticalTables = [
            'users',
            'accounts', 
            'expenses',
            'credit_history',
            'transfer_history',
            'partner_deliveries',
            'dashboard_snapshots',
            'creance_clients',
            'creance_operations',
            'cash_bictorys_mensuel',
            'financial_settings',
            'stock_vivant',
            'stock_mata'
        ];

        console.log('🔍 Vérification des tables...');
        console.log('');

        let allTablesExist = true;

        for (const tableName of criticalTables) {
            try {
                const result = await client.query(
                    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public')`,
                    [tableName]
                );
                
                if (result.rows[0].exists) {
                    // Compter les lignes pour avoir une idée du contenu
                    const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                    const count = countResult.rows[0].count;
                    console.log(`✅ ${tableName.padEnd(25)} - EXISTS (${count} records)`);
                } else {
                    console.log(`❌ ${tableName.padEnd(25)} - NOT FOUND!`);
                    allTablesExist = false;
                }
            } catch (error) {
                console.log(`❌ ${tableName.padEnd(25)} - ERROR: ${error.message}`);
                allTablesExist = false;
            }
        }

        console.log('');

        // Vérifier l'utilisateur admin
        try {
            const adminResult = await client.query(
                "SELECT username, full_name, role FROM users WHERE username = 'admin'"
            );
            
            if (adminResult.rows.length > 0) {
                const admin = adminResult.rows[0];
                console.log('👤 Utilisateur admin trouvé:');
                console.log(`   📧 Username: ${admin.username}`);
                console.log(`   👥 Nom: ${admin.full_name}`);
                console.log(`   🔑 Rôle: ${admin.role}`);
            } else {
                console.log('❌ Utilisateur admin NON TROUVÉ!');
                allTablesExist = false;
            }
        } catch (error) {
            console.log('❌ Erreur vérification admin:', error.message);
            allTablesExist = false;
        }

        console.log('');

        // Vérifier quelques paramètres financiers
        try {
            const settingsResult = await client.query(
                "SELECT setting_key, setting_value FROM financial_settings ORDER BY setting_key"
            );
            
            if (settingsResult.rows.length > 0) {
                console.log('⚙️ Paramètres financiers:');
                settingsResult.rows.forEach(setting => {
                    console.log(`   ${setting.setting_key}: ${setting.setting_value}`);
                });
            } else {
                console.log('⚠️ Aucun paramètre financier trouvé');
            }
        } catch (error) {
            console.log('❌ Erreur vérification paramètres:', error.message);
        }

        console.log('');

        // Résumé final
        if (allTablesExist) {
            console.log('🎉 ========================================');
            console.log('🎉 TOUTES LES TABLES SONT PRÉSENTES !');
            console.log('🎉 ========================================');
            console.log('✅ L\'application est prête pour la production');
            console.log('✅ Plus de risque de timeout sur création de tables');
            console.log('✅ Le script render_volaille_database_schema.sql a bien fonctionné');
        } else {
            console.log('❌ ========================================');
            console.log('❌ CERTAINES TABLES SONT MANQUANTES !');
            console.log('❌ ========================================');
            console.log('💡 Actions recommandées:');
            console.log('   1. Exécuter render_volaille_database_schema.sql');
            console.log('   2. Vérifier les permissions de l\'utilisateur DB');
            console.log('   3. Contrôler les logs de création de base');
        }

    } catch (error) {
        console.error('❌ ERREUR DE CONNEXION:', error.message);
        console.error('');
        console.error('💡 Vérifications:');
        console.error('   1. URL de connexion correcte?');
        console.error('   2. Base de données accessible?');
        console.error('   3. Permissions utilisateur?');
        process.exit(1);
    } finally {
        await client.end();
        console.log('');
        console.log('🔌 Connexion fermée');
    }
}

// Exécution
testProductionTables().catch(console.error);
