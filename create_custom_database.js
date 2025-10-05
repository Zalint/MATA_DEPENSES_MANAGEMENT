const { Client } = require('pg');
const fs = require('fs');

// =====================================================
// 🔧 CONFIGURATION - MODIFIEZ CES VALEURS
// =====================================================
const DB_CONFIG = {
    // Paramètres de connexion PostgreSQL
    host: 'localhost',
    port: 5432,
    
    // 🎯 PERSONNALISEZ CES VALEURS :
    database: 'ma_nouvelle_base_db',        // ← VOTRE NOM DE BASE
    user: 'mon_utilisateur_db',             // ← VOTRE UTILISATEUR  
    password: 'MonMotDePasse2024',          // ← VOTRE MOT DE PASSE
    
    // Paramètres pour création initiale (connexion en tant que postgres)
    admin_user: 'postgres',                 // Utilisateur admin PostgreSQL
    admin_password: '',                     // Mot de passe admin (laisser vide si pas de mot de passe)
};

// =====================================================
// 🎯 ADMIN UTILISATEUR DE L'APPLICATION  
// =====================================================
const ADMIN_APP = {
    username: 'admin',
    password: 'admin123',  // Mot de passe pour se connecter à l'app
    full_name: 'Administrateur Système'
};

async function createCompleteDatabase() {
    console.log('🏗️  CRÉATION COMPLÈTE DE BASE DE DONNÉES');
    console.log('🏗️  ======================================');
    console.log(`🎯 Base de données : ${DB_CONFIG.database}`);
    console.log(`👤 Utilisateur DB : ${DB_CONFIG.user}`);
    console.log(`🔐 Admin app : ${ADMIN_APP.username}/${ADMIN_APP.password}`);
    console.log('');

    // ===== ÉTAPE 1: CRÉER LA BASE DE DONNÉES =====
    console.log('📍 ÉTAPE 1: Création de la base de données...');
    
    const adminClient = new Client({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        database: 'postgres', // Connexion à la base postgres par défaut
        user: DB_CONFIG.admin_user,
        password: DB_CONFIG.admin_password
    });

    try {
        await adminClient.connect();
        console.log('✅ Connecté en tant qu\\'admin PostgreSQL');

        // Supprimer la base si elle existe déjà
        console.log('🗑️  Suppression de la base existante (si elle existe)...');
        try {
            await adminClient.query(`DROP DATABASE IF EXISTS ${DB_CONFIG.database}`);
            console.log('✅ Base supprimée');
        } catch (error) {
            console.log('ℹ️  Base n\\'existait pas');
        }

        // Créer la nouvelle base
        console.log('🏗️  Création de la nouvelle base...');
        await adminClient.query(`CREATE DATABASE ${DB_CONFIG.database}`);
        console.log('✅ Base créée avec succès');

        // Créer l'utilisateur s'il n'existe pas
        console.log('👤 Création de l\\'utilisateur...');
        try {
            await adminClient.query(`CREATE USER ${DB_CONFIG.user} WITH PASSWORD '${DB_CONFIG.password}'`);
            console.log('✅ Utilisateur créé');
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('ℹ️  Utilisateur existe déjà, mise à jour du mot de passe...');
                await adminClient.query(`ALTER USER ${DB_CONFIG.user} WITH PASSWORD '${DB_CONFIG.password}'`);
                console.log('✅ Mot de passe mis à jour');
            } else {
                throw error;
            }
        }

        // Accorder les permissions
        console.log('🔐 Attribution des permissions...');
        await adminClient.query(`GRANT ALL PRIVILEGES ON DATABASE ${DB_CONFIG.database} TO ${DB_CONFIG.user}`);
        console.log('✅ Permissions accordées');

    } finally {
        await adminClient.end();
    }

    // ===== ÉTAPE 2: CRÉER LES TABLES =====
    console.log('\\n📍 ÉTAPE 2: Création des tables et structure...');
    
    const appClient = new Client(DB_CONFIG);
    
    try {
        await appClient.connect();
        console.log('✅ Connecté à la nouvelle base de données');

        // Lire le script SQL
        console.log('📖 Lecture du script SQL...');
        const sqlScript = fs.readFileSync('create_complete_database_schema.sql', 'utf8');
        
        // Remplacer les paramètres dans le script
        let customizedScript = sqlScript
            .replace(/zalint/g, DB_CONFIG.user)
            .replace(/bonea2024/g, DB_CONFIG.password)
            .replace(/matavolaille_db/g, DB_CONFIG.database);

        console.log('🔄 Script personnalisé avec vos paramètres');

        // Exécuter le script
        console.log('🚀 Exécution du script de création...');
        await appClient.query(customizedScript);
        
        console.log('✅ Tables créées avec succès');

        // ===== ÉTAPE 3: VÉRIFIER LA CRÉATION =====
        console.log('\\n📍 ÉTAPE 3: Vérification...');
        
        const tableCount = await appClient.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        
        const adminCheck = await appClient.query(`
            SELECT username, role, is_active 
            FROM users 
            WHERE username = $1
        `, [ADMIN_APP.username]);

        console.log(`📊 Tables créées: ${tableCount.rows[0].count}`);
        
        if (adminCheck.rows.length > 0) {
            console.log('👤 Utilisateur admin app: ✅ Créé');
            console.log(`   Username: ${adminCheck.rows[0].username}`);
            console.log(`   Role: ${adminCheck.rows[0].role}`);
            console.log(`   Actif: ${adminCheck.rows[0].is_active}`);
        }

        console.log('\\n🎉 ====================================');
        console.log('🎉 CRÉATION TERMINÉE AVEC SUCCÈS !');
        console.log('🎉 ====================================');
        console.log('📋 INFORMATIONS DE CONNEXION:');
        console.log(`   🗄️  Base de données: ${DB_CONFIG.database}`);
        console.log(`   🖥️  Host: ${DB_CONFIG.host}:${DB_CONFIG.port}`);
        console.log(`   👤 Utilisateur DB: ${DB_CONFIG.user}`);
        console.log(`   🔑 Mot de passe DB: ${DB_CONFIG.password}`);
        console.log('');
        console.log('🔐 CONNEXION À L\\'APPLICATION:');
        console.log(`   👤 Username: ${ADMIN_APP.username}`);
        console.log(`   🔑 Password: ${ADMIN_APP.password}`);
        console.log('');
        console.log('🚀 Votre base de données est prête à l\\'emploi !');

    } finally {
        await appClient.end();
    }
}

// Exécution
createCompleteDatabase().catch(console.error);
