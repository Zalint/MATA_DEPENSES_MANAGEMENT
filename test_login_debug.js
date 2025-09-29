/**
 * Test de debug pour la route login qui timeout
 * Teste la connexion DB et la présence de l'utilisateur admin
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

async function debugLogin() {
    console.log('🔍 DEBUG LOGIN TIMEOUT');
    console.log('🔍 ==================');
    console.log('');

    // Configuration identique à server.js
    const dbConfig = process.env.URL ? {
        connectionString: process.env.URL,
        ssl: { rejectUnauthorized: false },
        max: 5,
        min: 1,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
        createRetryIntervalMillis: 500,
        statement_timeout: 60000,
        query_timeout: 60000
    } : {
        user: process.env.DB_USER || 'zalint',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'depenses_management',
        password: process.env.DB_PASSWORD || 'bonea2024',
        port: process.env.DB_PORT || 5432,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        statement_timeout: 300000,
        query_timeout: 300000,
        connectionTimeoutMillis: 60000,
        idleTimeoutMillis: 30000
    };

    console.log('🔗 Configuration:', process.env.URL ? 'Render.com URL' : 'Paramètres locaux');

    const pool = new Pool(dbConfig);

    try {
        console.log('⏱️ Étape 1: Test connexion basique...');
        const startConn = Date.now();
        const testConn = await pool.query('SELECT NOW()');
        console.log(`✅ Connexion OK en ${Date.now() - startConn}ms`);
        console.log('⏰ Heure DB:', testConn.rows[0].now.toLocaleString('fr-FR'));
        console.log('');

        console.log('⏱️ Étape 2: Vérification table users...');
        const startTable = Date.now();
        const tableExists = await pool.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')`
        );
        console.log(`✅ Vérification table en ${Date.now() - startTable}ms`);
        
        if (!tableExists.rows[0].exists) {
            console.log('❌ TABLE USERS N\'EXISTE PAS !');
            console.log('💡 Solution: Exécuter render_volaille_database_schema.sql');
            return;
        }
        console.log('✅ Table users EXISTS');
        console.log('');

        console.log('⏱️ Étape 3: Recherche utilisateur admin...');
        const startAdmin = Date.now();
        const adminResult = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            ['admin']
        );
        console.log(`✅ Recherche admin en ${Date.now() - startAdmin}ms`);

        if (adminResult.rows.length === 0) {
            console.log('❌ UTILISATEUR ADMIN N\'EXISTE PAS !');
            console.log('💡 Solution: Insérer l\'utilisateur admin');
            console.log('');
            
            console.log('🔧 Tentative d\'insertion admin...');
            const insertStart = Date.now();
            await pool.query(`
                INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES
                ('admin', '$2b$10$bsTWy5Rw8P3F4wBywmtgGOCQN5Qr3HbpW16RXQ4lUUEkfhyNbzNuC', 'Administrateur Système', 'admin', true)
                ON CONFLICT (username) DO UPDATE SET
                    password_hash = EXCLUDED.password_hash,
                    full_name = EXCLUDED.full_name,
                    role = EXCLUDED.role,
                    is_active = EXCLUDED.is_active
            `);
            console.log(`✅ Admin inséré en ${Date.now() - insertStart}ms`);
            console.log('');
            return;
        }

        const user = adminResult.rows[0];
        console.log('✅ Utilisateur admin trouvé:');
        console.log('   - ID:', user.id);
        console.log('   - Username:', user.username);
        console.log('   - Role:', user.role);
        console.log('   - Full name:', user.full_name);
        console.log('   - Is active:', user.is_active);
        console.log('');

        console.log('⏱️ Étape 4: Test bcrypt avec admin123...');
        const startBcrypt = Date.now();
        const validPassword = await bcrypt.compare('admin123', user.password_hash);
        console.log(`✅ Test bcrypt en ${Date.now() - startBcrypt}ms`);

        if (validPassword) {
            console.log('✅ Mot de passe admin123 VALIDE');
        } else {
            console.log('❌ Mot de passe admin123 INVALIDE');
            console.log('💡 Hash actuel:', user.password_hash);
            console.log('💡 Besoin de régénérer le hash');
        }

        console.log('');
        console.log('🎯 DIAGNOSTIC COMPLET:');
        console.log('✅ Connexion DB: OK');
        console.log('✅ Table users: EXISTS');
        console.log('✅ User admin: EXISTS');
        console.log('✅ Login devrait fonctionner');

        if (!validPassword) {
            console.log('⚠️ SEUL PROBLÈME: Mot de passe incorrect');
        }

    } catch (error) {
        console.error('❌ ERREUR CRITIQUE:', error.message);
        console.error('Type:', error.name);
        
        if (error.code) {
            console.error('Code PostgreSQL:', error.code);
        }

        if (error.message.includes('timeout')) {
            console.error('💡 PROBLÈME DE TIMEOUT CONFIRMÉ');
            console.error('   - Connexion trop lente');
            console.error('   - Base de données surchargée');
            console.error('   - Configuration pool restrictive');
        }

        if (error.code === '28P01') {
            console.error('💡 ERREUR AUTHENTIFICATION DB');
            console.error('   - URL de connexion incorrecte?');
            console.error('   - Utilisateur/mot de passe DB invalide?');
        }

    } finally {
        console.log('');
        console.log('🔌 Fermeture connexion...');
        await pool.end();
    }
}

debugLogin().catch(console.error);
