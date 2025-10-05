const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

/**
 * Script d'exécution automatisée pour la base de données Render.com
 * 
 * VARIABLES D'ENVIRONNEMENT REQUISES (depuis Render.com):
 * - URL: URL complète de connexion PostgreSQL
 * 
 * VARIABLES OPTIONNELLES (pour configuration séparée):
 * - DB_HOST: Host de la base de données
 * - DB_PORT: Port de la base de données
 * - DB_NAME: Nom de la base de données  
 * - DB_USER: Utilisateur de la base de données
 * - DB_PASSWORD: Mot de passe de la base de données
 * 
 * UTILISATION:
 * node execute_render_schema.js test    # Test de connexion
 * node execute_render_schema.js execute # Exécution complète
 */

// Configuration Render.com (lecture depuis les variables d'environnement)
const RENDER_CONFIG = {
    connectionString: process.env.DATABASE_URL || 'postgresql://depenses_management_volaille_prod_user:EYt38Huhq3zDZXtrQIutzqBUTaCO28mh@dpg-d3d951buibrs738fknpg-a.frankfurt-postgres.render.com/depenses_management_volaille_prod',
    ssl: {
        rejectUnauthorized: false  // Nécessaire pour Render.com
    }
};

// Configuration alternative (paramètres séparés depuis variables d'environnement)
const RENDER_CONFIG_ALT = {
    host: process.env.DB_HOST || 'dpg-d3d951buibrs738fknpg-a.frankfurt-postgres.render.com',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'depenses_management_volaille_prod',
    user: process.env.DB_USER || 'depenses_management_volaille_prod_user',
    password: process.env.DB_PASSWORD || 'EYt38Huhq3zDZXtrQIutzqBUTaCO28mh',
    ssl: {
        rejectUnauthorized: false
    }
};

async function executeRenderSchema() {
    console.log('🚀 EXÉCUTION DU SCHÉMA BASE RENDER.COM');
    console.log('🚀 ===================================');
    console.log('');
    
    let client;
    
    try {
        // Créer le client PostgreSQL
        console.log('🔧 Configuration de la connexion Render.com...');
        console.log('   🌐 URL depuis variable d\'environnement: ' + (process.env.URL ? 'URL configurée' : 'URL par défaut'));
        client = new Client(RENDER_CONFIG);
        
        // Connexion à la base
        console.log('📡 Connexion à la base de données...');
        console.log('   🌐 Host: ' + (process.env.DB_HOST || 'dpg-d3d951buibrs738fknpg-a.frankfurt-postgres.render.com'));
        console.log('   📊 Database: ' + (process.env.DB_NAME || 'depenses_management_volaille_prod'));
        console.log('   👤 User: ' + (process.env.DB_USER || 'depenses_management_volaille_prod_user'));
        console.log('');
        
        await client.connect();
        console.log('✅ Connexion établie avec succès!');
        
        // Lire le script SQL
        const scriptPath = 'render_volaille_database_schema.sql';
        console.log('📖 Lecture du script:', scriptPath);
        
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Script non trouvé: ${scriptPath}`);
        }
        
        const script = fs.readFileSync(scriptPath, 'utf8');
        console.log('✅ Script chargé (' + Math.round(script.length / 1024) + ' KB)');
        
        // Exécuter le script
        console.log('');
        console.log('⚡ Exécution du schéma de base de données...');
        console.log('   📋 Création des tables...');
        console.log('   🔧 Configuration des indexes...');
        console.log('   👤 Création de l\'utilisateur admin...');
        console.log('   ⚙️ Configuration des paramètres...');
        console.log('');
        
        const result = await client.query(script);
        
        console.log('✅ Script exécuté avec succès!');
        
        // Vérifier les tables créées
        console.log('');
        console.log('🔍 Vérification des tables créées...');
        
        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `;
        
        const tablesResult = await client.query(tablesQuery);
        const tableCount = tablesResult.rows.length;
        
        console.log(`📊 ${tableCount} tables créées:`);
        tablesResult.rows.forEach((row, index) => {
            console.log(`   ${(index + 1).toString().padStart(2, ' ')}. ${row.table_name}`);
        });
        
        // Vérifier l'utilisateur admin
        console.log('');
        console.log('👤 Vérification de l\'utilisateur admin...');
        
        const adminCheck = await client.query(
            "SELECT username, full_name, role FROM users WHERE username = 'admin'"
        );
        
        if (adminCheck.rows.length > 0) {
            const admin = adminCheck.rows[0];
            console.log('✅ Utilisateur admin créé avec succès:');
            console.log(`   📧 Username: ${admin.username}`);
            console.log(`   👥 Nom complet: ${admin.full_name}`);
            console.log(`   🔑 Rôle: ${admin.role}`);
            console.log(`   🔐 Mot de passe: Mata@2024!`);
        }
        
        // Afficher le résumé final
        console.log('');
        console.log('🎉 ================================================');
        console.log('🎉 SCHÉMA RENDER.COM INSTALLÉ AVEC SUCCÈS !');
        console.log('🎉 ================================================');
        console.log('');
        console.log('📊 Base de données: ' + (process.env.DB_NAME || 'depenses_management_volaille_prod'));
        console.log('🌐 Host: ' + (process.env.DB_HOST || 'dpg-d3d951buibrs738fknpg-a.frankfurt-postgres.render.com'));
        console.log('📋 Tables créées: ' + tableCount);
        console.log('👤 Admin user: admin/Mata@2024!');
        console.log('✅ Prêt pour la production!');
        console.log('');
        console.log('🚀 Prochaines étapes:');
        console.log('   1. Tester la connexion avec admin/Mata@2024!');
        console.log('   2. Configurer votre application Node.js');
        console.log('   3. Déployer en production');
        console.log('');
        
    } catch (error) {
        console.error('');
        console.error('❌ ERREUR LORS DE L\'EXÉCUTION');
        console.error('❌ ============================');
        console.error('');
        
        if (error.code === 'ECONNREFUSED') {
            console.error('🌐 Erreur de connexion:');
            console.error('   - Vérifiez que l\'host Render.com est accessible');
            console.error('   - Contrôlez votre connexion internet');
            console.error('');
        } else if (error.code === '28P01') {
            console.error('🔐 Erreur d\'authentification:');
            console.error('   - Vérifiez le nom d\'utilisateur et mot de passe');
            console.error('   - Contrôlez l\'URL de connexion Render.com');
            console.error('');
        } else if (error.code === '3D000') {
            console.error('📊 Base de données introuvable:');
            console.error('   - Vérifiez le nom de la base de données');
            console.error('   - Contrôlez que la base existe sur Render.com');
            console.error('');
        } else {
            console.error('⚠️  Erreur générale:');
            console.error('   Message:', error.message);
            if (error.code) console.error('   Code:', error.code);
            console.error('');
        }
        
        console.error('💡 Solutions possibles:');
        console.error('   1. Vérifier les paramètres de connexion Render.com');
        console.error('   2. Contrôler que la base de données est active');
        console.error('   3. Tester la connexion depuis pgAdmin/DBeaver');
        console.error('   4. Consulter les logs Render.com');
        console.error('');
        
        process.exit(1);
        
    } finally {
        if (client) {
            await client.end();
            console.log('🔌 Connexion fermée');
        }
    }
}

// Fonction utilitaire pour tester uniquement la connexion
async function testRenderConnection() {
    console.log('🧪 TEST DE CONNEXION RENDER.COM');
    console.log('🧪 =============================');
    console.log('');
    
    let client;
    
    try {
        client = new Client(RENDER_CONFIG);
        
        console.log('📡 Test de connexion...');
        await client.connect();
        
        console.log('✅ Connexion réussie!');
        
        const result = await client.query('SELECT version(), current_database(), current_user');
        const info = result.rows[0];
        
        console.log('');
        console.log('📊 Informations de la base:');
        console.log('   PostgreSQL:', info.version.split(' ')[1]);
        console.log('   Base:', info.current_database);
        console.log('   Utilisateur:', info.current_user);
        console.log('');
        console.log('✅ Test de connexion réussi!');
        
    } catch (error) {
        console.error('❌ Échec du test de connexion:', error.message);
        process.exit(1);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Interface en ligne de commande
const command = process.argv[2];

if (command === 'test') {
    testRenderConnection();
} else if (command === 'execute' || !command) {
    executeRenderSchema();
} else {
    console.log('');
    console.log('📋 UTILISATION DU SCRIPT RENDER.COM');
    console.log('📋 =================================');
    console.log('');
    console.log('Commandes disponibles:');
    console.log('  node execute_render_schema.js          - Exécuter le schéma complet');
    console.log('  node execute_render_schema.js execute  - Exécuter le schéma complet');
    console.log('  node execute_render_schema.js test     - Tester uniquement la connexion');
    console.log('');
    console.log('Configuration:');
    console.log('  Host: dpg-d3d951buibrs738fknpg-a.frankfurt-postgres.render.com');
    console.log('  Base: depenses_management_volaille_prod');
    console.log('  User: depenses_management_volaille_prod_user');
    console.log('');
}
